import postgres from 'postgres';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { testAppUrl } from '../test/support/env.js';
import { createApp } from './app.js';
import { createDb } from './db.js';
import { createLogger } from './logger.js';

const logger = createLogger('silent');
const sql = createDb(testAppUrl);
const app = createApp({ sql, logger, trustProxy: 0 });

afterAll(() => sql.end());

describe('createApp', () => {
  it('reports the process as alive', async () => {
    const res = await request(app).get('/api/v1/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('reports ready when the database answers', async () => {
    const res = await request(app).get('/api/v1/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('reports 503 without internal detail when the database is down', async () => {
    // Port 1 on loopback has nothing listening, so the connection is refused at once.
    const deadSql = postgres('postgres://housing_app:x@127.0.0.1:1/housing_test', { connect_timeout: 1, max: 1 });
    try {
      const res = await request(createApp({ sql: deadSql, logger, trustProxy: 0 })).get('/api/v1/readyz');
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/);
    } finally {
      await deadSql.end();
    }
  });

  it('answers unknown routes with the contract 404 body', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a JSON body over 100 kB with 413', async () => {
    const res = await request(app)
      .post('/api/v1/healthz')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(110 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app).post('/api/v1/healthz').set('content-type', 'application/json').send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers an unsupported body encoding with 400, not 500', async () => {
    const res = await request(app).post('/api/v1/healthz').set('content-type', 'application/json').set('content-encoding', 'foo').send('{}');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/api/v1/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('tags every response with a request id', async () => {
    const res = await request(app).get('/api/v1/healthz');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
