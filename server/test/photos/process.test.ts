// The photo upload pipeline (server/src/photos/process.ts) through a minimal Express app, with real
// sharp and a NAS driver on a temp folder (docs/plans/2026-10-05-1722-migrate-c5-photos-plan.md).
import express from 'express';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/errors.js';
import { createLogger } from '../../src/logger.js';
import { createPhotoReceiver, type PhotoReceiverOptions, type PhotoUpload } from '../../src/photos/process.js';
import { createNasDriver } from '../../src/storage/drivers/nas.js';
import type { StorageDriver } from '../../src/storage/index.js';

function appFor(options: PhotoReceiverOptions) {
  const receive = createPhotoReceiver(options);
  const app = express();
  app.use(pinoHttp({ logger: createLogger('silent') }));
  app.use(express.json({ limit: '100kb' }));
  app.post('/upload', async (req, res) => {
    res.json(await receive(req));
  });
  app.use(errorHandler);
  return app;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

const solid = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: '#2a7' } });

let root: string;
let storage: StorageDriver;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'housing-photos-'));
  storage = createNasDriver({ STORAGE_ROOT: root });
});
afterEach(() => rm(root, { recursive: true, force: true }));

async function storedFiles(): Promise<string[]> {
  return readdir(path.join(root, 'housing')).catch(() => []);
}

