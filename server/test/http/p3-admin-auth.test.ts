// Who may call the admin routes added with the bulk, photo, serial and activity work and the
// project and field writes (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md,
// "P3 decisions" and "P4 decisions"): one
// table of routes, each checked for the same refusals, so a new route can't skip one.
import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { appDb, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { testPhotoDeps } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const PARTNER = 'https://partner.example.org';
const silent = new Writable({ write: (_chunk, _enc, done) => done() });
const app = createApp({
  ...testPhotoDeps(),
  sql,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  publicReadOrigins: [PARTNER],
  cookieSecure: false,
});
// Every write limit is 1 per admin and every read limit 1 per IP, so a route's second call shows
// whether its limiter runs.
const limited = createApp({
  ...testPhotoDeps(),
  sql,
  logger: createLogger('info', silent),
  trustProxy: 0,
  allowedOrigins: [TEST_ORIGIN],
  cookieSecure: false,
  writeRateLimit: { windowMs: 60_000, limit: 1 },
  readRateLimit: { windowMs: 60_000, limit: 1 },
});
const P = 'auth_p';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface AdminRoute {
  method: Method;
  /** The path, with ID standing for a real record's id. */
  path: string;
  body?: object;
}

const ROUTES: AdminRoute[] = [
  { method: 'post', path: `/api/v1/projects/${P}/records/bulk`, body: { mode: 'assign_serial', rows: [] } },
  { method: 'put', path: `/api/v1/projects/${P}/records/bulk`, body: { rows: [] } },
  { method: 'put', path: '/api/v1/records/ID/photos/current' },
  { method: 'delete', path: '/api/v1/records/ID/photos/current' },
  { method: 'post', path: '/api/v1/records/ID/serial', body: { serial_no: 5 } },
  { method: 'get', path: '/api/v1/activity' },
  { method: 'post', path: '/api/v1/activity', body: { action: 'import_run' } },
  { method: 'post', path: '/api/v1/projects', body: {} },
  { method: 'put', path: '/api/v1/projects/order', body: { keys: ['tin'] } },
  { method: 'patch', path: `/api/v1/projects/${P}`, body: { name_bn: 'ক' } },
  { method: 'delete', path: '/api/v1/projects/nope' },
  { method: 'post', path: `/api/v1/projects/${P}/fields`, body: { key: 'a', label_bn: 'ক', type: 'text' } },
  { method: 'put', path: `/api/v1/projects/${P}/fields/order`, body: { ids: [] } },
  // Any uuid serves for the auth checks; ID is a record's.
  { method: 'patch', path: '/api/v1/fields/ID', body: { label_bn: 'ক' } },
  { method: 'delete', path: '/api/v1/fields/ID' },
];

let id = '';
let cookie = '';

beforeEach(async () => {
  await resetTestData(owner);
  await insertProject(owner, { key: P });
  ({ id } = await insertRecord(sql, { project_type: P }));
  ({ cookie } = await loginAdmin(app, owner));
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

function call(route: AdminRoute, { as, origin = TEST_ORIGIN }: { as?: string; origin?: string | null } = {}) {
  const req = request(app)[route.method](route.path.replace('ID', id));
  if (origin) req.set('origin', origin);
  if (as) req.set('cookie', as);
  return route.body ? req.send(route.body) : req;
}

const name = (r: AdminRoute) => `${r.method.toUpperCase()} ${r.path}`;

describe.each(ROUTES.map((r) => [name(r), r] as const))('%s', (_name, route) => {
  it('refuses a caller with no session with 401', async () => {
    const res = await call(route);
    expect(res.status).toBe(401);
    // The activity log is never cached, refusals included.
    if (route.path.includes('/activity')) expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it("refuses a disabled admin's cookie with 401", async () => {
    await owner`update public.housing_admins set disabled_at = now()`;
    expect((await call(route, { as: cookie })).status).toBe(401);
  });

  if (route.method !== 'get') {
    it('refuses a write from an origin off the list with 403', async () => {
      expect((await call(route, { as: cookie, origin: 'https://evil.example.org' })).status).toBe(403);
    });
  }

  it('gives a public-read origin no CORS grant', async () => {
    const preflight = await request(app)
      .options(route.path.replace('ID', id))
      .set('origin', PARTNER)
      .set('access-control-request-method', route.method.toUpperCase());
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    const res = await call(route, { origin: PARTNER });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe.each(ROUTES.map((r, i) => [name(r), r, i] as const))('%s rate limit', (_name, route, i) => {
  it('answers 429 once its limit is used up', async () => {
    // A fresh admin per route, so each route starts with its own allowance.
    const { cookie: as } = await loginAdmin(limited, owner, { email: `limit${i}@example.org`, role: 'main_admin' });
    const send = () => {
      const req = request(limited)[route.method](route.path.replace('ID', id)).set('origin', TEST_ORIGIN).set('cookie', as);
      return route.body ? req.send(route.body) : req;
    };
    expect((await send()).status).not.toBe(429);
    const over = await send();
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
  });
});
