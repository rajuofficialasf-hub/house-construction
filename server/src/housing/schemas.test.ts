import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  activityBody,
  activityQuery,
  bulkInsertBody,
  bulkUpdateBody,
  changeSerialBody,
  createBody,
  idParams,
  listQuery,
  nextSerialQuery,
  projectTypeQuery,
  serialParams,
  serialsQuery,
  updateBody,
} from './schemas.js';

const fails = (schema: z.ZodType, input: unknown) => expect(schema.safeParse(input).success).toBe(false);

describe('listQuery', () => {
  it('applies the contract defaults', () => {
    expect(listQuery.parse({})).toEqual({ page: 1, page_size: 50, sort: 'serial_no', order: 'asc' });
  });

  it('parses every filter', () => {
    expect(
      listQuery.parse({
        project_type: 'tin',
        serial_no: '7',
        year: '2024',
        division: ' রংপুর ',
        district: 'কুড়িগ্রাম',
        upazila: 'উলিপুর',
        q: 'রহিমা',
        page: '3',
        page_size: '100',
        sort: 'year',
        order: 'desc',
      }),
    ).toEqual({
      project_type: 'tin',
      serial_no: 7,
      year: 2024,
      division: 'রংপুর',
      district: 'কুড়িগ্রাম',
      upazila: 'উলিপুর',
      q: 'রহিমা',
      page: 3,
      page_size: 100,
      sort: 'year',
      order: 'desc',
    });
  });

  it.each(['', '1e3', '0x10', '1.0', '-1', '0', ' 1', '2147483648', '12345678901'])('refuses page=%j', (page) => {
    fails(listQuery, { page });
  });

  it('accepts the int4 maximum as a page', () => {
    expect(listQuery.parse({ page: '2147483647' }).page).toBe(2147483647);
  });

  it('caps page_size at 100', () => {
    expect(listQuery.parse({ page_size: '100' }).page_size).toBe(100);
    fails(listQuery, { page_size: '101' });
    fails(listQuery, { page_size: '0' });
  });

  it('refuses a year outside 2000-2100', () => {
    fails(listQuery, { year: '1999' });
    fails(listQuery, { year: '2101' });
    expect(listQuery.parse({ year: '2000' }).year).toBe(2000);
  });

  it('refuses a repeated param, which Express parses as an array', () => {
    fails(listQuery, { year: ['2023', '2024'] });
    fails(listQuery, { q: ['a', 'b'] });
  });

  it('drops unknown params', () => {
    expect(listQuery.parse({ _: '123', foo: 'bar' })).not.toHaveProperty('foo');
  });

  it('refuses an unknown sort, order or project type', () => {
    fails(listQuery, { sort: 'address' });
    fails(listQuery, { order: 'up' });
    fails(listQuery, { project_type: 'brick' });
  });

  it('limits q to 100 characters after trimming', () => {
    expect(listQuery.parse({ q: `  ${'a'.repeat(100)}  ` }).q).toBe('a'.repeat(100));
    fails(listQuery, { q: 'a'.repeat(101) });
  });

  it('treats a blank q or text filter as absent', () => {
    const parsed = listQuery.parse({ q: '   ', division: '', district: ' ' });
    expect(parsed.q).toBeUndefined();
    expect(parsed.division).toBeUndefined();
    expect(parsed.district).toBeUndefined();
  });

  it('NFC-normalizes q and text filters', () => {
    // ড় typed as one code point (U+09DC) and as ড + nukta (U+09A1 U+09BC) are the same letter; NFC gives the second.
    const parsed = listQuery.parse({ q: 'কু\u09DCিগ্রাম', district: 'কু\u09DCিগ্রাম' });
    expect(parsed.q).toBe('কু\u09A1\u09BCিগ্রাম');
    expect(parsed.district).toBe('কু\u09A1\u09BCিগ্রাম');
  });

  it('can be described as JSON Schema', () => {
    expect(() => z.toJSONSchema(listQuery, { io: 'input' })).not.toThrow();
  });
});

