// housing_project_stats and housing_projects_overview (server/db/migrations/0016_project_stats.sql).
// Expected values are counted by hand from the rows each test inserts.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, insertField, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();

afterAll(() => Promise.all([app.end(), owner.end()]));

async function stats(key: string, light = false, publicOnly = false) {
  const [row] = await app`select public.housing_project_stats(${key}, ${light}, ${publicOnly}) as s`;
  return row?.s as Record<string, any>;
}

async function overview(drafts: boolean) {
  const [row] = await app`select public.housing_projects_overview(${drafts}) as o`;
  return row?.o as { projects: Record<string, any>[]; global: Record<string, number> };
}

async function setThumb(id: string, url: string, createdAt: Date) {
  await owner`update public.housing_beneficiaries set current_thumb_url = ${url}, current_photo_url = ${url}, created_at = ${createdAt} where id = ${id}`;
}

beforeEach(async () => {
  await resetTestData(owner);
  await insertField(owner, { project_key: 'semi_pucca', key: 'amount', type: 'money' });
  await insertField(owner, { project_key: 'semi_pucca', key: 'family_size', type: 'number' });
  await insertField(owner, { project_key: 'semi_pucca', key: 'trade', type: 'category' });
  await insertField(owner, { project_key: 'semi_pucca', key: 'phone', type: 'phone', visibility: 'admin' });
  await insertField(owner, { project_key: 'semi_pucca', key: 'old_cost', type: 'money', is_active: false });
  await insertRecord(app, {
    year: 2024, division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর', union_name: 'দলদলিয়া',
    extra: { amount: 5000, family_size: 4, trade: 'দর্জি' },
  });
  await insertRecord(app, {
    year: 2024, division: 'রংপুর', district: 'কুড়িগ্রাম', upazila: 'উলিপুর', union_name: 'দলদলিয়া',
    extra: { amount: 3000, trade: 'দর্জি' },
  });
  await insertRecord(app, {
    year: 2023, division: 'রংপুর', district: 'লালমনিরহাট', upazila: 'সদর',
    extra: { amount: 2000, family_size: 6, trade: 'মুদি' },
  });
  await insertRecord(app, { project_type: 'tin', year: 2025, division: 'ঢাকা', district: 'গাজীপুর', upazila: 'সদর', union_name: 'বাড়িয়া' });
});

describe('housing_project_stats', () => {
  it('counts a leaf by year and place, with its unions, field sums and category breakdown', async () => {
    expect(await stats('semi_pucca')).toEqual({
      total: 3,
      by_year: { '2023': 1, '2024': 2 },
      by_division: { রংপুর: 3 },
      by_district: { কুড়িগ্রাম: 2, লালমনিরহাট: 1 },
      by_upazila: { উলিপুর: 2, সদর: 1 },
      by_location: { 'কুড়িগ্রাম|উলিপুর': 2, 'লালমনিরহাট|সদর': 1 },
      distinct: { divisions: 1, districts: 2, upazilas: 2, unions: 1 },
      by_project: { semi_pucca: 3 },
      by_union: { 'কুড়িগ্রাম|উলিপুর|দলদলিয়া': 2 },
      fields: {
        amount: { type: 'money', sum: 10000, count: 3 },
        family_size: { type: 'number', sum: 10, count: 2 },
        trade: {
          type: 'category',
          distinct: 2,
          by_value: {
            দর্জি: { n: 2, sums: { amount: 8000, family_size: 4 } },
            মুদি: { n: 1, sums: { amount: 2000, family_size: 6 } },
          },
        },
      },
    });
  });

  it('leaves private and archived fields out of the field stats', async () => {
    const { fields } = await stats('semi_pucca');
    expect(Object.keys(fields).sort()).toEqual(['amount', 'family_size', 'trade']);
  });

  it('sums a group over its children and lists every child in by_project, including an empty one', async () => {
    await insertProject(owner, { key: 'empty_child', parent_key: 'housing', file_prefix: 'emptychild' });
    const s = await stats('housing');
    expect(s.total).toBe(4);
    expect(s.by_project).toEqual({ semi_pucca: 3, tin: 1, empty_child: 0 });
    expect(s.by_union).toEqual({ 'কুড়িগ্রাম|উলিপুর|দলদলিয়া': 2, 'গাজীপুর|সদর|বাড়িয়া': 1 });
    expect(s.distinct).toEqual({ divisions: 2, districts: 3, upazilas: 3, unions: 2 });
  });

  it('light stats keep the counts and sums but have an empty by_union and no by_value', async () => {
    const s = await stats('semi_pucca', true);
    expect(s.total).toBe(3);
    expect(s.by_union).toEqual({});
    expect(s.fields.amount).toEqual({ type: 'money', sum: 10000, count: 3 });
    expect(s.fields.trade).toEqual({ type: 'category', distinct: 2 });
  });

  it('sums only JSON numbers and counts only non-empty category strings', async () => {
    await insertRecord(app, { extra: { trade: '' } });
    await insertRecord(app, { extra: {} });
    const s = await stats('semi_pucca');
    expect(s.total).toBe(5);
    expect(s.fields.amount).toEqual({ type: 'money', sum: 10000, count: 3 });
    expect(s.fields.trade.distinct).toBe(2);
  });

  it('with p_public_only, a published group counts only its published children', async () => {
    await insertProject(owner, { key: 'draft_child', parent_key: 'housing', is_published: false, file_prefix: 'draftchild' });
    await insertField(owner, { project_key: 'draft_child', key: 'secret_sum', type: 'money' });
    await insertRecord(app, { project_type: 'draft_child', union_name: 'গোপন', extra: { secret_sum: 99 } });

    const visitor = await stats('housing', false, true);
    expect(visitor.total).toBe(4);
    expect(visitor.by_project).toEqual({ semi_pucca: 3, tin: 1 });
    expect(visitor.fields).not.toHaveProperty('secret_sum');
    expect(JSON.stringify(visitor.by_union)).not.toContain('গোপন');

    const admin = await stats('housing', false, false);
    expect(admin.total).toBe(5);
    expect(admin.by_project).toEqual({ semi_pucca: 3, tin: 1, draft_child: 1 });
    expect(admin.fields.secret_sum).toEqual({ type: 'money', sum: 99, count: 1 });
  });

  it('gives zeros and empty maps for an unknown key', async () => {
    expect(await stats('no_such_project')).toMatchObject({ total: 0, by_project: {}, by_union: {}, fields: {} });
  });
});

