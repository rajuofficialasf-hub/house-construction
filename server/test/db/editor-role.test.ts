import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withActor, type Sql, type Tx } from '../../src/db.js';
import { appDb, insertAdmin, insertProject, ownerDb, resetTestData } from '../support/db.js';

// The editor role, its project assignments, the scope function and the save function from
// server/db/migrations/0019_editor_role.sql. The seeded registry is the housing group with the
// semi_pucca and tin leaves.

const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const keysOf = async (adminId: string) => {
  const [row] = await app<{ keys: string[] }[]>`select public.housing_admin_project_keys(${adminId}) as keys`;
  return row?.keys;
};

const assigned = (adminId: string) =>
  owner`select project_key from public.housing_admin_projects where admin_id = ${adminId} order by project_key`.then((rows) =>
    rows.map((r) => r.project_key as string),
  );

interface SaveInput {
  email: string;
  role?: string;
  allProjects?: boolean;
  projects?: string[];
  active?: boolean;
}

function save(sql: Sql | Tx, { email, role = 'editor', allProjects = false, projects = [], active = true }: SaveInput) {
  return sql<{ id: string }[]>`
    select public.housing_admin_user_save(${email}, ${role}, ${allProjects}, ${projects}, ${active}) as id`;
}

/** Saves as the main admin through the app role, the way the users route does. */
async function saveAsMain(input: SaveInput) {
  const main = await mainAdmin();
  return withActor(app, main, (tx) => save(tx, input));
}

/** The main admin, inserted on first use in each test. */
async function mainAdmin(): Promise<{ id: string; email: string }> {
  const [row] = await owner<{ id: string; email: string }[]>`select id, email from public.housing_admins where role = 'main_admin'`;
  return row ?? insertAdmin(owner, { email: 'main@example.org', role: 'main_admin' });
}

describe('housing_admins.role', () => {
  it('admits editor, keeps admin as the default, and stores all_projects false by default', async () => {
    const editor = await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
    await owner`insert into public.housing_admins (email, password_hash) values ('plain@example.org', 'x')`;
    expect(await owner`select email, role, all_projects from public.housing_admins order by email`).toEqual([
      { email: 'ed@example.org', role: 'editor', all_projects: false },
      { email: 'plain@example.org', role: 'admin', all_projects: false },
    ]);
    expect(editor.role).toBe('editor');
  });
});

describe('housing_admin_project_keys', () => {
  it('gives a leaf assignment its own key and its parent group', async () => {
    const editor = await insertAdmin(owner, { role: 'editor', projects: ['tin'] });
    expect(await keysOf(editor.id)).toEqual(['housing', 'tin']);
  });

  it('lets a group cover its children, including one added after the assignment', async () => {
    const editor = await insertAdmin(owner, { role: 'editor', projects: ['housing'] });
    expect(await keysOf(editor.id)).toEqual(['housing', 'semi_pucca', 'tin']);
    await insertProject(owner, { key: 'mud', parent_key: 'housing' });
    expect(await keysOf(editor.id)).toEqual(['housing', 'mud', 'semi_pucca', 'tin']);
  });

  it('gives an admin with no assignment an empty list', async () => {
    const editor = await insertAdmin(owner, { role: 'editor' });
    expect(await keysOf(editor.id)).toEqual([]);
  });

  it('drops the assignment rows when their project is deleted', async () => {
    await insertProject(owner, { key: 'water' });
    const editor = await insertAdmin(owner, { role: 'editor', projects: ['water', 'tin'] });
    await owner`delete from public.housing_projects where key = 'water'`;
    expect(await assigned(editor.id)).toEqual(['tin']);
  });
});

