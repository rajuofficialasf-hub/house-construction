import { Router, type RequestHandler } from 'express';
import { requireAdmin, requireMainAdmin, requireMainAdminForPhotos } from '../../auth/middleware.js';
import type { Sql } from '../../db.js';
import { deleteRecord } from '../../housing/writes.js';
import { deletePhoto, savePhoto } from '../../photos/service.js';
import type { PhotoReceiver } from '../../photos/process.js';
import { ADMIN_RECORD_COLUMNS, checkPhotoSlot, recordNotFound, recordProject, type ProjectRecord } from '../../records/reads.js';
import { getPrivate, getPrivateMany, putPrivate } from '../../records/private.js';
import {
  bulkCreateBody,
  bulkUpdateBody,
  idParams,
  photoParams,
  privateBody,
  privateManyBody,
  projectRecordsParams,
  recordCreateBody,
  recordPatchBody,
  serialBody,
} from '../../records/schemas.js';
import { bulkInsertRecords, bulkUpdateRecords, changeRecordSerial, createProjectRecord, patchRecord } from '../../records/writes.js';
import type { StorageDriver } from '../../storage/index.js';
import { actorOf, bulkJson, checkRowCount, DEFAULT_WRITE_RATE_LIMIT, writeRateLimiter, type WriteRateLimit } from './housing-admin.js';

// The single-record admin routes (docs/api/PROJECTS_API_CONTRACT.md §4.4.4–§4.4.6). Mounted at
// /api/v1 with full paths and no router.use(), so each route names its own guard: the admin check
// first (deny by default, NE-SEC-03), then the per-admin write limit.

/** Private values are never stored by any cache; set first, so a refusal carries it too. */
export const privateNoStore: RequestHandler = (_req, res, next) => {
  res.set('cache-control', 'private, no-store');
  next();
};

export interface RecordsAdminDeps {
  sql: Sql;
  storage: StorageDriver;
  /** The API's public base URL; photo URLs are built from it. */
  publicApiUrl: string;
  /** Reads a photo upload into storage; the app shares one, so its concurrency limit is shared too. */
  receivePhoto: PhotoReceiver;
  writeRateLimit?: WriteRateLimit;
}

export function recordsAdminRouter({
  sql,
  storage,
  publicApiUrl,
  receivePhoto,
  writeRateLimit = DEFAULT_WRITE_RATE_LIMIT,
}: RecordsAdminDeps): Router {
  const router = Router();
  const limitWrites = writeRateLimiter(writeRateLimit);

  router.post('/projects/:key/records', requireAdmin, limitWrites, async (req, res) => {
    const { key } = projectRecordsParams.parse(req.params);
    const body = recordCreateBody.parse(req.body);
    const project = await recordProject(sql, key, { admin: true });
    res.status(201).json({ data: await createProjectRecord(sql, actorOf(req), project, body) });
  });

  // Bulk (§4.4.7). The 100kb app parser skips these paths (app.ts) and the 10 MB one runs only after
  // the admin check, so only an admin can make the server read a large body.
  router.post('/projects/:key/records/bulk', requireAdmin, limitWrites, bulkJson, async (req, res) => {
    const { key } = projectRecordsParams.parse(req.params);
    checkRowCount(req.body);
    const body = bulkCreateBody.parse(req.body);
    const project = await recordProject(sql, key, { admin: true });
    res.json({ data: await bulkInsertRecords(sql, actorOf(req), project, body) });
  });

  router.put('/projects/:key/records/bulk', requireAdmin, limitWrites, bulkJson, async (req, res) => {
    const { key } = projectRecordsParams.parse(req.params);
    checkRowCount(req.body);
    const body = bulkUpdateBody.parse(req.body);
    const project = await recordProject(sql, key, { admin: true });
    res.json({ data: await bulkUpdateRecords(sql, actorOf(req), project, body) });
  });

  router.patch('/records/:id', requireAdmin, limitWrites, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const record = await patchRecord(sql, actorOf(req), id, recordPatchBody.parse(req.body));
    if (!record) throw recordNotFound();
    res.json({ data: record });
  });

  router.post('/records/:id/serial', requireAdmin, limitWrites, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { serial_no } = serialBody.parse(req.body);
    const record = await changeRecordSerial(sql, actorOf(req), id, serial_no);
    if (!record) throw recordNotFound();
    res.json({ data: record });
  });

  router.delete('/records/:id', requireMainAdmin, limitWrites, async (req, res) => {
    if (!(await deleteRecord(sql, storage, actorOf(req), idParams.parse(req.params).id, req.log))) throw recordNotFound();
    res.status(204).end();
  });

  // Photos (§4.4.10, §4.4.11). Multipart; the app's JSON parser leaves it alone. The photo mode is
  // checked before the body is read, so a refused upload stores nothing. Any admin may upload or
  // replace; only the main admin removes.
  router.put('/records/:id/photos/:slot', requireAdmin, limitWrites, async (req, res) => {
    const { id, slot } = photoParams.parse(req.params);
    await checkPhotoSlot(sql, id, slot);
    const upload = await receivePhoto(req, { kind: slot });
    res.json({ data: await savePhoto<ProjectRecord>({ sql, storage, publicApiUrl }, actorOf(req), id, upload, req.log, ADMIN_RECORD_COLUMNS) });
  });

  router.delete('/records/:id/photos/:slot', requireMainAdminForPhotos, limitWrites, async (req, res) => {
    const { id, slot } = photoParams.parse(req.params);
    const record = await deletePhoto<ProjectRecord>({ sql, storage }, actorOf(req), id, slot, req.log, ADMIN_RECORD_COLUMNS);
    if (!record) throw recordNotFound();
    res.json({ data: record });
  });

  // Private values (§4.4.8). Admin-only, reads included; never on the public-read CORS list. Each
  // read and save leaves a security-event line with key names, a record id or a count, never a value
  // (NE-LOG-03). Saves also get an activity row with the changed key names from the trigger in
  // 0014_record_functions_v2.sql.
  router.get('/records/:id/private', privateNoStore, requireAdmin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const data = await getPrivate(sql, id);
    if (!data) throw recordNotFound();
    req.log.info({ event: 'private_read', actor: actorOf(req).id, record_id: id }, 'private values read');
    res.json({ data });
  });

  router.put('/records/:id/private', privateNoStore, requireAdmin, limitWrites, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body = privateBody.parse(req.body);
    const actor = actorOf(req);
    const data = await putPrivate(sql, actor, id, body.data);
    if (!data) throw recordNotFound();
    req.log.info({ event: 'private_update', actor: actor.id, record_id: id, keys: Object.keys(body.data) }, 'private values saved');
    res.json({ data });
  });

  router.post('/projects/:key/records/private', privateNoStore, requireAdmin, limitWrites, async (req, res) => {
    const { key } = projectRecordsParams.parse(req.params);
    const { ids } = privateManyBody.parse(req.body);
    const project = await recordProject(sql, key, { admin: true });
    const data = await getPrivateMany(sql, project, ids);
    req.log.info({ event: 'private_read_many', actor: actorOf(req).id, project_key: key, count: Object.keys(data).length }, 'private values read');
    res.json({ data });
  });

  return router;
}