describe('path and other query schemas', () => {
  it('accepts a uuid id and refuses anything else', () => {
    expect(idParams.parse({ id: '00000000-0000-4000-8000-ffffffffffff' }).id).toBe('00000000-0000-4000-8000-ffffffffffff');
    fails(idParams, { id: 'stats' });
    fails(idParams, { id: '123' });
  });

  it('parses a project type and serial', () => {
    expect(serialParams.parse({ project_type: 'semi_pucca', serial_no: '12' })).toEqual({ project_type: 'semi_pucca', serial_no: 12 });
    fails(serialParams, { project_type: 'semi_pucca', serial_no: '0' });
    fails(serialParams, { project_type: 'x', serial_no: '1' });
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

  it('makes project_type optional for stats and years, and required for next-serial', () => {
    expect(projectTypeQuery.parse({})).toEqual({});
    expect(projectTypeQuery.parse({ project_type: 'tin' })).toEqual({ project_type: 'tin' });
    fails(projectTypeQuery, { project_type: 'x' });
    fails(nextSerialQuery, {});
    expect(nextSerialQuery.parse({ project_type: 'tin' })).toEqual({ project_type: 'tin' });
  });
});

// Write bodies (contract §3.3, §4.5খ–§4.9গ).

const record = {
  project_type: 'tin',
  year: 2025,
  name: 'মমতাজ বেগম',
  division: 'ময়মনসিংহ',
  district: 'শেরপুর',
  upazila: 'নালিতাবাড়ী',
};
const { project_type: _pt, ...row } = record;
void _pt;

/** The zod issue's reason as the error handler reports it: params.reason when set, else the code. */
function reasonOf(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  expect(result.success).toBe(false);
  const issue = result.error!.issues[0] as { code: string; path: PropertyKey[]; params?: { reason?: string } };
  return { reason: issue.params?.reason ?? issue.code, path: issue.path.join('.') };
}

describe('createBody', () => {
  it('fills the optional fields with the contract defaults', () => {
    expect(createBody.parse(record)).toEqual({ ...record, father_or_husband_name: '', address: '', prev_photo_source: null, current_photo_source: null });
  });

  it('trims and NFC-normalizes text', () => {
    const raw = 'বা\u09DCি';
    expect(createBody.parse({ ...record, name: `  ${raw}  ` }).name).toBe(raw.normalize('NFC'));
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['a 201-character name', { name: 'ক'.repeat(201) }],
    ['an empty division', { division: '' }],
    ['year 1999', { year: 1999 }],
    ['year 2101', { year: 2101 }],
    ['a fractional year', { year: 2025.5 }],
    ['a year sent as a string', { year: '2025' }],
    ['serial 0', { serial_no: 0 }],
    ['a serial above int4', { serial_no: 2147483648 }],
    ['an unknown project type', { project_type: 'villa' }],
    ['an unknown key', { actor_email: 'x@example.org' }],
    ['a photo url, which only the photo routes set', { prev_photo_url: 'https://x' }],
    ['a 2001-character source', { prev_photo_source: 'h'.repeat(2001) }],
  ])('refuses %s', (_label, over) => {
    fails(createBody, { ...record, ...over });
  });

  it('accepts an explicit serial and turns a blank source into null', () => {
    const parsed = createBody.parse({ ...record, serial_no: 41, prev_photo_source: '  ', current_photo_source: ' https://x ' });
    expect(parsed).toMatchObject({ serial_no: 41, prev_photo_source: null, current_photo_source: 'https://x' });
  });
});

describe('updateBody', () => {
  it('keeps only the given fields, with no defaults added', () => {
    expect(updateBody.parse({ address: ' নতুন ' })).toEqual({ address: 'নতুন' });
  });

  it('refuses an empty patch', () => {
    expect(reasonOf(updateBody, {}).reason).toBe('empty');
  });

  it.each([{ serial_no: 5 }, { project_type: 'tin' }, { name: null }, { photo_updated_at: '2026-01-01T00:00:00Z' }])('refuses %o', (patch) => {
    fails(updateBody, patch);
  });

  it('lets a source be cleared with null', () => {
    expect(updateBody.parse({ prev_photo_source: null })).toEqual({ prev_photo_source: null });
  });
});

describe('changeSerialBody', () => {
  it('takes one whole serial from 1', () => {
    expect(changeSerialBody.parse({ serial_no: 350 })).toEqual({ serial_no: 350 });
    fails(changeSerialBody, { serial_no: 0 });
    fails(changeSerialBody, { serial_no: '350' });
    fails(changeSerialBody, {});
  });
});

describe('bulkInsertBody', () => {
  it('drops the given serials in assign_serial mode', () => {
    const parsed = bulkInsertBody.parse({ project_type: 'tin', mode: 'assign_serial', rows: [{ ...row, serial_no: 9 }, row] });
    expect(parsed.rows.map((r) => 'serial_no' in r)).toEqual([false, false]);
  });

  it('keeps the serials in use_given_serial mode', () => {
    const parsed = bulkInsertBody.parse({ project_type: 'tin', mode: 'use_given_serial', rows: [{ ...row, serial_no: 9 }, { ...row, serial_no: 3 }] });
    expect(parsed.rows.map((r) => ('serial_no' in r ? r.serial_no : undefined))).toEqual([9, 3]);
  });

  it('requires a serial on every row in use_given_serial mode, naming the row', () => {
    const rows = [{ ...row, serial_no: 1 }, { ...row, serial_no: 2 }, row];
    expect(reasonOf(bulkInsertBody, { project_type: 'tin', mode: 'use_given_serial', rows })).toEqual({ reason: 'required', path: 'rows.2.serial_no' });
  });

  it('refuses a serial repeated inside the batch', () => {
    const rows = [{ ...row, serial_no: 4 }, { ...row, serial_no: 4 }];
    expect(reasonOf(bulkInsertBody, { project_type: 'tin', mode: 'use_given_serial', rows })).toEqual({ reason: 'duplicate', path: 'rows.1.serial_no' });
  });

  it('names an invalid row', () => {
    expect(reasonOf(bulkInsertBody, { project_type: 'tin', mode: 'assign_serial', rows: [row, { ...row, year: 1999 }] }).path).toBe('rows.1.year');
  });

  it('refuses no rows and an unknown mode', () => {
    fails(bulkInsertBody, { project_type: 'tin', mode: 'assign_serial', rows: [] });
    fails(bulkInsertBody, { project_type: 'tin', mode: 'merge', rows: [row] });
  });
});

describe('bulkUpdateBody', () => {
  it('drops blank required text and nulls, and keeps an empty address', () => {
    const parsed = bulkUpdateBody.parse({ project_type: 'tin', rows: [{ serial_no: 3, name: '  ', division: null, address: '', year: 2024 }] });
    expect(parsed.rows[0]).toEqual({ serial_no: 3, address: '', year: 2024 });
  });

  it('checks the given fields and requires the serial', () => {
    fails(bulkUpdateBody, { project_type: 'tin', rows: [{ name: 'x' }] });
    fails(bulkUpdateBody, { project_type: 'tin', rows: [{ serial_no: 3, year: 1999 }] });
    fails(bulkUpdateBody, { project_type: 'tin', rows: [{ serial_no: 3, name: 'ক'.repeat(201) }] });
    fails(bulkUpdateBody, { project_type: 'tin', rows: [] });
  });
});

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

describe('write schemas as JSON Schema', () => {
  it.each([
    ['createBody', createBody],
    ['updateBody', updateBody],
    ['changeSerialBody', changeSerialBody],
    ['bulkInsertBody', bulkInsertBody],
    ['bulkUpdateBody', bulkUpdateBody],
    ['activityQuery', activityQuery],
    ['activityBody', activityBody],
  ] as const)('%s converts with no unresolvable $defs refs', (_name, schema) => {
    expect(JSON.stringify(z.toJSONSchema(schema, { io: 'input' }))).not.toContain('#/$defs');
  });
});
