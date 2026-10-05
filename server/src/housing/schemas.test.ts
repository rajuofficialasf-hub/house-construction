import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { idParams, listQuery, nextSerialQuery, projectTypeQuery, serialParams, serialsQuery } from './schemas.js';

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
