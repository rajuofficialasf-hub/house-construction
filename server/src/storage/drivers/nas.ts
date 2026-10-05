import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StorageKeyError, StorageNotFoundError } from '../errors.js';
import type { StorageDriver } from '../types.js';

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/**
 * The NAS driver: files under STORAGE_ROOT, a mounted folder (NS-02). Every key is checked before
 * any filesystem call, and a write goes to a temp file that is renamed into place, so a failed or
 * interrupted upload never leaves a half-written file at the real key.
 */
export function createNasDriver(config: { STORAGE_ROOT: string }): StorageDriver {
  const root = path.resolve(config.STORAGE_ROOT);

  // Server keys look like housing/<uuid>.webp; anything that could climb out of the root is refused
  // outright, and the resolved path is checked again in case a form slipped past (NE-SEC-07).
  function resolveKey(key: string): string {
    const segments = key.split('/');
    if (
      key === '' ||
      key.startsWith('/') ||
      key.includes('\\') ||
      key.includes('\0') ||
      segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ) {
      throw new StorageKeyError('storage key is not a plain relative path');
    }
    const resolved = path.resolve(root, key);
    if (!resolved.startsWith(root + path.sep)) throw new StorageKeyError('storage key leaves the storage root');
    return resolved;
  }

  return {
    name: 'nas',

    async put(key: string, body: Readable): Promise<void> {
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.${randomUUID()}.tmp`;
      try {
        await pipeline(body, fs.createWriteStream(temp, { flags: 'wx' }));
        await rename(temp, target);
      } catch (err) {
        await unlink(temp).catch((unlinkErr: unknown) => {
          if (!isNotFound(unlinkErr)) throw unlinkErr;
        });
        throw err;
      }
    },

    async get(key: string): Promise<Readable> {
      const target = resolveKey(key);
      // Open first, so a missing file is a StorageNotFoundError before any byte is streamed.
      try {
        const handle = await open(target, 'r');
        return handle.createReadStream();
      } catch (err) {
        if (isNotFound(err)) throw new StorageNotFoundError(key);
        throw err;
      }
    },

    async remove(key: string): Promise<void> {
      try {
        await unlink(resolveKey(key));
      } catch (err) {
        if (!isNotFound(err)) throw err;
      }
    },
  };
}
