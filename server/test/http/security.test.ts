import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sessionCookie } from '../../src/auth/cookie.js';
import { requireAdmin, sessionMiddleware } from '../../src/auth/middleware.js';
import { hashPassword } from '../../src/auth/password.js';
import { login } from '../../src/auth/service.js';
import { createApp } from '../../src/app.js';
import { errorHandler } from '../../src/errors.js';
import { createLogger } from '../../src/logger.js';
import { appDb, insertAdmin, ownerDb, resetTestData } from '../support/db.js';

// CORS, the Origin check and the session middleware, through the real middleware chain.

const sql = appDb();
const owner = ownerDb();
const SITE = 'http://localhost:5173';
const OTHER = 'https://evil.example';
const PASSWORD = 'correct horse battery staple';
const now = () => new Date();
const app = createApp({ sql, logger: createLogger('silent'), trustProxy: 0, allowedOrigins: [SITE], cookieSecure: false, now });

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});
beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([sql.end(), owner.end()]));

describe('CORS', () => {
  it('answers a preflight from an allowed origin, with credentials', async () => {
    const res = await request(app)
      .options('/api/v1/healthz')
      .set('origin', SITE)
      .set('access-control-request-method', 'POST')
      .set('access-control-request-headers', 'content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(SITE);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('gives no CORS grant to another origin', async () => {
    const res = await request(app).get('/api/v1/healthz').set('origin', OTHER);
    // The cors package sends Allow-Credentials regardless; without Allow-Origin it grants nothing.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Origin check', () => {
  it.each([
    ['no Origin', undefined],
    ['another origin', OTHER],
    ['an allowed origin with a different port', 'http://localhost:5174'],
  ])('refuses a POST with %s', async (_case, origin) => {
    const req = request(app).post('/api/v1/healthz').set('content-type', 'application/json');
    if (origin) req.set('origin', origin);
    const res = await req.send('{}');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it.each(['put', 'patch', 'delete'] as const)('refuses %s from another origin', async (method) => {
    const res = await request(app)[method]('/api/v1/healthz').set('origin', OTHER);
    expect(res.status).toBe(403);
  });

  it('lets a POST from an allowed origin through to routing', async () => {
    const res = await request(app).post('/api/v1/healthz').set('origin', SITE);
    expect(res.status).toBe(404);
  });

  it('lets a GET from any origin through, since CORS keeps its body from other sites', async () => {
    const res = await request(app).get('/api/v1/healthz').set('origin', OTHER);
    expect(res.status).toBe(200);
  });
});

describe('session middleware and requireAdmin', () => {
  const cookie = sessionCookie(false);
  // A guarded route the way later admin routes will use requireAdmin; it exists only in this test.
  const guarded = express()
    .use(sessionMiddleware({ sql, now }, cookie.name))
    .get('/guarded', requireAdmin, (req, res) => {
      res.json({ data: { id: req.admin?.id } });
    })
    .use(errorHandler);

  async function tokenFor(email: string) {
    const result = await login({ sql, now }, email, PASSWORD);
    if (!result.ok) throw new Error(result.reason);
    return result.token;
  }

  it('refuses a request with no session cookie', async () => {
    const res = await request(guarded).get('/guarded');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses a made-up token', async () => {
    const res = await request(guarded).get('/guarded').set('cookie', `${cookie.name}=bm90LWEtdG9rZW4`);
    expect(res.status).toBe(401);
  });

  it('lets a live session through as its admin', async () => {
    const admin = await insertAdmin(owner, { passwordHash });
    const token = await tokenFor(admin.email);
    const res = await request(guarded).get('/guarded').set('cookie', `theme=dark; ${cookie.name}=${token}; lang=bn`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: admin.id } });
  });

  it('ignores the token under another cookie name', async () => {
    const admin = await insertAdmin(owner, { passwordHash });
    const token = await tokenFor(admin.email);
    const res = await request(guarded).get('/guarded').set('cookie', `x${cookie.name}=${token}`);
    expect(res.status).toBe(401);
  });

  it('refuses an admin’s old cookie once that admin is disabled, while another admin still works', async () => {
    const off = await insertAdmin(owner, { email: 'off@example.org', passwordHash });
    const on = await insertAdmin(owner, { email: 'on@example.org', passwordHash });
    const offToken = await tokenFor(off.email);
    const onToken = await tokenFor(on.email);
    await owner`update public.housing_admins set disabled_at = now() where id = ${off.id}`;
    expect((await request(guarded).get('/guarded').set('cookie', `${cookie.name}=${offToken}`)).status).toBe(401);
    const res = await request(guarded).get('/guarded').set('cookie', `${cookie.name}=${onToken}`);
    expect(res.body).toEqual({ data: { id: on.id } });
  });
});