describe('photo upload pipeline', () => {
  it('stores a rotated, resized WebP and a 400 px thumb with no EXIF or GPS', async () => {
    const jpeg = await solid(3000, 2000)
      .withMetadata({ orientation: 6 })
      .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '23/1 46/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '90/1 23/1 0/1' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(jpeg).metadata()).exif).toBeDefined();

    const res = await request(appFor({ storage }))
      .post('/upload')
      .field('kind', 'current')
      .attach('photo', jpeg, { filename: 'IMG_0001.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    const body = res.body as PhotoUpload;
    expect(body.kind).toBe('current');
    expect(body.files.map((f) => f.variant)).toEqual(['photo', 'thumb']);

    const [full, thumb] = await Promise.all(body.files.map(async (f) => readAll(await storage.get(f.key))));
    const fullMeta = await sharp(full!).metadata();
    const thumbMeta = await sharp(thumb!).metadata();
    expect(fullMeta).toMatchObject({ format: 'webp', width: 1600, height: 2400 });
    expect(thumbMeta).toMatchObject({ format: 'webp', width: 400, height: 600 });
    for (const meta of [fullMeta, thumbMeta]) {
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
    }
    expect(body.files[0]).toMatchObject({ contentType: 'image/webp', sizeBytes: full!.length, originalName: 'IMG_0001.jpg' });
    expect(body.files[0]!.key).toMatch(/^housing\/[0-9a-f-]{36}\.webp$/);
    expect(body.files[1]!.sizeBytes).toBe(thumb!.length);
  });

  it('accepts PNG and WebP, never enlarges a small image, and takes kind after the file', async () => {
    const app = appFor({ storage });
    const png = await solid(300, 200).png().toBuffer();
    const webp = await solid(500, 500).webp().toBuffer();
    const res = await request(app).post('/upload').attach('photo', png, 'a.png').field('kind', 'prev');
    expect(res.status).toBe(200);
    const full = await readAll(await storage.get((res.body as PhotoUpload).files[0]!.key));
    expect(await sharp(full).metadata()).toMatchObject({ format: 'webp', width: 300, height: 200 });
    expect((await request(app).post('/upload').field('kind', 'prev').attach('photo', webp, 'b.webp')).status).toBe(200);
  });

  it('reads and discards the client thumb', async () => {
    const res = await request(appFor({ storage }))
      .post('/upload')
      .field('kind', 'prev')
      .attach('photo', await solid(800, 600).webp().toBuffer(), 'photo.webp')
      .attach('thumb', Buffer.from('anything at all'), 'thumb.webp');
    expect(res.status).toBe(200);
    expect(await storedFiles()).toHaveLength(2);
  });

  it('keeps at most 255 characters of the original name', async () => {
    const res = await request(appFor({ storage }))
      .post('/upload')
      .field('kind', 'prev')
      .attach('photo', await solid(10, 10).png().toBuffer(), `${'ক'.repeat(300)}.png`);
    expect(res.status).toBe(200);
    expect((res.body as PhotoUpload).files[0]!.originalName).toBe('ক'.repeat(255));
  });

  it('refuses a file name with a control character as a malformed part', async () => {
    const res = await request(appFor({ storage }))
      .post('/upload')
      .field('kind', 'prev')
      .attach('photo', await solid(10, 10).png().toBuffer(), 'a\u0007b.png');
    expect(res.status).toBe(400);
    expect(res.body.error.details.reason).toBe('malformed_multipart');
    expect(await storedFiles()).toEqual([]);
  });

  describe('refuses and stores nothing', () => {
    const cases: [string, (r: request.Test) => request.Test, number, string?][] = [
      ['PDF bytes sent as image/jpeg', (r) => r.field('kind', 'prev').attach('photo', Buffer.from('%PDF-1.7\n1 0 obj'), { filename: 'x.jpg', contentType: 'image/jpeg' }), 400, 'unsupported_type'],
      ['a GIF', (r) => r.field('kind', 'prev').attach('photo', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00'), 'x.gif'), 400, 'unsupported_type'],
      ['an SVG', (r) => r.field('kind', 'prev').attach('photo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg'), 400, 'unsupported_type'],
      ['a missing photo', (r) => r.field('kind', 'prev'), 400, 'required'],
      ['a missing kind', (r) => r.attach('photo', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'x.png'), 400, 'required'],
      ['kind=side', (r) => r.field('kind', 'side'), 400, 'invalid_enum_value'],
      ['a second kind', (r) => r.field('kind', 'prev').field('kind', 'current'), 400, 'unexpected_field'],
      ['an unknown field', (r) => r.field('kind', 'prev').field('serial_no', '3'), 400, 'unexpected_field'],
      ['an extra file field', (r) => r.field('kind', 'prev').attach('extra', Buffer.from('x'), 'x.png'), 400, 'unexpected_file'],
      ['a JSON body', (r) => r.send({ kind: 'prev' }), 400, 'not_multipart'],
    ];
    it.each(cases)('%s', async (_name, build, status, reason) => {
      const res = await build(request(appFor({ storage })).post('/upload'));
      expect(res.status).toBe(status);
      if (reason) expect(res.body.error.details.reason).toBe(reason);
      expect(await storedFiles()).toEqual([]);
    });

    it('a truncated JPEG', async () => {
      const jpeg = await solid(1200, 900).jpeg().toBuffer();
      const res = await request(appFor({ storage })).post('/upload').field('kind', 'prev').attach('photo', jpeg.subarray(0, jpeg.length / 2), 'x.jpg');
      expect(res.status).toBe(400);
      expect(res.body.error.details.reason).toBe('invalid_image');
      expect(await storedFiles()).toEqual([]);
    });

    it('an image over the pixel limit', async () => {
      const png = await solid(100, 100).png().toBuffer();
      const res = await request(appFor({ storage, maxInputPixels: 5_000 })).post('/upload').field('kind', 'prev').attach('photo', png, 'x.png');
      expect(res.status).toBe(400);
      expect(res.body.error.details.reason).toBe('invalid_image');
      expect(await storedFiles()).toEqual([]);
    });

    it('a 6 MB photo, answered with a readable 413', async () => {
      const big = Buffer.concat([await solid(10, 10).png().toBuffer(), Buffer.alloc(6 * 1024 * 1024, 7)]);
      const res = await request(appFor({ storage })).post('/upload').field('kind', 'prev').attach('photo', big, 'x.png');
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
      expect(await storedFiles()).toEqual([]);
    });

    it('a 600 KB thumb', async () => {
      const res = await request(appFor({ storage }))
        .post('/upload')
        .field('kind', 'prev')
        .attach('photo', await solid(10, 10).png().toBuffer(), 'x.png')
        .attach('thumb', Buffer.alloc(600 * 1024, 1), 'thumb.webp');
      expect(res.status).toBe(413);
      expect(await storedFiles()).toEqual([]);
    });
  });

  it('removes the other key and answers 500 when a storage write fails', async () => {
    const removed: string[] = [];
    const put = new Set<string>();
    const flaky: StorageDriver = {
      name: 'nas',
      async put(key, body) {
        if (put.size === 0) {
          put.add(key);
          await readAll(body);
          return;
        }
        body.resume();
        throw new Error('disk full');
      },
      get: () => Promise.reject(new Error('unused')),
      async remove(key) {
        removed.push(key);
      },
    };
    const res = await request(appFor({ storage: flaky })).post('/upload').field('kind', 'prev').attach('photo', await solid(50, 50).png().toBuffer(), 'x.png');
    expect(res.status).toBe(500);
    expect(removed).toHaveLength(2);
    expect(removed).toContain([...put][0]);
  });

  it('decodes at most maxConcurrent uploads at once; the next waits, then succeeds', async () => {
    let active = 0;
    let peak = 0;
    const gates: (() => void)[] = [];
    const held: StorageDriver = {
      name: 'nas',
      async put(key, body, meta) {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => gates.push(resolve));
        await storage.put(key, body, meta);
        active--;
      },
      get: (key) => storage.get(key),
      remove: (key) => storage.remove(key),
    };
    const app = appFor({ storage: held, maxConcurrent: 1 });
    const png = await solid(20, 20).png().toBuffer();
    const first = request(app).post('/upload').field('kind', 'prev').attach('photo', png, 'a.png').then((r) => r);
    const second = request(app).post('/upload').field('kind', 'prev').attach('photo', png, 'b.png').then((r) => r);
    // Two puts per upload: the first upload's two are held; the second hasn't started.
    await expect.poll(() => gates.length).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(gates.length).toBe(2);
    gates.splice(0).forEach((open) => open());
    await expect.poll(() => gates.length).toBe(2);
    gates.splice(0).forEach((open) => open());
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(peak).toBe(2);
  });
});

describe('after an early refusal', () => {
  const sockets = new Set<net.Socket>();
  afterAll(() => sockets.forEach((s) => s.destroy()));

  it('stops reading a client that keeps sending past the drain window', async () => {
    const server = appFor({ storage, drainTimeoutMs: 200, maxPhotoBytes: 1024 }).listen(0);
    const { port } = server.address() as net.AddressInfo;
    const socket = net.connect(port, '127.0.0.1');
    sockets.add(socket);
    const boundary = 'b0undary';
    let response = '';
    socket.on('data', (chunk) => (response += chunk.toString()));
    const closed = new Promise<void>((resolve) => socket.on('close', () => resolve()));
    socket.write(
      `POST /upload HTTP/1.1\r\nHost: x\r\nContent-Type: multipart/form-data; boundary=${boundary}\r\nContent-Length: 100000000\r\n\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`,
    );
    socket.write(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    // Trickle bytes forever; the server must answer 413 and close within the drain timeout.
    const trickle = setInterval(() => socket.writable && socket.write(Buffer.alloc(4096, 1)), 20);
    await closed;
    clearInterval(trickle);
    server.close();
    expect(response).toMatch(/^HTTP\/1\.1 413/);
    expect(response.toLowerCase()).toContain('connection: close');
  }, 10_000);
});
