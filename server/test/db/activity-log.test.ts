import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withActor } from '../../src/db.js';
import { appDb, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();
const admin = { id: '22222222-2222-4222-8222-222222222222', email: 'admin@example.org' };

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

async function log() {
  return app`select actor_id, actor_email, action, serial_no, record_name, details from public.housing_activity_log order by id`;
}

describe('activity log trigger', () => {
  it('records a create with the acting admin', async () => {
    await withActor(app, admin, (tx) => insertRecord(tx, { name: 'রহিম' }));
    const [entry] = await log();
    expect(entry).toMatchObject({ actor_id: admin.id, actor_email: admin.email, action: 'create', serial_no: 1, record_name: 'রহিম' });
    expect(entry?.details).toMatchObject({ year: 2024, has_prev_photo: false, has_current_photo: false });
  });

  it('records an update with old and new values', async () => {
    const rec = await insertRecord(app, { name: 'রহিম' });
    await withActor(app, admin, (tx) => tx`update public.housing_beneficiaries set name = 'করিম' where id = ${rec.id}`);
    const entry = (await log()).at(-1);
    expect(entry).toMatchObject({ action: 'update', actor_email: admin.email });
    expect(entry?.details).toEqual({ changes: { name: { old: 'রহিম', new: 'করিম' } }, photo_kinds: [] });
  });

  it('writes nothing for an update that changes no tracked field', async () => {
    const rec = await insertRecord(app);
    await app`update public.housing_beneficiaries set photo_updated_at = now() where id = ${rec.id}`;
    expect((await log()).map((e) => e.action)).toEqual(['create']);
  });

  it('records a photo-only change as photo_update', async () => {
    const rec = await insertRecord(app);
    await app`update public.housing_beneficiaries set current_photo_url = 'x.webp' where id = ${rec.id}`;
    const entry = (await log()).at(-1);
    expect(entry?.action).toBe('photo_update');
    expect(entry?.details).toEqual({ changes: { current_photo: { old: false, new: true } }, photo_kinds: ['current'] });
  });

  it('records a serial change and a delete', async () => {
    const rec = await insertRecord(app);
    await withActor(app, admin, async (tx) => {
      await tx`select public.housing_change_serial(${rec.id}, 4)`;
      await tx`delete from public.housing_beneficiaries where id = ${rec.id}`;
    });
    expect((await log()).map((e) => [e.action, e.serial_no, e.actor_id])).toEqual([
      ['create', 1, null],
      ['serial_change', 4, admin.id],
      ['delete', 4, admin.id],
    ]);
  });

  it('records the login role when no actor is set', async () => {
    await insertRecord(app);
    expect((await log())[0]).toMatchObject({ actor_id: null, actor_email: 'housing_app' });
  });

  it('does not carry the actor over to the next transaction on the same connection', async () => {
    const single = appDb();
    try {
      await withActor(single, admin, (tx) => insertRecord(tx));
      await insertRecord(single);
      expect((await log()).map((e) => e.actor_email)).toEqual([admin.email, 'housing_app']);
    } finally {
      await single.end();
    }
  });
});

describe('housing_log_event', () => {
  it('records a client event with the acting admin', async () => {
    await withActor(app, admin, (tx) => tx`select public.housing_log_event('login', ${tx.json({ ip: 'x' })}, null)`);
    expect(await log()).toEqual([
      { actor_id: admin.id, actor_email: admin.email, action: 'login', serial_no: null, record_name: null, details: { ip: 'x' } },
    ]);
  });

  it('refuses an action name that is not lowercase letters and underscores', async () => {
    await expect(app`select public.housing_log_event('Login', '{}'::jsonb, null)`).rejects.toMatchObject({ code: '22023' });
    await expect(app`select public.housing_log_event(${'a'.repeat(41)}, '{}'::jsonb, null)`).rejects.toMatchObject({ code: '22023' });
  });
});
