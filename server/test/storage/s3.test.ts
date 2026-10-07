import net from 'node:net';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { createS3Driver } from '../../src/storage/drivers/s3.js';
import { createStorage } from '../../src/storage/index.js';
import { testS3 } from '../support/env.js';
import { runStorageContract } from './storageContract.js';

// The contract runs against the bucket TEST_S3_* names: the local SeaweedFS (compose.yaml's s3 service)
// in CI and on a developer machine, or once by hand against a real test bucket (docs/testing/README.md).
describe.skipIf(!testS3)('s3 driver against TEST_S3_BUCKET (set TEST_S3_BUCKET and TEST_S3_REGION to run)', () => {
  runStorageContract('s3', async () => ({ driver: createS3Driver(testS3!) }));
});

describe('s3 driver', () => {
  const sockets = new Set<net.Socket>();
  // Accepts connections and never answers, like a bucket endpoint that has stalled.
  const silent = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  afterAll(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => silent.close(resolve));
  });

  it('fails a request to a stalled endpoint within the request timeout instead of hanging', async () => {
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const { port } = silent.address() as net.AddressInfo;
    process.env.AWS_ACCESS_KEY_ID ??= 'test';
    process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
    const driver = createS3Driver(
      { S3_BUCKET: 'b', S3_REGION: 'us-east-1', S3_ENDPOINT: `http://127.0.0.1:${port}`, S3_FORCE_PATH_STYLE: true },
      { connectionTimeout: 300, requestTimeout: 300 },
    );
    const started = Date.now();
    await expect(driver.get('housing/x.webp')).rejects.toThrow();
    await expect(driver.put('housing/x.webp', Readable.from([Buffer.from('x')]), { contentType: 'image/webp' })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 15_000);

  it('is what createStorage builds for STORAGE_DRIVER=s3', () => {
    expect(
      createStorage({ STORAGE_DRIVER: 's3', S3_BUCKET: 'b', S3_REGION: 'auto', S3_FORCE_PATH_STYLE: false }).name,
    ).toBe('s3');
  });
});