describe('housing_projects_overview', () => {
  it('lists the published projects in order with light stats, and totals over published leaves', async () => {
    const o = await overview(false);
    expect(o.projects.map((p) => p.key)).toEqual(['housing', 'semi_pucca', 'tin']);
    const semi = o.projects.find((p) => p.key === 'semi_pucca')!;
    expect(semi.stats.total).toBe(3);
    expect(semi.stats.by_union).toEqual({});
    expect(semi.stats.fields.trade).toEqual({ type: 'category', distinct: 2 });
    expect(semi.without_photo).toBeNull();
    expect(o.global).toEqual({ projects: 2, total: 4, districts: 3 });
  });

  it('features the newest record with a thumbnail, and null when none has one', async () => {
    const older = await insertRecord(app, { name: 'পুরনো' });
    const newer = await insertRecord(app, { name: 'নতুন' });
    await setThumb(older.id, 'http://api.test/api/v1/photos/older', new Date('2025-01-01T00:00:00Z'));
    await setThumb(newer.id, 'http://api.test/api/v1/photos/newer', new Date('2025-06-01T00:00:00Z'));

    const o = await overview(false);
    expect(o.projects.find((p) => p.key === 'semi_pucca')!.featured).toEqual({
      thumb_url: 'http://api.test/api/v1/photos/newer',
      name: 'নতুন',
      serial_no: newer.serial_no,
      project_type: 'semi_pucca',
      photo_updated_at: null,
    });
    expect(o.projects.find((p) => p.key === 'tin')!.featured).toBeNull();
  });

  it('hides drafts and a draft child\'s photo from visitors, and shows them with p_drafts', async () => {
    await insertProject(owner, { key: 'draft_child', parent_key: 'housing', is_published: false, file_prefix: 'draftchild' });
    const draft = await insertRecord(app, { project_type: 'draft_child', name: 'খসড়া' });
    await setThumb(draft.id, 'http://api.test/api/v1/photos/draft', new Date('2030-01-01T00:00:00Z'));

    const visitor = await overview(false);
    expect(visitor.projects.map((p) => p.key)).not.toContain('draft_child');
    expect(JSON.stringify(visitor)).not.toContain('photos/draft');
    expect(visitor.projects.find((p) => p.key === 'housing')!.featured).toBeNull();

    const admin = await overview(true);
    expect(admin.projects.map((p) => p.key)).toContain('draft_child');
    expect(admin.projects.find((p) => p.key === 'housing')!.featured.thumb_url).toBe('http://api.test/api/v1/photos/draft');
    expect(admin.projects.find((p) => p.key === 'housing')!.without_photo).toBe(4);
    expect(admin.global).toEqual({ projects: 2, total: 4, districts: 3 });
  });
});
