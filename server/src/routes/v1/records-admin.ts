import { Router } from 'express';
import { requireAdmin, requireMainAdmin } from '../../auth/middleware.js';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import { deleteRecord } from '../../housing/writes.js';
import { recordProject } from '../../records/reads.js';
import { idParams, projectRecordsParams, recordCreateBody, recordPatchBody } from '../../records/schemas.js';
import { createProjectRecord, patchRecord } from '../../records/writes.js';
import type { StorageDriver } from '../../storage/index.js';
import { actorOf, DEFAULT_WRITE_RATE_LIMIT, writeRateLimiter, type WriteRateLimit } from './housing-admin.js';

// The single-record admin routes (docs/api/PROJECTS_API_CONTRACT.md §4.4.4–§4.4.6). Mounted at
// /api/v1 with full paths and no router.use(), so each route names its own guard: the admin check
// first (deny by default, NE-SEC-03), then the per-admin write limit.

const notFound = () => new AppError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি');

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
    if (!record) throw notFound();
    res.json({ data: record });
  });

  router.delete('/records/:id', requireMainAdmin, limitWrites, async (req, res) => {
    if (!(await deleteRecord(sql, storage, actorOf(req), idParams.parse(req.params).id, req.log))) throw notFound();
    res.status(204).end();
  });

  return router;
}