describe('housing_admin_user_save', () => {
  it('assigns, replaces and clears projects, and stores no rows for all projects', async () => {
    const editor = await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
    const [saved] = await saveAsMain({ email: 'ed@example.org', projects: ['tin', 'housing', ' tin '] });
    expect(saved?.id).toBe(editor.id);
    expect(await assigned(editor.id)).toEqual(['housing', 'tin']);

    await saveAsMain({ email: 'ed@example.org', projects: ['semi_pucca'] });
    expect(await assigned(editor.id)).toEqual(['semi_pucca']);

    await saveAsMain({ email: 'ed@example.org', allProjects: true, projects: ['tin'] });
    expect(await assigned(editor.id)).toEqual([]);
    expect(await owner`select all_projects from public.housing_admins where id = ${editor.id}`).toEqual([{ all_projects: true }]);
  });

  it('turns an editor into an admin and back, with no assignment and no flag for the admin', async () => {
    const editor = await insertAdmin(owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    await saveAsMain({ email: 'ed@example.org', role: 'admin', allProjects: true, projects: ['tin'] });
    expect(await owner`select role, all_projects from public.housing_admins where id = ${editor.id}`).toEqual([{ role: 'admin', all_projects: false }]);
    expect(await assigned(editor.id)).toEqual([]);

    await saveAsMain({ email: 'ed@example.org', role: 'editor', projects: ['semi_pucca'] });
    expect(await owner`select role from public.housing_admins where id = ${editor.id}`).toEqual([{ role: 'editor' }]);
    expect(await assigned(editor.id)).toEqual(['semi_pucca']);
  });

  it('finds the login by any spelling of its email', async () => {
    const editor = await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
    await saveAsMain({ email: '  ED@Example.org ', projects: ['tin'] });
    expect(await assigned(editor.id)).toEqual(['tin']);
  });

  it('disables the login and ends its sessions, and enabling clears disabled_at', async () => {
    const editor = await insertAdmin(owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    const other = await insertAdmin(owner, { email: 'other@example.org' });
    const now = new Date();
    const later = new Date(now.getTime() + 3_600_000);
    for (const [hash, id] of [[Buffer.alloc(32, 1), editor.id], [Buffer.alloc(32, 2), other.id]] as const) {
      await owner`insert into public.housing_admin_sessions (token_hash, admin_id, created_at, last_seen_at, expires_at)
        values (${hash}, ${id}, ${now}, ${now}, ${later})`;
    }
    await saveAsMain({ email: 'ed@example.org', projects: ['tin'], active: false });
    expect(await owner`select disabled_at is not null as off from public.housing_admins where id = ${editor.id}`).toEqual([{ off: true }]);
    expect(await owner`select admin_id from public.housing_admin_sessions`).toEqual([{ admin_id: other.id }]);

    await saveAsMain({ email: 'ed@example.org', projects: ['tin'], active: true });
    expect(await owner`select disabled_at from public.housing_admins where id = ${editor.id}`).toEqual([{ disabled_at: null }]);
  });

  it('saves an inactive editor with no projects', async () => {
    const editor = await insertAdmin(owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    await saveAsMain({ email: 'ed@example.org', projects: [], active: false });
    expect(await assigned(editor.id)).toEqual([]);
  });

  it('logs one admin_user_update row with the main admin as the actor', async () => {
    await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
    await saveAsMain({ email: 'ed@example.org', projects: ['tin'] });
    const m = await mainAdmin();
    expect(await owner`select actor_id, actor_email, action, project_type, details from public.housing_activity_log`).toEqual([
      {
        actor_id: m.id,
        actor_email: m.email,
        action: 'admin_user_update',
        project_type: null,
        details: { email: 'ed@example.org', role: 'editor', all_projects: false, projects: ['tin'], active: true },
      },
    ]);
  });

  it('waits for a login holding the row lock, then deletes the session that login made', async () => {
    const editor = await insertAdmin(owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
    const m = await mainAdmin();
    const now = new Date();
    const later = new Date(now.getTime() + 3_600_000);
    // The login holds the admin row, as server/src/auth/service.ts does, while it creates its session.
    const pending = owner.begin(async (tx) => {
      await tx`select 1 from public.housing_admins where id = ${editor.id} for update`;
      const disable = withActor(app, m, (tx) => save(tx, { email: 'ed@example.org', projects: ['tin'], active: false }));
      await waitForBlockedQuery(tx);
      await tx`insert into public.housing_admin_sessions (token_hash, admin_id, created_at, last_seen_at, expires_at)
        values (${Buffer.alloc(32, 7)}, ${editor.id}, ${now}, ${now}, ${later})`;
      return [disable];
    });
    const [disable] = await pending;
    await disable;
    expect(await owner`select count(*)::int as n from public.housing_admin_sessions`).toEqual([{ n: 0 }]);
  });

  describe('refuses', () => {
    it('a role other than admin or editor', async () => {
      await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
      for (const role of ['main_admin', 'root']) {
        await expect(saveAsMain({ email: 'ed@example.org', role, projects: ['tin'] })).rejects.toMatchObject({
          code: 'HC400',
          detail: 'role',
        });
      }
      expect(await owner`select role from public.housing_admins where email = 'ed@example.org'`).toEqual([{ role: 'editor' }]);
    });

    it("the main admin's row", async () => {
      const m = await mainAdmin();
      await expect(saveAsMain({ email: ` ${m.email.toUpperCase()} `, role: 'admin' })).rejects.toMatchObject({
        code: 'HC400',
        detail: 'email',
      });
      expect(await owner`select role, disabled_at from public.housing_admins where id = ${m.id}`).toEqual([{ role: 'main_admin', disabled_at: null }]);
    });

    it('an unknown project key, naming it', async () => {
      await insertAdmin(owner, { email: 'ed@example.org', role: 'editor' });
      await expect(saveAsMain({ email: 'ed@example.org', projects: ['tin', 'nope'] })).rejects.toMatchObject({
        code: 'HC400',
        detail: 'projects',
        message: 'অচেনা প্রকল্প: nope',
      });
    });

    it('an active editor with no projects and no "all projects"', async () => {
      await insertAdmin(owner, { email: 'ed@example.org', role: 'editor', projects: ['tin'] });
      await expect(saveAsMain({ email: 'ed@example.org', projects: [' '] })).rejects.toMatchObject({ code: 'HC400', detail: 'projects' });
      expect(await owner`select count(*)::int as n from public.housing_admin_projects`).toEqual([{ n: 1 }]);
    });

    it('an unknown email, as P0002', async () => {
      await expect(saveAsMain({ email: 'nobody@example.org', projects: ['tin'] })).rejects.toMatchObject({ code: 'P0002' });
      expect(await owner`select count(*)::int as n from public.housing_activity_log`).toEqual([{ n: 0 }]);
    });
  });
});

describe('privileges', () => {
  it('lets housing_app read the assignments but not write them', async () => {
    const editor = await insertAdmin(owner, { role: 'editor', projects: ['tin'] });
    expect(await app`select project_key from public.housing_admin_projects`).toEqual([{ project_key: 'tin' }]);
    await expect(app`insert into public.housing_admin_projects (admin_id, project_key) values (${editor.id}, 'semi_pucca')`).rejects.toMatchObject({ code: '42501' });
    await expect(app`update public.housing_admin_projects set project_key = 'semi_pucca'`).rejects.toMatchObject({ code: '42501' });
    await expect(app`delete from public.housing_admin_projects`).rejects.toMatchObject({ code: '42501' });
  });

  it('lets housing_app run both functions, and only it', async () => {
    const [row] = await owner`
      select has_function_privilege('housing_app', 'public.housing_admin_project_keys(uuid)', 'execute') as keys,
             has_function_privilege('housing_app', 'public.housing_admin_user_save(text, text, boolean, text[], boolean)', 'execute') as save`;
    expect(row).toEqual({ keys: true, save: true });
  });

  it('keeps the scope function invoker and the save a definer, both with a fixed search_path', async () => {
    expect(
      await owner`select proname, prosecdef, proconfig from pg_proc
        where proname in ('housing_admin_project_keys', 'housing_admin_user_save') order by proname`,
    ).toEqual([
      { proname: 'housing_admin_project_keys', prosecdef: false, proconfig: ['search_path=public'] },
      { proname: 'housing_admin_user_save', prosecdef: true, proconfig: ['search_path=public'] },
    ]);
  });

  it('still refuses housing_app a direct role or all_projects change', async () => {
    const editor = await insertAdmin(owner, { role: 'editor' });
    await expect(app`update public.housing_admins set role = 'admin' where id = ${editor.id}`).rejects.toMatchObject({ code: '42501' });
    await expect(app`update public.housing_admins set all_projects = true where id = ${editor.id}`).rejects.toMatchObject({ code: '42501' });
  });
});

/** Resolves once some query on the test database is waiting for a lock. */
async function waitForBlockedQuery(sql: Tx) {
  for (let i = 0; i < 200; i++) {
    const [row] = await sql`select count(*)::int as n from pg_locks where not granted`;
    if ((row?.n as number) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('no query blocked on a lock');
}
