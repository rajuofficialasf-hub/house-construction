// The project and field guards and the serial counter trigger (server/db/migrations/0015_project_guards.sql),
// as the runtime role meets them.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withActor } from '../../src/db.js';
import { appDb, insertField, insertPrivate, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();
const admin = { id: '22222222-2222-4222-8222-222222222222', email: 'admin@example.org' };

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const P = 'guard_p';
const SENTINEL = 'zz-sentinel-93';

interface PgError {
  code: string;
  message: string;
  detail?: string;
}

/** Runs a write that must be refused by a guard, and returns the error. */
async function refused(write: Promise<unknown>, detail: string): Promise<PgError> {
  const err = (await write.then(
    () => {
      throw new Error('write was accepted');
    },
    (e: unknown) => e,
  )) as PgError;
  expect(err.code).toBe('HC400');
  expect(err.detail).toBe(detail);
  expect(err.message).not.toContain(SENTINEL);
  return err;
}

const card = (more: Record<string, unknown> = {}) => ({ id: 'total', kind: 'count', label_bn: 'মোট', label_en: 'Total', ...more });
const setCards = (cards: unknown[]) =>
  app`update public.housing_projects set stat_cards = ${app.json(cards as never)} where key = ${P}`;
const counterOf = async (key: string) =>
  (await app<{ last_serial: number }[]>`select last_serial from public.housing_serial_counters where project_type = ${key}`)[0]?.last_serial;

describe('project guard', () => {
  beforeEach(() => insertProject(owner, { key: P, is_published: false }));

  it('refuses a reserved slug without echoing it', async () => {
    const err = await refused(app`update public.housing_projects set slug = 'admin' where key = ${P}`, 'slug');
    expect(err.message).not.toContain('admin');
  });

  it('lower-cases and trims the slug and normalises the texts', async () => {
    const decomposed = 'কো'.normalize('NFD');
    await app`update public.housing_projects set slug = ' Self-Reliance ', name_bn = ${`  ${decomposed} `} where key = ${P}`;
    const [row] = await app`select slug, name_bn from public.housing_projects where key = ${P}`;
    expect(row).toEqual({ slug: 'self-reliance', name_bn: 'কো'.normalize('NFC') });
  });

  it('refuses a parent that is not a group', async () => {
    await insertProject(owner, { key: 'other_leaf' });
    await refused(app`update public.housing_projects set parent_key = 'other_leaf' where key = ${P}`, 'parent_key');
  });

  it.each([
    ['nine cards', Array.from({ length: 9 }, (_, i) => card({ id: `c${i}` }))],
    ['a card with no id', [{ kind: 'count', label_bn: 'মোট' }]],
    ['a sum card with no field', [card({ kind: 'sum' })]],
    ['a geo card with a bad level', [card({ kind: 'geo', level: SENTINEL })]],
    ['four home cards', Array.from({ length: 4 }, (_, i) => card({ id: `c${i}`, home: true }))],
    ['a card that is not an object', [SENTINEL]],
  ])('refuses %s', async (_name, cards) => {
    await refused(setCards(cards), 'stat_cards');
  });

  it('accepts eight cards with three on the home page', async () => {
    await setCards(Array.from({ length: 8 }, (_, i) => card({ id: `c${i}`, home: i < 3 })));
  });

  it('never changes the key', async () => {
    await refused(app`update public.housing_projects set key = 'guard_q' where key = ${P}`, 'key');
  });

  it('keeps a published project\'s slug and parent, and lets a draft change them', async () => {
    await insertProject(owner, { key: 'grp', is_group: true });
    await app`update public.housing_projects set slug = 'new-slug', parent_key = 'grp' where key = ${P}`;
    await app`update public.housing_projects set is_published = true where key = ${P}`;
    await refused(app`update public.housing_projects set slug = 'another' where key = ${P}`, 'slug');
    await refused(app`update public.housing_projects set parent_key = null where key = ${P}`, 'parent_key');
  });

  it('keeps is_group while the project has a field or a record', async () => {
    await insertField(owner, { project_key: P, key: 'amount', type: 'money' });
    await refused(app`update public.housing_projects set is_group = true, file_prefix = null where key = ${P}`, 'is_group');
    await insertProject(owner, { key: 'with_rec' });
    await insertRecord(app, { project_type: 'with_rec' });
    await refused(app`update public.housing_projects set is_group = true, file_prefix = null where key = 'with_rec'`, 'is_group');
  });

  it('keeps a group a group while it has children', async () => {
    await refused(app`update public.housing_projects set is_group = false, file_prefix = 'hs' where key = 'housing'`, 'is_group');
  });

  it('keeps the photo mode while photos need it', async () => {
    await insertProject(owner, { key: 'pics', photo_mode: 'before_after' });
    const rec = await insertRecord(app, { project_type: 'pics' });
    await app`update public.housing_beneficiaries set prev_photo_url = 'p.webp' where id = ${rec.id}`;
    await refused(app`update public.housing_projects set photo_mode = 'after_only' where key = 'pics'`, 'photo_mode');
    await app`update public.housing_beneficiaries set prev_photo_url = null, current_photo_url = 'c.webp' where id = ${rec.id}`;
    await app`update public.housing_projects set photo_mode = 'after_only' where key = 'pics'`;
    await refused(app`update public.housing_projects set photo_mode = 'none' where key = 'pics'`, 'photo_mode');
  });

  // The count is the database's own, never a value the client sent; the wording is a8e2154's 10b.
  it('says how many records hold the photos the photo mode still needs', async () => {
    await insertProject(owner, { key: 'pics', photo_mode: 'before_after' });
    for (let i = 0; i < 2; i++) {
      const rec = await insertRecord(app, { project_type: 'pics' });
      await app`update public.housing_beneficiaries set prev_photo_url = 'p.webp', current_photo_url = 'c.webp' where id = ${rec.id}`;
    }
    const before = await refused(app`update public.housing_projects set photo_mode = 'after_only' where key = 'pics'`, 'photo_mode');
    expect(before.message).toBe('2 টি রেকর্ডে আগের ছবি আছে — ছবি মোড "শুধু পরের ছবি"/"ছবি নেই" করা যাবে না');
    await app`update public.housing_beneficiaries set prev_photo_url = null where project_type = 'pics'`;
    await app`update public.housing_projects set photo_mode = 'after_only' where key = 'pics'`;
    const current = await refused(app`update public.housing_projects set photo_mode = 'none' where key = 'pics'`, 'photo_mode');
    expect(current.message).toBe('2 টি রেকর্ডে ছবি আছে — ছবি মোড "ছবি নেই" করা যাবে না');
  });
});

describe('project delete', () => {
  it('refuses a group with children', async () => {
    await refused(app`delete from public.housing_projects where key = 'housing'`, 'parent_key');
  });

  it('refuses a leaf with records', async () => {
    await insertRecord(app, { project_type: 'tin' });
    await refused(app`delete from public.housing_projects where key = 'tin'`, 'key');
  });

  it('refuses a leaf that has issued a serial, even with no records left', async () => {
    await insertProject(owner, { key: P });
    const rec = await insertRecord(app, { project_type: P });
    await app`delete from public.housing_beneficiaries where id = ${rec.id}`;
    await refused(app`delete from public.housing_projects where key = ${P}`, 'key');
  });

  it('refuses a leaf whose counter row is missing', async () => {
    await insertProject(owner, { key: P });
    await owner`delete from public.housing_serial_counters where project_type = ${P}`;
    await refused(app`delete from public.housing_projects where key = ${P}`, 'key');
  });

  it('deletes a fresh leaf with its fields, logging each', async () => {
    await insertProject(owner, { key: P });
    await insertField(owner, { project_key: P, key: 'amount', type: 'money' });
    await insertField(owner, { project_key: P, key: 'phone', visibility: 'admin' });
    await owner`truncate public.housing_activity_log`;
    await withActor(app, admin, (tx) => tx`delete from public.housing_projects where key = ${P}`);
    expect(await app`select count(*)::int as n from public.housing_project_fields where project_key = ${P}`).toEqual([{ n: 0 }]);
    const rows = await app`select action, actor_email from public.housing_activity_log order by id`;
    expect(rows.map((r) => r.action)).toEqual(['field_delete', 'field_delete', 'project_delete']);
    expect(rows.every((r) => r.actor_email === admin.email)).toBe(true);
  });
});

describe('serial counter', () => {
  it('lives from create through delete and re-create, never reset', async () => {
    await insertProject(owner, { key: P });
    expect(await counterOf(P)).toBe(0);
    expect(await app`select public.housing_next_serial(${P}) as n`).toEqual([{ n: 1 }]);
    await app`delete from public.housing_projects where key = ${P}`;
    await owner`update public.housing_serial_counters set last_serial = 7 where project_type = ${P}`;
    await insertProject(owner, { key: P });
    expect(await counterOf(P)).toBe(7);
  });

  it('gives a group none, and one when the group becomes a leaf', async () => {
    await insertProject(owner, { key: 'grp', is_group: true });
    expect(await counterOf('grp')).toBeUndefined();
    await app`update public.housing_projects set is_group = false, file_prefix = 'grp' where key = 'grp'`;
    expect(await counterOf('grp')).toBe(0);
  });
});

describe('field guard', () => {
  beforeEach(() => insertProject(owner, { key: P }));

  it('refuses a field on a group', async () => {
    await refused(insertField(app, { project_key: 'housing', key: 'amount' }), 'project_key');
  });

  it('refuses the 41st field', async () => {
    for (let i = 0; i < 40; i++) await insertField(owner, { project_key: P, key: `f${i}` });
    await refused(insertField(app, { project_key: P, key: 'f40' }), 'key');
  });

  it('normalises the labels', async () => {
    const id = await insertField(app, { project_key: P, key: 'tribe', label_bn: `  ${'কো'.normalize('NFD')} ` });
    expect(await app`select label_bn from public.housing_project_fields where id = ${id}`).toEqual([{ label_bn: 'কো'.normalize('NFC') }]);
  });

  describe('with a value stored', () => {
    let id: string;
    beforeEach(async () => {
      id = await insertField(owner, { project_key: P, key: 'amount', type: 'money' });
      await insertRecord(app, { project_type: P, extra: { amount: 500 } });
    });

    it('refuses a delete, and a key, type or visibility change, but takes a label change', async () => {
      await refused(app`delete from public.housing_project_fields where id = ${id}`, 'key');
      await refused(app`update public.housing_project_fields set key = 'sum' where id = ${id}`, 'key');
      await refused(app`update public.housing_project_fields set type = 'number' where id = ${id}`, 'type');
      await refused(app`update public.housing_project_fields set visibility = 'admin' where id = ${id}`, 'visibility');
      await app`update public.housing_project_fields set label_bn = 'টাকা' where id = ${id}`;
    });
  });

  it('counts a private value as used', async () => {
    const id = await insertField(owner, { project_key: P, key: 'nid', type: 'text', visibility: 'admin' });
    const rec = await insertRecord(app, { project_type: P });
    await insertPrivate(app, rec.id, { nid: '1234567890' });
    await refused(app`update public.housing_project_fields set visibility = 'public' where id = ${id}`, 'visibility');
    await refused(app`delete from public.housing_project_fields where id = ${id}`, 'key');
  });

  it('lets an unused field change its key', async () => {
    const id = await insertField(owner, { project_key: P, key: 'amount', type: 'money' });
    await app`update public.housing_project_fields set key = 'sum' where id = ${id}`;
  });

  it('never moves a field to another project', async () => {
    await insertProject(owner, { key: 'other_p' });
    const id = await insertField(owner, { project_key: P, key: 'amount' });
    await refused(app`update public.housing_project_fields set project_key = 'other_p' where id = ${id}`, 'project_key');
  });
});
