// The tombstone sweep (server/src/photos/sweep.ts) against the test database and a temp NAS folder.
import { Readable, Writable } from 'node:stream';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../src/logger.js';
import { sweepTombstones } from '../../src/photos/sweep.js';
import { StorageNotFoundError, type StorageDriver } from '../../src/storage/index.js';
import { appDb, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { testStorage } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const local = testStorage();
const log = createLogger('warn', new Writable({ write: (_c, _e, done) => done() }));

beforeEach(() => resetTestData(owner));
afterAll(async () => {
  await Promise.all([sql.end(), owner.end()]);
  await local.cleanup();
});

let n = 0;
async function storedFile(recordId: string, tombstoned: boolean): Promise<string> {
  const key = `housing/sweep-${n++}.webp`;
  await local.storage.put(key, Readable.from([Buffer.from('x')]), { contentType: 'image/webp' });
  await owner`
    insert into public.housing_files ${owner({
      record_id: recordId,
      kind: 'prev',
      variant: tombstoned ? 'photo' : 'thumb',
      storage_key: key,
      storage_driver: 'nas',
      content_type: 'image/webp',
      size_bytes: 1,
      deleted_at: tombstoned ? new Date() : null,
    })}`;
  return key;
}
const stored = (key: string) =>
  local.storage.get(key).then(
    (s) => (s.destroy(), true),
    (err: unknown) => (err instanceof StorageNotFoundError ? false : Promise.reject(err)),
  );
const keysInTable = async () => (await owner<{ storage_key: string }[]>`select storage_key from public.housing_files order by storage_key`).map((r) => r.storage_key);

describe('sweepTombstones', () => {
  it('removes tombstoned files from storage and the table, and leaves live ones alone', async () => {
    const { id } = await insertRecord(sql);
    const dead = await storedFile(id, true);
    const live = await storedFile(id, false);
    expect(await sweepTombstones(sql, local.storage, log)).toEqual({ removed: 1, failed: 0 });
    expect(await stored(dead)).toBe(false);
    expect(await stored(live)).toBe(true);
    expect(await keysInTable()).toEqual([live]);
  });

  it('keeps a row whose removal fails and still sweeps the others', async () => {
    const { id } = await insertRecord(sql);
    const { id: other } = await insertRecord(sql);
    const stuck = await storedFile(id, true);
    const fine = await storedFile(other, true);
    const flaky: StorageDriver = { ...local.storage, name: 'nas', remove: (key) => (key === stuck ? Promise.reject(new Error('locked')) : local.storage.remove(key)) };
    expect(await sweepTombstones(sql, flaky, log)).toEqual({ removed: 1, failed: 1 });
    expect(await keysInTable()).toEqual([stuck]);
    expect(await stored(fine)).toBe(false);
  });

  it('does nothing on a second run', async () => {
    const { id } = await insertRecord(sql);
    await storedFile(id, true);
    await sweepTombstones(sql, local.storage, log);
    expect(await sweepTombstones(sql, local.storage, log)).toEqual({ removed: 0, failed: 0 });
  });

  it('removes a tombstone whose object is already gone', async () => {
    const { id } = await insertRecord(sql);
    const key = await storedFile(id, true);
    await local.storage.remove(key);
    expect(await sweepTombstones(sql, local.storage, log)).toEqual({ removed: 1, failed: 0 });
    expect(await keysInTable()).toEqual([]);
  });
});
