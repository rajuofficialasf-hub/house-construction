import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, errorHandler, notFoundHandler } from './errors.js';
import { createLogger } from './logger.js';

// A minimal app with the real error middleware, so each error kind can be thrown on purpose.
function appThrowing(err: unknown) {
  const app = express();
  app.use((req, _res, next) => {
    req.log = createLogger('silent');
    next();
  });
  app.get('/boom', () => {
    throw err;
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('maps an AppError to its contract status and body', async () => {
    const res = await request(appThrowing(new AppError('CONFLICT', 'Serial taken', { field: 'serial_no', reason: 'duplicate' }))).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'Serial taken', details: { field: 'serial_no', reason: 'duplicate' } } });
  });

  it('maps a zod error to 400 VALIDATION_ERROR naming the field', async () => {
    const parsed = z.object({ name: z.string() }).safeParse({});
    const res = await request(appThrowing(parsed.error)).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.field).toBe('name');
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const res = await request(appThrowing(new Error('secret detail'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });

  it('returns 404 NOT_FOUND for an unknown route', async () => {
    const res = await request(appThrowing(null)).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
