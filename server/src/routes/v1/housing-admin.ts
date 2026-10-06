import { Router } from 'express';
import { requireAdmin, requireMainAdmin } from '../../auth/middleware.js';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import { listActivity, logEvent } from '../../housing/activity.js';
import {
  activityBody,
  activityQuery,
  bulkInsertBody,
  bulkUpdateBody,
  changeSerialBody,
  createBody,
  deletePhotoQuery,
  idParams,
  updateBody,
} from '../../housing/schemas.js';
import { RECORD_COLUMNS, type HousingRecord } from '../../housing/reads.js';
import { bulkInsert, bulkUpdateBySerial, changeSerial, createRecord, deleteRecord, updateRecord } from '../../housing/writes.js';
import type { PhotoReceiver } from '../../photos/process.js';
import { deletePhoto, savePhoto } from '../../photos/service.js';
import type { StorageDriver } from '../../storage/index.js';
import { actorOf, bulkJson, checkRowCount, DEFAULT_WRITE_RATE_LIMIT, writeRateLimiter, type WriteRateLimit } from './shared.js';

// The admin housing routes (docs/api/API_CONTRACT.md §4.5খ–§4.9গ). Mounted on /api/v1/housing
// before the public read router, so its literal paths win over the reads' /:id.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const notFound = () => new AppError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি');

/** The activity log's path inside this router; its POST isn't counted by the write limit. */
const ACTIVITY_PATH = '/activity';

/** Matches the way Express routes it: case-insensitive, with or without a trailing slash. */
const isActivityPath = (path: string) => path.toLowerCase().replace(/\/+$/, '') === ACTIVITY_PATH;

/** The bulk import's full path; app.ts keeps its 100kb parser off it. */
export const BULK_PATH = '/api/v1/housing/bulk';

export interface HousingAdminDeps {
  sql: Sql;
  storage: StorageDriver;
  /** The API's public base URL; photo URLs are built from it. */
  publicApiUrl: string;
  /** Reads a photo upload into storage (photos/process.ts); shared so its concurrency limit is too. */
  receivePhoto: PhotoReceiver;
  /** Per-admin cap on writes; tests pass a small one. */
  writeRateLimit?: WriteRateLimit;
}

export function housingAdminRouter({
  sql,
  storage,
  publicApiUrl,
  receivePhoto,
  writeRateLimit = DEFAULT_WRITE_RATE_LIMIT,
}: HousingAdminDeps): Router {
  const router = Router();
  const limitWrites = writeRateLimiter(writeRateLimit);

  // Deny by default (NE-SEC-03): every write under /housing needs an admin session, including
  // paths with no route yet, before any body is validated. Reads pass through to the read router.
  // Then the write limit, before any body parser. The activity log isn't counted: the UI posts
  // its own events there.
  router.use((req, res, next) => (SAFE_METHODS.has(req.method) ? next() : requireAdmin(req, res, next)));
  router.use((req, res, next) =>
    SAFE_METHODS.has(req.method) || isActivityPath(req.path) ? next() : limitWrites(req, res, next),
  );

  router.get(ACTIVITY_PATH, requireAdmin, async (req, res) => {
    res.json(await listActivity(sql, activityQuery.parse(req.query)));
  });

  router.post(ACTIVITY_PATH, requireAdmin, async (req, res) => {
    res.status(201).json({ data: { id: await logEvent(sql, actorOf(req), activityBody.parse(req.body)) } });
  });

  // requireAdmin before the parser, so only an admin can make the server read 10 MB.
  router.post('/bulk', requireAdmin, bulkJson, async (req, res) => {
    checkRowCount(req.body);
    res.json({ data: await bulkInsert(sql, actorOf(req), bulkInsertBody.parse(req.body)) });
  });

  router.put('/bulk', requireAdmin, bulkJson, async (req, res) => {
    checkRowCount(req.body);
    res.json({ data: await bulkUpdateBySerial(sql, actorOf(req), bulkUpdateBody.parse(req.body)) });
  });

  router.post('/', requireAdmin, async (req, res) => {
    res.status(201).json({ data: await createRecord(sql, actorOf(req), createBody.parse(req.body)) });
  });

  router.post('/:id/serial', requireAdmin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { serial_no } = changeSerialBody.parse(req.body);
    res.json({ data: await changeSerial(sql, actorOf(req), id, serial_no) });
  });

  router.put('/:id', requireAdmin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const record = await updateRecord(sql, actorOf(req), id, updateBody.parse(req.body));
    if (!record) throw notFound();
    res.json({ data: record });
  });

  // Multipart; the global JSON parser leaves it alone, and only an admin's upload is read.
  router.post('/:id/photo', requireAdmin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const upload = await receivePhoto(req);
    res.json({ data: await savePhoto<HousingRecord>({ sql, storage, publicApiUrl }, actorOf(req), id, upload, req.log, RECORD_COLUMNS) });
  });

  router.delete('/:id/photo', requireMainAdmin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { kind } = deletePhotoQuery.parse(req.query);
    const record = await deletePhoto<HousingRecord>({ sql, storage }, actorOf(req), id, kind, req.log, RECORD_COLUMNS);
    if (!record) throw notFound();
    res.json({ data: record });
  });

  router.delete('/:id', requireMainAdmin, async (req, res) => {
    if (!(await deleteRecord(sql, storage, actorOf(req), idParams.parse(req.params).id, req.log))) throw notFound();
    res.status(204).end();
  });

  return router;
}
