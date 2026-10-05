import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();

beforeEach(async () => {
  await resetTestData(owner);
  await insertRecord(app, { year: 2024, division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর' });
  await insertRecord(app, { year: 2024, division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর' });
  await insertRecord(app, { year: 2023, division: 'রংপুর', district: 'লালমনিরহাট', upazila: 'সদর' });
  await insertRecord(app, { project_type: 'tin', year: 2025, division: 'ঢাকা', district: 'গাজীপুর', upazila: 'সদর' });
});
afterAll(() => Promise.all([app.end(), owner.end()]));

describe('housing_stats', () => {
  it('counts one project type by year, place and district|upazila pair', async () => {
    const [row] = await app`select public.housing_stats('semi_pucca') as s`;
    expect(row?.s).toEqual({
      total: 3,
      by_year: { '2023': 1, '2024': 2 },
      by_division: { রংপুর: 3 },
      by_district: { কুড়িগ্রাম: 2, লালমনিরহাট: 1 },
      by_upazila: { উলিপুর: 2, সদর: 1 },
      distinct: { divisions: 1, districts: 2, upazilas: 2 },
      by_location: { 'কুড়িগ্রাম|উলিপুর': 2, 'লালমনিরহাট|সদর': 1 },
    });
  });

  it('combines both project types when none is given, counting same-named upazilas per district', async () => {
    const [row] = await app`select public.housing_stats(null) as s`;
    expect(row?.s).toMatchObject({ total: 4, by_upazila: { উলিপুর: 2, সদর: 2 }, distinct: { divisions: 2, districts: 3, upazilas: 3 } });
  });

  it('returns zeros and empty maps for a project with no records', async () => {
    await resetTestData(owner);
    const [row] = await app`select public.housing_stats('tin') as s`;
    expect(row?.s).toMatchObject({ total: 0, by_year: {}, by_location: {} });
  });
});

describe('housing_years', () => {
  it('lists the years that have data, newest first', async () => {
    expect((await app`select year from public.housing_years(null)`).map((r) => r.year as number)).toEqual([2025, 2024, 2023]);
    expect((await app`select year from public.housing_years('tin')`).map((r) => r.year as number)).toEqual([2025]);
  });
});
