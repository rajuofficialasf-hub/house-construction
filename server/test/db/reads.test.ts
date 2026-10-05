import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getFilterOptions,
  getNextSerial,
  getRecordById,
  getRecordBySerial,
  getRecordsBySerials,
  getStats,
  getYears,
  listRecords,
} from '../../src/housing/reads.js';
import { listQuery } from '../../src/housing/schemas.js';
import { appDb, insertRecord, ownerDb, resetTestData, type RecordInput } from '../support/db.js';

// The read service against the real test database, as the runtime role, so the grants are proven too.
const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const list = (query: Record<string, string> = {}) => listRecords(app, listQuery.parse(query));
const serials = async (query: Record<string, string> = {}) => (await list(query)).data.map((r) => `${r.project_type}:${r.serial_no}`);

const CONTRACT_FIELDS = [
  'id', 'project_type', 'serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila',
  'address', 'prev_photo_url', 'prev_thumb_url', 'current_photo_url', 'current_thumb_url', 'prev_photo_source',
  'current_photo_source', 'photo_updated_at', 'created_at', 'updated_at',
];

async function insertMany(...inputs: RecordInput[]) {
  for (const input of inputs) await insertRecord(app, input);
}

describe('listRecords', () => {
  it('returns only the contract fields', async () => {
    await insertRecord(app);
    const { data } = await list();
    expect(Object.keys(data[0] ?? {}).sort()).toEqual([...CONTRACT_FIELDS].sort());
  });

  it('gives an empty first page with total_pages 1 on an empty table', async () => {
    expect(await list()).toEqual({ data: [], meta: { page: 1, page_size: 50, total: 0, total_pages: 1 } });
  });

  it('filters by each field and by several at once', async () => {
    await insertMany(
      { project_type: 'semi_pucca', year: 2023, division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর' },
      { project_type: 'semi_pucca', year: 2024, division: 'রংপুর', district: 'লালমনিরহাট', upazila: 'সদর' },
      { project_type: 'tin', year: 2024, division: 'ঢাকা', district: 'গাজীপুর', upazila: 'সদর' },
    );
    expect(await serials({ project_type: 'tin' })).toEqual(['tin:1']);
    expect(await serials({ serial_no: '2' })).toEqual(['semi_pucca:2']);
    expect(await serials({ year: '2024' })).toEqual(['tin:1', 'semi_pucca:2']);
    expect(await serials({ division: 'রংপুর' })).toEqual(['semi_pucca:1', 'semi_pucca:2']);
    expect(await serials({ district: 'গাজীপুর' })).toEqual(['tin:1']);
    expect(await serials({ upazila: 'সদর', year: '2024', project_type: 'semi_pucca' })).toEqual(['semi_pucca:2']);
    expect((await list({ upazila: 'সদর' })).meta.total).toBe(2);
  });

  it('matches a filter typed in either Unicode form', async () => {
    await insertRecord(app, { district: 'কুড়িগ্রাম'.normalize('NFC') });
    expect(await serials({ district: 'কুড়িগ্রাম' })).toEqual(['semi_pucca:1']);
  });

  it('searches name, parent name and address, case-insensitively', async () => {
    await insertMany(
      { name: 'Rahima Khatun' },
      { name: 'অন্য', father_or_husband_name: 'Abdul RAHIM' },
      { name: 'অন্য', address: 'গ্রাম: rahimpur' },
      { name: 'কেউ না' },
    );
    expect(await serials({ q: 'rahim' })).toEqual(['semi_pucca:1', 'semi_pucca:2', 'semi_pucca:3']);
    expect(await serials({ q: 'রহিম' })).toEqual([]);
  });

  it('applies serial_no and q together', async () => {
    await insertMany({ name: 'করিম' }, { name: 'করিম' });
    expect(await serials({ q: 'করিম', serial_no: '2' })).toEqual(['semi_pucca:2']);
  });

  it('matches %, _ and \\ in q literally', async () => {
    await insertMany({ name: '50% ছাড়' }, { name: 'a_b' }, { name: 'a\\b' }, { name: 'aXb 50 ছাড়' });
    expect(await serials({ q: '%' })).toEqual(['semi_pucca:1']);
    expect(await serials({ q: 'a_b' })).toEqual(['semi_pucca:2']);
    expect(await serials({ q: 'a\\b' })).toEqual(['semi_pucca:3']);
    expect(await serials({ q: '(,)' })).toEqual([]);
  });

  it('sorts by each field in both orders', async () => {
    await insertMany(
      { year: 2025, name: 'খ', created_at: new Date('2026-01-03T00:00:00Z') },
      { year: 2023, name: 'গ', created_at: new Date('2026-01-01T00:00:00Z') },
      { year: 2024, name: 'ক', created_at: new Date('2026-01-02T00:00:00Z') },
    );
    expect(await serials()).toEqual(['semi_pucca:1', 'semi_pucca:2', 'semi_pucca:3']);
    expect(await serials({ order: 'desc' })).toEqual(['semi_pucca:3', 'semi_pucca:2', 'semi_pucca:1']);
    expect(await serials({ sort: 'year' })).toEqual(['semi_pucca:2', 'semi_pucca:3', 'semi_pucca:1']);
    expect(await serials({ sort: 'year', order: 'desc' })).toEqual(['semi_pucca:1', 'semi_pucca:3', 'semi_pucca:2']);
    expect(await serials({ sort: 'created_at' })).toEqual(['semi_pucca:2', 'semi_pucca:3', 'semi_pucca:1']);
    expect(await serials({ sort: 'created_at', order: 'desc' })).toEqual(['semi_pucca:1', 'semi_pucca:3', 'semi_pucca:2']);
    const byName = await serials({ sort: 'name' });
    expect(byName).toHaveLength(3);
    expect(await serials({ sort: 'name', order: 'desc' })).toEqual([...byName].reverse());
  });

  it('breaks ties by serial, then project type, so pages of both projects never overlap or skip', async () => {
    await insertMany(
      { project_type: 'tin', year: 2024 },
      { project_type: 'semi_pucca', year: 2024 },
      { project_type: 'tin', year: 2024 },
      { project_type: 'semi_pucca', year: 2024 },
    );
    const pages: string[] = [];
    for (let page = 1; page <= 4; page++) pages.push(...(await serials({ sort: 'year', page_size: '1', page: String(page) })));
    expect(pages).toEqual(['semi_pucca:1', 'tin:1', 'semi_pucca:2', 'tin:2']);
  });

  it('pages with the real total, and returns no rows past the end', async () => {
    await insertMany({}, {}, {});
    expect((await list({ page_size: '2' })).meta).toEqual({ page: 1, page_size: 2, total: 3, total_pages: 2 });
    expect(await serials({ page_size: '2', page: '2' })).toEqual(['semi_pucca:3']);
    expect(await list({ page_size: '2', page: '9' })).toEqual({ data: [], meta: { page: 9, page_size: 2, total: 3, total_pages: 2 } });
  });
});

describe('single records', () => {
  it('finds a record by id and by serial, and returns null when missing', async () => {
    const rec = await insertRecord(app, { project_type: 'tin' });
    expect((await getRecordById(app, rec.id))?.serial_no).toBe(1);
    expect(await getRecordById(app, '00000000-0000-4000-8000-ffffffffffff')).toBeNull();
    expect((await getRecordBySerial(app, 'tin', 1))?.id).toBe(rec.id);
    expect(await getRecordBySerial(app, 'semi_pucca', 1)).toBeNull();
  });

  it('returns the found serials of one project in serial order, leaving out missing ones', async () => {
    await insertMany({}, {}, {}, { project_type: 'tin' });
    const found = await getRecordsBySerials(app, 'semi_pucca', [1, 3, 99]);
    expect(found.map((r) => r.serial_no)).toEqual([1, 3]);
    expect(Object.keys(found[0] ?? {}).sort()).toEqual([...CONTRACT_FIELDS].sort());
  });
});

describe('aggregates', () => {
  beforeEach(() =>
    insertMany(
      { year: 2023, division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর' },
      { year: 2024, division: 'খুলনা', district: 'বাগেরহাট', upazila: 'মোংলা' },
      { project_type: 'tin', year: 2025, division: 'ঢাকা', district: 'গাজীপুর', upazila: 'সদর' },
    ),
  );

  it('returns stats for all projects or one', async () => {
    expect(await getStats(app)).toMatchObject({ total: 3, distinct: { divisions: 3, districts: 3, upazilas: 3 } });
    expect(await getStats(app, 'tin')).toMatchObject({ total: 1, by_year: { '2025': 1 } });
  });

  it('returns years newest first, for all projects or one', async () => {
    expect(await getYears(app)).toEqual([2025, 2024, 2023]);
    expect(await getYears(app, 'semi_pucca')).toEqual([2024, 2023]);
  });

  it('returns the next serial of a project', async () => {
    expect(await getNextSerial(app, 'semi_pucca')).toBe(3);
    expect(await getNextSerial(app, 'tin')).toBe(2);
  });

  it('returns filter options in Bengali order with years newest first', async () => {
    const collator = new Intl.Collator('bn');
    const options = await getFilterOptions(app);
    expect(options.years).toEqual([2025, 2024, 2023]);
    expect(options.divisions).toEqual(['খুলনা', 'ঢাকা', 'রংপুর']);
    expect(options.divisions).toEqual([...options.divisions].sort(collator.compare));
    expect(options.districts).toEqual(['কুড়িগ্রাম', 'গাজীপুর', 'বাগেরহাট']);
    expect(options.upazilas).toEqual(['উলিপুর', 'মোংলা', 'সদর']);
    expect(await getFilterOptions(app, 'tin')).toEqual({ years: [2025], divisions: ['ঢাকা'], districts: ['গাজীপুর'], upazilas: ['সদর'] });
  });

  it('returns empty lists and zeros for an empty table', async () => {
    await resetTestData(owner);
    expect(await getFilterOptions(app)).toEqual({ years: [], divisions: [], districts: [], upazilas: [] });
    expect(await getYears(app)).toEqual([]);
    expect(await getStats(app)).toMatchObject({ total: 0, by_year: {} });
  });
});
