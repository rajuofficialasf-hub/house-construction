// GET /api/v1/photos/:id through the real app and test database (docs/api/PROJECTS_API_CONTRACT.md §6;
// docs/plans/2026-10-05-1722-migrate-c5-photos-plan.md).
import type { AddressInfo } from 'node:net';
import { Readable, Writable } from 'node:stream';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from '../../src/app.js';
import { createLogger } from '../../src/logger.js';
import type { StorageDriver } from '../../src/storage/index.js';
import { appDb, insertProject, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { loginAdmin, TEST_ORIGIN } from '../support/session.js';
import { TEST_PUBLIC_API_URL, testStorage } from '../support/storage.js';

const sql = appDb();
const owner = ownerDb();
const local = testStorage();
const PARTNER = 'https://partner.example.org';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const warnings: string[] = [];
const logSink = new Writable({
  write(chunk, _enc, done) {
    const line = JSON.parse(String(chunk)) as { level: number; msg: string };
    if (line.level === 40) warnings.push(line.msg);
    done();
  },
});

function appWith(overrides: Partial<AppDeps> = {}) {
  return createApp({
    sql,
    logger: createLogger('info', logSink),
    trustProxy: 0,
    allowedOrigins: [TEST_ORIGIN],
    publicReadOrigins: [PARTNER],
    cookieSecure: false,
    storage: local.storage,
    publicApiUrl: TEST_PUBLIC_API_URL,
    ...overrides,
  });
}
const app = appWith();

let cookie = '';
let jpeg: Buffer;
beforeAll(async () => {
  jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#a52' } }).jpeg().toBuffer();
});
beforeEach(async () => {
  await resetTestData(owner);
  cookie = (await loginAdmin(app, owner, { role: 'main_admin' })).cookie;
  warnings.length = 0;
});
afterAll(async () => {
  await Promise.all([sql.end(), owner.end()]);
  await local.cleanup();
});

/** Uploads a photo and returns the record's photo and thumb paths on the API. */
async function uploaded(kind = 'prev') {
  const { id } = await insertRecord(sql);
  const res = await request(app)
    .put(`/api/v1/records/${id}/photos/${kind}`)
    .set('origin', TEST_ORIGIN)
    .set('cookie', cookie)
    .attach('photo', jpeg, 'x.jpg');
  expect(res.status).toBe(200);
  const strip = (url: string) => url.slice(TEST_PUBLIC_API_URL.length);
  return { id, photo: strip(res.body.data[`${kind}_photo_url`]), thumb: strip(res.body.data[`${kind}_thumb_url`]) };
}

const binary = (req: request.Test) =>
  req.buffer(true).parse((res, done) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });

describe('GET /api/v1/photos/:id', () => {
  it('serves a photo to anyone, with the image headers and a day of caching', async () => {
    const { photo, thumb } = await uploaded();
    const res = await binary(request(app).get(photo));
    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject({
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'cross-origin',
      'content-disposition': 'inline',
    });
    const body = res.body as Buffer;
    expect(Number(res.headers['content-length'])).toBe(body.length);
    expect(await sharp(body).metadata()).toMatchObject({ format: 'webp', width: 900, height: 600 });
    const small = await binary(request(app).get(thumb));
    expect(await sharp(small.body as Buffer).metadata()).toMatchObject({ format: 'webp', width: 400 });
  });

  it('answers HEAD with the headers and no body', async () => {
    const { photo } = await uploaded();
    const res = await request(app).head(photo);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.text ?? '').toBe('');
  });

  it('answers 400 for a malformed id and 404 for an unknown one', async () => {
    expect((await request(app).get('/api/v1/photos/not-a-uuid')).status).toBe(400);
    const res = await request(app).get(`/api/v1/photos/${MISSING_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('stops serving a replaced photo, to anyone and to an admin alike', async () => {
    const { id, photo } = await uploaded();
    await request(app).put(`/api/v1/records/${id}/photos/prev`).set('origin', TEST_ORIGIN).set('cookie', cookie).attach('photo', jpeg, 'y.jpg');
    expect((await request(app).get(photo)).status).toBe(404);
    expect((await request(app).get(photo).set('cookie', cookie)).status).toBe(404);
  });

  it('stops serving the photos of a deleted record, even while their files await removal', async () => {
    const failingRemove: StorageDriver = { ...local.storage, name: 'nas', remove: () => Promise.reject(new Error('offline')) };
    const flaky = appWith({ storage: failingRemove });
    const { id, photo } = await uploaded();
    expect((await request(flaky).delete(`/api/v1/records/${id}`).set('origin', TEST_ORIGIN).set('cookie', cookie)).status).toBe(204);
    expect((await request(app).get(photo)).status).toBe(404);
  });

  it('answers 404 and logs a warning when the stored object is missing', async () => {
    const { photo } = await uploaded();
    const [row] = await owner<{ storage_key: string }[]>`select storage_key from public.housing_files where id = ${photo.split('/').pop()!}`;
    await local.storage.remove(row!.storage_key);
    expect((await request(app).get(photo)).status).toBe(404);
    expect(warnings).toContain('photo file row has no stored object');
  });

  it('gives a public-read origin credential-less CORS on GET, and none on a write', async () => {
    const { photo } = await uploaded();
    const res = await request(app).get(photo).set('origin', PARTNER);
    expect(res.headers['access-control-allow-origin']).toBe(PARTNER);
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(res.headers.vary).toMatch(/Origin/);
    const preflight = await request(app).options(photo).set('origin', PARTNER).set('access-control-request-method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    const site = await request(app).get(photo).set('origin', TEST_ORIGIN);
    expect(site.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rate-limits per IP with the contract error', async () => {
    const limited = appWith({ photoRateLimit: { windowMs: 60_000, limit: 2 } });
    const path = `/api/v1/photos/${MISSING_ID}`;
    expect((await request(limited).get(path)).status).toBe(404);
    expect((await request(limited).get(path)).status).toBe(404);
    const res = await request(limited).get(path);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('cuts the body off, without hanging, when the stored stream fails mid-way', async () => {
    const { photo } = await uploaded();
    const breaking: StorageDriver = {
      ...local.storage,
      name: 'nas',
      async get() {
        let sent = false;
        return new Readable({
          read() {
            if (sent) return void this.destroy(new Error('disk read error'));
            sent = true;
            this.push(Buffer.alloc(100, 1));
          },
        });
      },
    };
    const server = appWith({ storage: breaking }).listen(0);
    try {
      const { port } = server.address() as AddressInfo;
      // Depending on timing the socket closes before or after the headers; either way no full body.
      const outcome = await fetch(`http://127.0.0.1:${port}${photo}`)
        .then((res) => res.arrayBuffer())
        .then(
          () => 'complete',
          () => 'cut off',
        );
      expect(outcome).toBe('cut off');
      expect(warnings).toContain('photo stream failed');
    } finally {
      server.close();
    }
  });
});

describe('GET /api/v1/photos/:id for a project a visitor may not see', () => {
  /** A photo on a record of `key`, uploaded through the record photo route. */
  async function photoIn(key: string) {
    const { id } = await insertRecord(sql, { project_type: key });
    const res = await request(app)
      .put(`/api/v1/records/${id}/photos/current`)
      .set('origin', TEST_ORIGIN)
      .set('cookie', cookie)
      .attach('photo', jpeg, 'x.jpg');
    expect(res.status).toBe(200);
    return (res.body.data.current_photo_url as string).slice(TEST_PUBLIC_API_URL.length);
  }

  it('answers a visitor 404 for a draft project\'s photo, never cached', async () => {
    await insertProject(owner, { key: 'ph_draft', is_published: false });
    const photo = await photoIn('ph_draft');
    for (const res of [await request(app).get(photo), await request(app).head(photo)]) {
      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('answers a visitor 404 for a photo in a published child of a draft group', async () => {
    await insertProject(owner, { key: 'ph_grp', is_group: true, is_published: false });
    await insertProject(owner, { key: 'ph_child', parent_key: 'ph_grp' });
    const photo = await photoIn('ph_child');
    for (const res of [await request(app).get(photo), await request(app).head(photo)]) {
      expect(res.status).toBe(404);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('serves an admin the draft\'s photo, never cached', async () => {
    await insertProject(owner, { key: 'ph_draft', is_published: false });
    const photo = await photoIn('ph_draft');
    const res = await binary(request(app).get(photo).set('cookie', cookie));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect((await sharp(res.body as Buffer).metadata()).format).toBe('webp');
  });

  it('serves a visitor a published project\'s photo with the public cache, until it is unpublished', async () => {
    await insertProject(owner, { key: 'ph_pub' });
    const photo = await photoIn('ph_pub');
    const res = await request(app).get(photo);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    await owner`update public.housing_projects set is_published = false where key = 'ph_pub'`;
    expect((await request(app).get(photo)).status).toBe(404);
  });

  it('answers a public-read origin, which sends no cookie, 404 for a draft\'s photo', async () => {
    await insertProject(owner, { key: 'ph_draft', is_published: false });
    const photo = await photoIn('ph_draft');
    expect((await request(app).get(photo).set('origin', PARTNER)).status).toBe(404);
  });
});
