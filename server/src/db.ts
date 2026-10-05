import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

/** Opens a connection pool. Create one per process and share it (DB-Q-06). */
export function createDb(url: string): Sql {
  return postgres(url, {
    max: 10,
    connect_timeout: 5,
    idle_timeout: 30,
    onnotice: () => {},
  });
}

/** The admin a write is done for. The activity-log trigger reads it through housing_current_actor(). */
export interface Actor {
  id: string;
  email: string;
}

/**
 * Runs fn in one transaction with the actor set for the activity log. The settings are
 * transaction-local, so they can't leak to the next query on the same pooled connection.
 */
export async function withActor<T>(sql: Sql, actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  // postgres.js types begin()'s result as an unwrapped promise array; fn returns a plain value.
  return (await sql.begin(async (tx) => {
    await tx`select set_config('app.actor_id', ${actor.id}, true), set_config('app.actor_email', ${actor.email}, true)`;
    return fn(tx);
  })) as T;
}

/** Resolves when the database answers `select 1`, and rejects on failure or after timeoutMs. */
export async function pingDb(sql: Sql, timeoutMs = 2000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`database ping timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([sql`select 1`, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
