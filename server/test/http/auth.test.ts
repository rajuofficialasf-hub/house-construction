import { Writable } from 'node:stream';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../../src/auth/password.js';
import { createApp, type AppDeps } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import { appDb, insertAdmin, ownerDb, resetTestData } from '../support/db.js';

// /api/v1/auth/login, /logout and /me through the real app and test database.

const sql = appDb();
const owner = ownerDb();
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct horse battery staple';
const FAILURE = { error: { code: 'UNAUTHENTICATED', message: 'ইমেইল বা পাসওয়ার্ড সঠিক নয়' } };

let logLines: string[] = [];
const logSink = new Writable({
  write(chunk, _enc, done) {
    logLines.push(String(chunk));
    done();
  },
});

function makeApp(overrides: Partial<AppDeps> = {}) {
  return createApp({
    sql,
    logger: createLogger('info', logSink),
    trustProxy: 0,
    allowedOrigins: [ORIGIN],
    cookieSecure: false,
    ...overrides,
  });
}

let app = makeApp();
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});
beforeEach(async () => {
  // A fresh app per test also gives each test a fresh rate-limit counter.
  app = makeApp();
  logLines = [];
  await resetTestData(owner);
});
afterAll(() => Promise.all([sql.end(), owner.end()]));

function postLogin(body: unknown, target = app) {
  return request(target).post('/api/v1/auth/login').set('origin', ORIGIN).send(body as object);
}

/** The `name=value` part of the session cookie a response set. */
function sessionCookieFrom(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('housing_session=') || c.startsWith('__Host-housing_session='));
  if (!cookie) throw new Error('no session cookie set');
  return cookie.split(';')[0] as string;
}

async function activity() {
  return owner`select actor_id, action from public.housing_activity_log order by id`;
}

describe('POST /api/v1/auth/login', () => {
  it('logs in, returns the user without a token, and sets an HttpOnly cookie', async () => {
    const admin = await insertAdmin(owner, { passwordHash });
    const res = await postLogin({ email: 'Admin@Example.org ', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        expires_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        user: { id: admin.id, email: 'admin@example.org', name: 'এডমিন', role: 'admin' },
      },
    });
    const [cookie] = res.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^housing_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).not.toContain('Secure');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('uses a Secure __Host- cookie when cookies are secure', async () => {
    await insertAdmin(owner, { passwordHash });
    const res = await postLogin({ email: 'admin@example.org', password: PASSWORD }, makeApp({ cookieSecure: true }));
    const [cookie] = res.headers['set-cookie'] as unknown as string[];
    expect(cookie).toMatch(/^__Host-housing_session=/);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/');
  });

  it('answers every kind of failure with the same status and message', async () => {
    await insertAdmin(owner, { passwordHash });
    await insertAdmin(owner, { email: 'off@example.org', passwordHash, disabled: true });
    const bodies = [];
    for (const attempt of [
      { email: 'nobody@example.org', password: PASSWORD },
      { email: 'admin@example.org', password: 'wrong password' },
      { email: 'off@example.org', password: PASSWORD },
    ]) {
      const res = await postLogin(attempt);
      expect(res.status).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
      bodies.push(res.body);
    }
    expect(bodies).toEqual([FAILURE, FAILURE, FAILURE]);
    expect(await activity()).toEqual([]);
  });

  it('logs why a login failed, but not the email or password', async () => {
    await insertAdmin(owner, { passwordHash });
    await postLogin({ email: 'admin@example.org', password: 'wrong password' });
    const log = logLines.join('');
    expect(log).toContain('"reason":"bad_password"');
    expect(log).not.toContain('admin@example.org');
    expect(log).not.toContain('wrong password');
  });

  it.each([
    ['no email', { password: PASSWORD }],
    ['a malformed email', { email: 'admin', password: PASSWORD }],
    ['an empty password', { email: 'admin@example.org', password: '' }],
    ['a 201-character password', { email: 'admin@example.org', password: 'x'.repeat(201) }],
  ])('rejects a body with %s as invalid input', async (_case, body) => {
    const res = await postLogin(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a login from a page on another origin', async () => {
    await insertAdmin(owner, { passwordHash });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('origin', 'https://evil.example')
      .send({ email: 'admin@example.org', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('limits an IP to 10 failed logins, even if the 11th has the right password', async () => {
    await insertAdmin(owner, { passwordHash });
    for (let i = 0; i < 10; i++) {
      expect((await postLogin({ email: 'admin@example.org', password: `wrong ${i}` })).status).toBe(401);
    }
    const res = await postLogin({ email: 'admin@example.org', password: PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: { code: 'RATE_LIMITED', message: 'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন' },
    });
  });

  it('counts failures per client IP', async () => {
    await insertAdmin(owner, { passwordHash });
    const proxied = makeApp({ trustProxy: 1 });
    const from = (ip: string, password: string) =>
      request(proxied)
        .post('/api/v1/auth/login')
        .set('origin', ORIGIN)
        .set('x-forwarded-for', ip)
        .send({ email: 'admin@example.org', password });
    for (let i = 0; i < 10; i++) await from('203.0.113.1', 'wrong');
    expect((await from('203.0.113.1', PASSWORD)).status).toBe(429);
    expect((await from('203.0.113.2', PASSWORD)).status).toBe(200);
  });

  it('does not count successful logins toward the limit', async () => {
    await insertAdmin(owner, { passwordHash });
    for (let i = 0; i < 12; i++) {
      expect((await postLogin({ email: 'admin@example.org', password: PASSWORD })).status).toBe(200);
    }
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the signed-in admin', async () => {
    const admin = await insertAdmin(owner, { passwordHash, name: null });
    const cookie = sessionCookieFrom(await postLogin({ email: admin.email, password: PASSWORD }));
    const res = await request(app).get('/api/v1/auth/me').set('cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { id: admin.id, email: admin.email, name: null, role: 'admin' } });
  });

  it('answers 401 without a session', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('ends the session, clears the cookie and logs login then logout', async () => {
    const admin = await insertAdmin(owner, { passwordHash });
    const cookie = sessionCookieFrom(await postLogin({ email: admin.email, password: PASSWORD }));
    const res = await request(app).post('/api/v1/auth/logout').set('origin', ORIGIN).set('cookie', cookie);
    expect(res.status).toBe(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^housing_session=;.*Expires=Thu, 01 Jan 1970/);
    expect((await request(app).get('/api/v1/auth/me').set('cookie', cookie)).status).toBe(401);
    expect(await activity()).toEqual([
      { actor_id: admin.id, action: 'login' },
      { actor_id: admin.id, action: 'logout' },
    ]);
  });

  it('answers 204 without a session, and logs nothing', async () => {
    const res = await request(app).post('/api/v1/auth/logout').set('origin', ORIGIN);
    expect(res.status).toBe(204);
    expect(await activity()).toEqual([]);
  });
});

describe('secrets', () => {
  it('never puts the password or session token in the log', async () => {
    const admin = await insertAdmin(owner, { passwordHash });
    const login = await postLogin({ email: admin.email, password: PASSWORD });
    const token = sessionCookieFrom(login).split('=')[1] as string;
    await request(app).get('/api/v1/auth/me').set('cookie', `housing_session=${token}`);
    const log = logLines.join('');
    expect(log).not.toContain(PASSWORD);
    expect(log).not.toContain(token);
  });
});
