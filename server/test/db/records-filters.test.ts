// The shared record-filter builder (server/src/records/filters.ts) through real queries: the list and
// the filtered stats both use it, so the cards count exactly what the list shows
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, U47).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { recordFilters, type FilterFields } from '../../src/records/filters.js';
import { appDb, insertField, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const FIELDS: FilterFields = { filterable: new Map([['trade', 'category'], ['amount', 'money']]), searchable: ['trade'] };

async function namesFor(keys: string[], query: Parameters<typeof recordFilters>[3], filters = new Map<string, string>(), fields = FIELDS) {
  const conditions = [app`b.project_type = any(${keys})`, ...recordFilters(app, fields, filters, query)];
  const where = conditions.reduce((all, c) => app`${all} and ${c}`);
  const rows = await app<{ name: string }[]>`select b.name from public.housing_beneficiaries b where ${where} order by b.name`;
  return rows.map((r) => r.name);
}

describe('recordFilters', () => {
  beforeEach(async () => {
    for (const key of ['fa', 'fb']) {
      await insertProject(owner, { key });
      await insertField(owner, { project_key: key, key: 'trade', type: 'category', filterable: true, searchable: true });
      await insertField(owner, { project_key: key, key: 'amount', type: 'money', filterable: true });
    }
    await insertRecord(app, { project_type: 'fa', name: 'ক এক', year: 2024, extra: { trade: 'দর্জি', amount: 100 } });
    await insertRecord(app, { project_type: 'fb', name: 'খ দুই', year: 2025, extra: { trade: 'মুদি', amount: 200 } });
    await insertRecord(app, { project_type: 'fb', name: 'গ_তিন%', year: 2025, extra: { trade: 'দর্জি' } });
  });

  it('filters over several project keys at once', async () => {
    expect(await namesFor(['fa', 'fb'], {})).toEqual(['ক এক', 'খ দুই', 'গ_তিন%']);
    expect(await namesFor(['fa', 'fb'], { year: 2025 })).toEqual(['খ দুই', 'গ_তিন%']);
    expect(await namesFor(['fa', 'fb'], {}, new Map([['trade', 'দর্জি']]))).toEqual(['ক এক', 'গ_তিন%']);
    expect(await namesFor(['fa', 'fb'], {}, new Map([['amount', '200']]))).toEqual(['খ দুই']);
  });

  it('ignores an f.<key> the fields don\'t allow, and a blank value', async () => {
    expect(await namesFor(['fa', 'fb'], {}, new Map([['secret', 'x'], ['trade', '  ']]))).toHaveLength(3);
    const noTrade: FilterFields = { filterable: new Map(), searchable: [] };
    expect(await namesFor(['fa', 'fb'], {}, new Map([['trade', 'মুদি']]), noTrade)).toHaveLength(3);
  });

  it('searches the base columns and only the searchable custom fields, with % and _ literal', async () => {
    expect(await namesFor(['fa', 'fb'], { q: 'মুদি' })).toEqual(['খ দুই']);
    expect(await namesFor(['fa', 'fb'], { q: 'মুদি' }, new Map(), { ...FIELDS, searchable: [] })).toEqual([]);
    expect(await namesFor(['fa', 'fb'], { q: '_' })).toEqual(['গ_তিন%']);
    expect(await namesFor(['fa', 'fb'], { q: '%' })).toEqual(['গ_তিন%']);
  });

  it('refuses a money filter that is not a number, as the list does', async () => {
    await expect(namesFor(['fa'], {}, new Map([['amount', 'বারো']]))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  });
});
