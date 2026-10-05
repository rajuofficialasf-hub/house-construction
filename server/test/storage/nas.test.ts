import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { createNasDriver } from '../../src/storage/drivers/nas.js';
import { createStorage, StorageKeyError } from '../../src/storage/index.js';
import { runStorageContract } from './storageContract.js';

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'housing-nas-'));
}

runStorageContract('nas', async () => {
  const root = await tempRoot();
  return { driver: createNasDriver({ STORAGE_ROOT: root }), cleanup: () => rm(root, { recursive: true, force: true }) };
});

describe('nas driver', () => {
  const roots: string[] = [];
  afterAll(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));
  async function driverOnTemp() {
    const root = await tempRoot();
    roots.push(root);
    return { root, driver: createNasDriver({ STORAGE_ROOT: root }) };
  }

  it.each(['../x', '/etc/passwd', 'a/../../x', 'a\\..\\..\\x', decodeURIComponent('a%2F..%2F..%2Fx'), 'a/\0b', '', 'a//b', './a'])(
    'refuses the key %j before touching the filesystem',
    async (key) => {
      const { driver } = await driverOnTemp();
      await expect(driver.put(key, Readable.from([Buffer.from('x')]), { contentType: 'image/webp' })).rejects.toBeInstanceOf(StorageKeyError);
      await expect(driver.get(key)).rejects.toBeInstanceOf(StorageKeyError);
      await expect(driver.remove(key)).rejects.toBeInstanceOf(StorageKeyError);
    },
  );

  it('writes nested keys under the root', async () => {
    const { root, driver } = await driverOnTemp();
    await driver.put('housing/abc.webp', Readable.from([Buffer.from('x')]), { contentType: 'image/webp' });
    expect(await readdir(path.join(root, 'housing'))).toEqual(['abc.webp']);
  });

  it('leaves no temp file behind when a write fails', async () => {
    const { root, driver } = await driverOnTemp();
    const failing = new Readable({
      read() {
        this.destroy(new Error('boom'));
      },
    });
    await expect(driver.put('housing/fail.webp', failing, { contentType: 'image/webp' })).rejects.toThrow('boom');
    expect(await readdir(path.join(root, 'housing'))).toEqual([]);
  });

  it('works when STORAGE_ROOT is a symlink', async () => {
    const { root } = await driverOnTemp();
    const link = `${root}-link`;
    roots.push(link);
    await symlink(root, link);
    const driver = createNasDriver({ STORAGE_ROOT: link });
    await driver.put('housing/linked.webp', Readable.from([Buffer.from('via link')]), { contentType: 'image/webp' });
    expect(await readdir(path.join(root, 'housing'))).toEqual(['linked.webp']);
  });

  it('is what createStorage builds for STORAGE_DRIVER=nas', async () => {
    const root = await tempRoot();
    roots.push(root);
    expect(createStorage({ STORAGE_DRIVER: 'nas', STORAGE_ROOT: root }).name).toBe('nas');
  });
});
