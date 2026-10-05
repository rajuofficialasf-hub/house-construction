import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StorageNotFoundError, type StorageDriver } from '../../src/storage/index.js';

/**
 * The behavior every storage driver must share (NS-31). Each driver's test file calls this with a
 * factory for a driver on an empty location. Keys are unique per test so a shared bucket is fine.
 */
export interface StorageContractTarget {
  driver: StorageDriver;
  cleanup?: () => Promise<void>;
}

const META = { contentType: 'image/webp' };

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

/** A stream of `total` pseudo-random bytes made chunk by chunk, so nothing holds the whole body. */
function generated(total: number, seed: number): Readable {
  let sent = 0;
  let state = seed;
  return new Readable({
    read() {
      if (sent >= total) return void this.push(null);
      const size = Math.min(64 * 1024, total - sent);
      const chunk = Buffer.allocUnsafe(size);
      for (let i = 0; i < size; i++) {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        chunk[i] = state & 0xff;
      }
      sent += size;
      this.push(chunk);
    },
  });
}

async function sha256(stream: Readable): Promise<{ hash: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return { hash: hash.digest('hex'), bytes };
}

export function runStorageContract(name: string, makeTarget: () => Promise<StorageContractTarget>): void {
  describe(`storage contract: ${name}`, () => {
    let target: StorageContractTarget;
    let n = 0;
    const key = () => `contract/${process.pid}-${Date.now()}-${n++}.webp`;

    beforeAll(async () => {
      target = await makeTarget();
    });
    afterAll(async () => {
      await target?.cleanup?.();
    });

    it('returns the bytes that were put', async () => {
      const k = key();
      await target.driver.put(k, Readable.from([Buffer.from('hello '), Buffer.from('photo')]), META);
      expect((await readAll(await target.driver.get(k))).toString()).toBe('hello photo');
    });

    it('replaces the content when the same key is put again', async () => {
      const k = key();
      await target.driver.put(k, Readable.from([Buffer.from('first')]), META);
      await target.driver.put(k, Readable.from([Buffer.from('second')]), META);
      expect((await readAll(await target.driver.get(k))).toString()).toBe('second');
    });

    it('throws StorageNotFoundError for a missing key', async () => {
      await expect(target.driver.get(key())).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it('removes a key, and removing a missing key succeeds', async () => {
      const k = key();
      await target.driver.put(k, Readable.from([Buffer.from('x')]), META);
      await target.driver.remove(k);
      await expect(target.driver.get(k)).rejects.toBeInstanceOf(StorageNotFoundError);
      await expect(target.driver.remove(k)).resolves.toBeUndefined();
      await expect(target.driver.remove(key())).resolves.toBeUndefined();
    });

    it('streams a 20 MB body in and out unchanged', async () => {
      const k = key();
      const total = 20 * 1024 * 1024;
      const expected = await sha256(generated(total, 7));
      await target.driver.put(k, generated(total, 7), META);
      expect(await sha256(await target.driver.get(k))).toEqual(expected);
    }, 60_000);

    it('rejects a body that fails mid-way and leaves nothing readable at the key', async () => {
      const k = key();
      let sent = false;
      const failing = new Readable({
        read() {
          if (!sent) {
            sent = true;
            this.push(Buffer.alloc(1024, 1));
          } else {
            this.destroy(new Error('client went away'));
          }
        },
      });
      await expect(target.driver.put(k, failing, META)).rejects.toThrow();
      await expect(target.driver.get(k)).rejects.toBeInstanceOf(StorageNotFoundError);
    });
  });
}
