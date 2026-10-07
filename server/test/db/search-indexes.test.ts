import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withActor } from '../../src/db.js';
import { listActivity } from '../../src/housing/activity.js';
import { activityQuery } from '../../src/housing/schemas.js';
import { listProjectRecords, recordProject } from '../../src/records/reads.js';
import { recordListQuery } from '../../src/records/schemas.js';
import { appDb, insertRecord, ownerDb, resetTestData } from '../support/db.js';

// The trigram and activity indexes from server/db/migrations/0010_search_and_activity_indexes.sql,
// queried as the runtime role: the search and the activity filters still answer correctly, and the
// planner can use the new indexes (forced with enable_seqscan off, since the test tables are tiny).
const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const planFor = (query: string, ...params: string[]) =>
  app.begin(async (tx) => {
    await tx`set local enable_seqscan = off`;
    const rows = await tx.unsafe(`explain ${query}`, params);
    return rows.map((r) => String(r['QUERY PLAN'])).join('\n');
  });

describe('search and activity indexes', () => {
  it('still finds records by name, father’s name and address as housing_app', async () => {
    await insertRecord(owner, { name: 'রহিমা খাতুন', father_or_husband_name: 'করিম', address: 'চরপাড়া' });
    await insertRecord(owner, { name: 'আবুল', father_or_husband_name: 'রহিম উদ্দিন', address: 'নদীর ধার' });
    await insertRecord(owner, { name: 'সালমা', father_or_husband_name: 'জব্বার', address: 'রহিমপুর' });
    await insertRecord(owner, { name: 'অন্য কেউ', father_or_husband_name: 'কেউ না', address: 'দূরে' });

    const visitor = { admin: false, drafts: [] };
    const project = await recordProject(app, 'semi_pucca', visitor);
    const found = await listProjectRecords(app, project, recordListQuery.parse({ q: 'রহিম' }), new Map(), visitor);
    expect(found.data.map((r) => r.name).sort()).toEqual(['আবুল', 'রহিমা খাতুন', 'সালমা'].sort());
  });

  it('lets the planner use the trigram indexes for the search', async () => {
    const plan = await planFor(
      `select id from public.housing_beneficiaries
       where name ilike $1 escape '\\' or father_or_husband_name ilike $1 escape '\\' or address ilike $1 escape '\\'`,
      '%রহিম%',
    );
    expect(plan).toContain('housing_beneficiaries_name_trgm_idx');
    expect(plan).toContain('housing_beneficiaries_father_trgm_idx');
    expect(plan).toContain('housing_beneficiaries_address_trgm_idx');
  });

  it('still filters the activity log by project and by actor email as housing_app', async () => {
    const actor = { id: '11111111-1111-4111-8111-111111111111', email: 'first@example.org' };
    await withActor(app, actor, (tx) => insertRecord(tx, { project_type: 'tin' }));
    await withActor(app, { ...actor, email: 'second@example.org' }, (tx) => insertRecord(tx, { project_type: 'semi_pucca' }));

    const byProject = await listActivity(app, activityQuery.parse({ project_type: 'tin' }));
    expect(byProject.data.map((e) => e.project_type)).toEqual(['tin']);
    const byActor = await listActivity(app, activityQuery.parse({ actor_email: 'second@' }));
    expect(byActor.data.map((e) => e.actor_email)).toEqual(['second@example.org']);
  });

  it('lets the planner use the activity indexes for the project and actor filters', async () => {
    expect(await planFor(`select id from public.housing_activity_log where project_type = $1 order by at desc`, 'tin')).toContain(
      'housing_activity_log_project_at_idx',
    );
    expect(await planFor(`select id from public.housing_activity_log where actor_email ilike $1`, '%second@%')).toContain(
      'housing_activity_log_actor_email_trgm_idx',
    );
  });
});
