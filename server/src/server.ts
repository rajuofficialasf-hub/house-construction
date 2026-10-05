import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createDb } from './db.js';
import { createLogger } from './logger.js';

function start(): void {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger(config.LOG_LEVEL);
  const sql = createDb(config.DATABASE_URL);
  const app = createApp({ sql, logger, trustProxy: config.TRUST_PROXY });
  const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'housing API listening'));

  // Stop taking new connections, let in-flight requests finish, then close the pool (NE-ERR-04).
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, 'shutting down');
    server.close((err) => {
      sql
        .end({ timeout: 5 })
        .then(() => process.exit(err ? 1 : 0))
        .catch((endErr: unknown) => {
          logger.error({ err: endErr }, 'failed to close the database pool');
          process.exit(1);
        });
    });
    server.closeIdleConnections();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
