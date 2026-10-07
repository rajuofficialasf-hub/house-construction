import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { activityBody, activityQuery, idParams, serialsQuery } from './schemas.js';

// The shared base schemas the record and activity routes build on (docs/api/PROJECTS_API_CONTRACT.md §4.4, §4.5).

const fails = (schema: z.ZodType, input: unknown) => expect(schema.safeParse(input).success).toBe(false);

describe('path and other query schemas', () => {
  it('accepts a uuid id and refuses anything else', () => {
    expect(idParams.parse({ id: '00000000-0000-4000-8000-ffffffffffff' }).id).toBe('00000000-0000-4000-8000-ffffffffffff');
    fails(idParams, { id: 'stats' });
    fails(idParams, { id: '123' });
  });

  it('dedupes and sorts nos', () => {
    expect(serialsQuery.parse({ nos: '3,1,3' }).nos).toEqual([1, 3]);
  });

  it.each(['', '1,a', '1,,2', ',1', '1,', '0', '2147483648'])('refuses nos=%j', (nos) => {
    fails(serialsQuery, { nos });
  });

  it('refuses a missing nos', () => {
    fails(serialsQuery, {});
  });

  it('allows at most 100 serials', () => {
    const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(serialsQuery.parse({ nos: hundred.join(',') }).nos).toHaveLength(100);
    fails(serialsQuery, { nos: [...hundred, 101].join(',') });
  });

});

/** The zod issue's reason as the error handler reports it: params.reason when set, else the code. */
function reasonOf(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  const issue = result.error!.issues[0] as { code: string; path: PropertyKey[]; params?: { reason?: string } };
  return { reason: issue.params?.reason ?? issue.code, path: issue.path.join('.') };
}

describe('activityQuery', () => {
  it('defaults the page and parses every filter', () => {
    expect(activityQuery.parse({})).toEqual({ page: 1, page_size: 50 });
    expect(
      activityQuery.parse({
        action: 'update',
        project_type: 'tin',
        record_id: '3f2c0000-0000-4000-8000-000000000001',
        actor_email: ' admin ',
        from: '2026-10-01T00:00:00+06:00',
        to: '2026-10-05T23:59:59.999Z',
        page: '2',
        page_size: '100',
      }),
    ).toMatchObject({ actor_email: 'admin', page: 2, page_size: 100 });
  });

  it.each([
    { action: 'Login' },
    { action: 'a'.repeat(41) },
    { from: '2026-10-01T00:00:00' },
    { record_id: 'abc' },
    { page_size: '101' },
    { project_type: 'villa' },
  ])('refuses %o', (query) => {
    fails(activityQuery, query);
  });
});

describe('activityBody', () => {
  it('takes a client event with details', () => {
    expect(activityBody.parse({ action: 'import_run', project_type: 'tin', details: { rows: 3 } })).toEqual({ action: 'import_run', project_type: 'tin', details: { rows: 3 } });
    expect(activityBody.parse({ action: 'photo_bulk_run' })).toEqual({ action: 'photo_bulk_run', details: {} });
  });

  it.each(['login', 'logout', 'create', 'update', 'delete', 'photo_update', 'serial_change'])('refuses %s, which the server logs itself', (action) => {
    expect(reasonOf(activityBody, { action }).reason).toBe('server_logged');
  });

  it('refuses details over 8 KB, details that are not an object, and an actor in the body', () => {
    expect(reasonOf(activityBody, { action: 'import_run', details: { note: 'ক'.repeat(2731) } }).reason).toBe('too_big');
    fails(activityBody, { action: 'import_run', details: [1] });
    fails(activityBody, { action: 'import_run', actor_email: 'x@example.org' });
    fails(activityBody, { action: 'Bad-Action' });
  });
});

describe('the activity schemas as JSON Schema', () => {
  it.each([
    ['activityQuery', activityQuery],
    ['activityBody', activityBody],
  ] as const)('%s converts with no unresolvable $defs refs', (_name, schema) => {
    expect(JSON.stringify(z.toJSONSchema(schema, { io: 'input' }))).not.toContain('#/$defs');
  });
});
