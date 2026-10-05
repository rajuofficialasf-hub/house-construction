import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createNasDriver } from '../../src/storage/drivers/nas.js';
import type { StorageDriver } from '../../src/storage/index.js';

/** The PUBLIC_API_URL the test apps build photo URLs from. */
export const TEST_PUBLIC_API_URL = 'http://api.test';

/**
 * A NAS driver on a fresh folder under the OS temp dir. Nothing is created until the first put,
 * so tests that never store a file leave nothing behind; others call cleanup in afterAll.
 */
export function testStorage(): { storage: StorageDriver; root: string; cleanup: () => Promise<void> } {
  const root = path.join(os.tmpdir(), `housing-test-storage-${randomUUID()}`);
  return { storage: createNasDriver({ STORAGE_ROOT: root }), root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

/** The storage and public URL every test app needs; for tests that don't look at stored files. */
export const testPhotoDeps = () => ({ storage: testStorage().storage, publicApiUrl: TEST_PUBLIC_API_URL });
