import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withActor } from '../../src/db.js';
import { appDb, insertRecord, ownerDb, resetTestData } from '../support/db.js';

const app = appDb();
const owner = ownerDb();
const admin = { id: '11111111-1111-4111-8111-111111111111', email: 'admin@example.org' };

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

async function nextSerial(projectType: string): Promise<number | null> {
  const [row] = await app<{ n: number | null }[]>`select public.housing_next_serial(${projectType}) as n`;
  return row?.n ?? null;
}

describe('serial numbers', () => {
  it('assigns serials from 1 per project type, independently', async () => {
    const semi = [await insertRecord(app), await insertRecord(app), await insertRecord(app)];
    const tin = [await insertRecord(app, { project_type: 'tin' }), await insertRecord(app, { project_type: 'tin' })];
    expect(semi.map((r) => r.serial_no)).toEqual([1, 2, 3]);
    expect(tin.map((r) => r.serial_no)).toEqual([1, 2]);
  });

  it('never reuses the serial of a deleted record', async () => {
    await insertRecord(app);
    await insertRecord(app);
    const third = await insertRecord(app);
    await app`delete from public.housing_beneficiaries where id = ${third.id}`;
    expect((await insertRecord(app)).serial_no).toBe(4);
  });

  it('keeps an imported serial and moves the counter past it', async () => {
    expect((await insertRecord(app, { serial_no: 10 })).serial_no).toBe(10);
    expect((await insertRecord(app)).serial_no).toBe(11);
  });

  it('refuses a duplicate serial within a project type', async () => {
    await insertRecord(app, { serial_no: 5 });
    await expect(insertRecord(app, { serial_no: 5 })).rejects.toMatchObject({ code: '23505' });
    expect((await insertRecord(app, { project_type: 'tin', serial_no: 5 })).serial_no).toBe(5);
  });

  it('refuses a direct change of serial_no or project_type', async () => {
    const rec = await insertRecord(app);
    await expect(app`update public.housing_beneficiaries set serial_no = 99 where id = ${rec.id}`).rejects.toMatchObject({ code: '23514' });
    await expect(app`update public.housing_beneficiaries set project_type = 'tin' where id = ${rec.id}`).rejects.toMatchObject({ code: '23514' });
  });

  it('predicts the next serial as counter + 1', async () => {
    expect(await nextSerial('semi_pucca')).toBe(1);
    await insertRecord(app);
    await insertRecord(app);
    expect(await nextSerial('semi_pucca')).toBe(3);
    expect(await nextSerial('tin')).toBe(1);
    expect(await nextSerial('unknown')).toBeNull();
  });
});

describe('housing_change_serial', () => {
  it('moves a record to a free serial, raises the counter and records who did it', async () => {
    const rec = await insertRecord(app);
    const [moved] = await withActor(app, admin, (tx) => tx<{ serial_no: number }[]>`select serial_no from public.housing_change_serial(${rec.id}, 7)`);
    expect(moved?.serial_no).toBe(7);
    expect(await nextSerial('semi_pucca')).toBe(8);

    const changes = await app`select record_id, project_type, old_serial, new_serial, changed_by from public.housing_serial_changes`;
    expect(changes).toEqual([{ record_id: rec.id, project_type: 'semi_pucca', old_serial: 1, new_serial: 7, changed_by: admin.id }]);
  });

  it('refuses a serial another record already has', async () => {
    const a = await insertRecord(app);
    await insertRecord(app);
    await expect(withActor(app, admin, (tx) => tx`select public.housing_change_serial(${a.id}, 2)`)).rejects.toMatchObject({ code: '23505' });
  });

  it('refuses serial 0 and an unknown record', async () => {
    const rec = await insertRecord(app);
    await expect(app`select public.housing_change_serial(${rec.id}, 0)`).rejects.toMatchObject({ code: '23514' });
    await expect(app`select public.housing_change_serial(${'00000000-0000-4000-8000-000000000000'}, 3)`).rejects.toMatchObject({ code: 'P0002' });
  });
});
