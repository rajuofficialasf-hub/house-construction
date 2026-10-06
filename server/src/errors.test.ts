import express from 'express';
import postgres from 'postgres';
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
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'সার্ভারে সমস্যা হয়েছে' } });
  });

  it.each([
    ['VALIDATION_ERROR', 400],
    ['UNAUTHENTICATED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['PAYLOAD_TOO_LARGE', 413],
    ['INTERNAL_ERROR', 500],
  ] as const)('sends %s with status %i', async (code, status) => {
    const res = await request(appThrowing(new AppError(code, 'x'))).get('/boom');
    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error: { code, message: 'x' } });
  });

  it('returns 404 NOT_FOUND for an unknown route', async () => {
    const res = await request(appThrowing(null)).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('names the row of a bulk zod error with row_index and the field inside it', async () => {
    const parsed = z.object({ rows: z.array(z.object({ year: z.number() })) }).safeParse({ rows: [{ year: 1 }, { year: 2 }, { year: 'x' }, { year: 4 }] });
    const res = await request(appThrowing(parsed.error)).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual({ row_index: 2, field: 'year', reason: 'invalid_type' });
  });
});

it('reports the reason a custom check names in its params', async () => {
  const parsed = z.object({ a: z.string().refine(() => false, { params: { reason: 'server_logged' } }) }).safeParse({ a: 'x' });
  const res = await request(appThrowing(parsed.error)).get('/boom');
  expect(res.body.error.details).toEqual({ field: 'a', reason: 'server_logged' });
});

describe('errorHandler with Postgres errors', () => {
  // Shaped as postgres.js builds them from the server's error fields.
  const pgError = (fields: Record<string, unknown>) =>
    new postgres.PostgresError({ message: 'duplicate key value violates "x"', detail: 'Key (serial_no)=(7) already exists.', ...fields } as never);

  it('maps a unique-serial violation to 409 with a fixed message and no Postgres text', async () => {
    const res = await request(appThrowing(pgError({ code: '23505', constraint_name: 'housing_beneficiaries_project_serial_key' }))).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: 'এই সিরিয়াল আগে থেকেই আছে' } });
  });

  it('maps a 23505 raised by a function, with no constraint, to 409', async () => {
    const res = await request(appThrowing(pgError({ code: '23505' }))).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('keeps a 23505 on any other constraint a 500, since it would be a bug', async () => {
    const res = await request(appThrowing(pgError({ code: '23505', constraint_name: 'housing_admins_email_key' }))).get('/boom');
    expect(res.status).toBe(500);
  });

  it('maps P0002 to 404', async () => {
    const res = await request(appThrowing(pgError({ code: 'P0002' }))).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'রেকর্ড পাওয়া যায়নি' } });
  });

  it.each(['23514', '23502', '22023', '22P02'])('maps %s to 400 with reason constraint', async (code) => {
    const res = await request(appThrowing(pgError({ code }))).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'ইনপুট সঠিক নয়', details: { reason: 'constraint' } } });
  });

  it('keeps a missing grant (42501) a generic 500', async () => {
    const res = await request(appThrowing(pgError({ code: '42501' }))).get('/boom');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('duplicate');
  });
});

// The ported record triggers raise class HC with our own Bangla text and the field key in DETAIL
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "The guards' own errors reach the client").
describe('errorHandler with guard (HC) errors', () => {
  const MESSAGE = 'টাকার পরিমাণ সঠিক নয়';
  const guardError = (code: string, detail?: string) =>
    new postgres.PostgresError({ message: MESSAGE, code, ...(detail !== undefined && { detail }) } as never);

  // Records what the handler logs, so a test can see exactly which fields reach the log.
  function appLogging(err: unknown) {
    const logged: unknown[] = [];
    const log = { warn: (obj: unknown) => logged.push(obj), error: (obj: unknown) => logged.push(obj) };
    const app = express();
    app.use((req, _res, next) => {
      req.log = log as never;
      next();
    });
    app.get('/boom', () => {
      throw err;
    });
    app.use(errorHandler);
    return { app, logged };
  }

  it('passes an HC400 message and its field key through as a 400', async () => {
    const res = await request(appThrowing(guardError('HC400', 'extra.amount'))).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: MESSAGE, details: { field: 'extra.amount' } } });
  });

  it('accepts a plain column name as the field key', async () => {
    const res = await request(appThrowing(guardError('HC400', 'union_name'))).get('/boom');
    expect(res.body.error.details).toEqual({ field: 'union_name' });
  });

  it('passes an HC409 message through as a 409', async () => {
    const res = await request(appThrowing(guardError('HC409', 'key'))).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { code: 'CONFLICT', message: MESSAGE, details: { field: 'key' } } });
  });

  it('sends no details when DETAIL is missing', async () => {
    const res = await request(appThrowing(guardError('HC400'))).get('/boom');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: MESSAGE } });
  });

  it.each(['extra.Bad Key', "x'; drop", '', 'extra.amount.deep', 'Key (serial_no)=(7) already exists.'])(
    'leaves out a DETAIL that is not a field key (%j)',
    async (detail) => {
      const res = await request(appThrowing(guardError('HC400', detail))).get('/boom');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: MESSAGE } });
    },
  );

  it('keeps any other HC code a generic 500', async () => {
    const res = await request(appThrowing(guardError('HC500', 'extra.amount'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'সার্ভারে সমস্যা হয়েছে' } });
  });

  it('keeps the fixed message for a non-HC error even when its DETAIL looks like a field key', async () => {
    const err = new postgres.PostgresError({ message: 'new row violates check', code: '23514', detail: 'extra.amount' } as never);
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'ইনপুট সঠিক নয়', details: { reason: 'constraint' } } });
  });

  it('keeps a 23505 on the serial key a 409', async () => {
    const err = new postgres.PostgresError({
      message: 'duplicate key',
      code: '23505',
      constraint_name: 'housing_beneficiaries_project_serial_key',
    } as never);
    const res = await request(appThrowing(err)).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('এই সিরিয়াল আগে থেকেই আছে');
  });

  it('logs the code and the checked field, never the message or the raw DETAIL', async () => {
    const { app, logged } = appLogging(guardError('HC400', 'extra.amount'));
    await request(app).get('/boom');
    expect(logged).toEqual([{ code: 'HC400', constraint: undefined, field: 'extra.amount' }]);

    const bad = appLogging(guardError('HC400', "x'; drop"));
    await request(bad.app).get('/boom');
    expect(bad.logged).toEqual([{ code: 'HC400', constraint: undefined, field: undefined }]);
    expect(JSON.stringify(bad.logged)).not.toContain(MESSAGE);
  });
});
