import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { recordCreateBody, recordPatchBody, serialBody } from './schemas.js';

// The record write bodies (docs/api/PROJECTS_API_CONTRACT.md §4.4.4, §4.4.5, §4.4.7, §5.1): strict objects,
// so an unknown key is a 400, and text trimmed and NFC-normalized, because stored text is NFC and
// filters compare exactly.

const fails = (schema: z.ZodType, input: unknown) => expect(schema.safeParse(input).success).toBe(false);

const record = {
  year: 2025,
  name: 'মমতাজ বেগম',
  division: 'ময়মনসিংহ',
  district: 'শেরপুর',
  upazila: 'নালিতাবাড়ী',
};

describe('recordCreateBody', () => {
  it('fills the optional fields with the contract defaults', () => {
    expect(recordCreateBody.parse(record)).toEqual({
      ...record,
      father_or_husband_name: '',
      address: '',
      union_name: '',
      extra: {},
      prev_photo_source: null,
      current_photo_source: null,
    });
  });

  it('trims and NFC-normalizes text', () => {
    const raw = 'বা\u09DCি';
    expect(recordCreateBody.parse({ ...record, name: `  ${raw}  ` }).name).toBe(raw.normalize('NFC'));
  });

  it.each([
    ['a blank name', { name: '   ' }],
    ['a 201-character name', { name: 'ক'.repeat(201) }],
    ['an empty division', { division: '' }],
    ['year 1999', { year: 1999 }],
    ['a fractional year', { year: 2025.5 }],
    ['a year sent as a string', { year: '2025' }],
    ['serial 0', { serial_no: 0 }],
    ['a serial above int4', { serial_no: 2147483648 }],
    ['a project type, which the path gives', { project_type: 'tin' }],
    ['an unknown key', { actor_email: 'x@example.org' }],
    ['a photo url, which only the photo routes set', { prev_photo_url: 'https://x' }],
    ['a 2001-character source', { prev_photo_source: 'h'.repeat(2001) }],
  ])('refuses %s', (_label, over) => {
    fails(recordCreateBody, { ...record, ...over });
  });

  it('accepts an explicit serial and turns a blank source into null', () => {
    const parsed = recordCreateBody.parse({ ...record, serial_no: 41, prev_photo_source: '  ', current_photo_source: ' https://x ' });
    expect(parsed).toMatchObject({ serial_no: 41, prev_photo_source: null, current_photo_source: 'https://x' });
  });
});

describe('recordPatchBody and serialBody', () => {
  it('keeps only the given fields, with no defaults added', () => {
    expect(recordPatchBody.parse({ name: ' নতুন নাম ' })).toEqual({ name: 'নতুন নাম' });
  });

  it('refuses an empty patch and a serial in a patch', () => {
    fails(recordPatchBody, {});
    fails(recordPatchBody, { serial_no: 3 });
  });

  it('takes one whole serial from 1', () => {
    expect(serialBody.parse({ serial_no: 7 })).toEqual({ serial_no: 7 });
    fails(serialBody, { serial_no: 0 });
    fails(serialBody, {});
  });
});
