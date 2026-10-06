import { Router, type RequestHandler } from 'express';
import { requireAdmin, requireMainAdmin } from '../../auth/middleware.js';
import type { Sql } from '../../db.js';
import { deleteRecord } from '../../housing/writes.js';
import { recordNotFound, recordProject } from '../../records/reads.js';
import { getPrivate, getPrivateMany, putPrivate } from '../../records/private.js';
import { idParams, privateBody, privateManyBody, projectRecordsParams, recordCreateBody, recordPatchBody } from '../../records/schemas.js';
import { createProjectRecord, patchRecord } from '../../records/writes.js';
import type { StorageDriver } from '../../storage/index.js';
import { actorOf, DEFAULT_WRITE_RATE_LIMIT, writeRateLimiter, type WriteRateLimit } from './housing-admin.js';

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
  writeRateLimit?: WriteRateLimit;
}

export function recordsAdminRouter({ sql, storage, writeRateLimit = DEFAULT_WRITE_RATE_LIMIT }: RecordsAdminDeps): Router {
  const router = Router();
  const limitWrites = writeRateLimiter(writeRateLimit);

  router.post('/projects/:key/records', requireAdmin, limitWrites, async (req, res) => {
    const { key } = projectRecordsParams.parse(req.params);
    const body = recordCreateBody.parse(req.body);
    const project = await recordProject(sql, key, { admin: true });
    res.status(201).json({ data: await createProjectRecord(sql, actorOf(req), project, body) });
  });

  router.patch('/records/:id', requireAdmin, limitWrites, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const record = await patchRecord(sql, actorOf(req), id, recordPatchBody.parse(req.body));
    if (!record) throw recordNotFound();
    res.json({ data: record });
  });

  router.delete('/records/:id', requireMainAdmin, limitWrites, async (req, res) => {
    if (!(await deleteRecord(sql, storage, actorOf(req), idParams.parse(req.params).id, req.log))) throw recordNotFound();
    res.status(204).end();
  });

  // Private values (§4.4.8). Admin-only, reads included; never on the public-read CORS list. Each
  // save and bulk read leaves a security-event line with key names or a count, never a value
  // (NE-LOG-03); the activity-log rows come with P3's log v2.
  router.get('/records/:id/private', privateNoStore, requireAdmin, async (req, res) => {
    const data = await getPrivate(sql, idParams.parse(req.params).id);
    if (!data) throw recordNotFound();
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
