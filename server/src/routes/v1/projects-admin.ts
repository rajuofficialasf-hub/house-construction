import { Router, type Request } from 'express';
import { requireAdmin, requireMainAdmin, requireMainAdminForCovers } from '../../auth/middleware.js';
import { refuseEditor } from '../../auth/scope.js';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import type { PhotoReceiver } from '../../photos/process.js';
import { deleteCover, saveCover } from '../../photos/service.js';
import { ADMIN_VIEW, fieldUsage, getProject } from '../../projects/reads.js';
import { projectNotFound, visibleProject } from '../../records/reads.js';
import {
  fieldCreateBody,
  fieldIdParams,
  fieldKeyParams,
  fieldOrderBody,
  fieldPatchBody,
  ifMatch,
  projectCreateBody,
  projectKeyParams,
  projectOrderBody,
  projectPatchBody,
  renameValueBody,
} from '../../projects/schemas.js';
import {
  createField,
  createProject,
  deleteField,
  deleteProject,
  reorderFields,
  reorderProjects,
  renameFieldValue,
  updateField,
  updateProject,
} from '../../projects/writes.js';
import type { StorageDriver } from '../../storage/index.js';
import {
  actorOf,
  DEFAULT_READ_RATE_LIMIT,
  DEFAULT_WRITE_RATE_LIMIT,
  privateNoStore,
  readRateLimiter,
  writeRateLimiter,
  type ReadRateLimit,
  type WriteRateLimit,
} from './shared.js';

// The project registry admin routes (docs/api/PROJECTS_API_CONTRACT.md §4.1, §4.2). Mounted at /api/v1
// with full paths and no router.use(), before the projects read router, so each route names its own
// guard: the admin check first (deny by default, NE-SEC-03), then the per-admin write limit. Every
// delete is the main admin's.

export interface ProjectsAdminDeps {
  sql: Sql;
  storage: StorageDriver;
  /** The API's public base URL; the cover's URL is built from it. */
  publicApiUrl: string;
  /** Reads a photo upload into storage; the app shares one, so its concurrency limit is shared too. */
  receivePhoto: PhotoReceiver;
  readRateLimit?: ReadRateLimit;
  writeRateLimit?: WriteRateLimit;
}

const fieldNotFound = () => new AppError('NOT_FOUND', 'ফিল্ড পাওয়া যায়নি');

/** The If-Match header as a timestamp, or undefined when it isn't sent. */
function ifMatchOf(req: Request): string | undefined {
  const header = req.get('if-match');
  if (header === undefined) return undefined;
  const parsed = ifMatch.safeParse(header);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'If-Match সঠিক নয়', { reason: 'if_match' });
  return parsed.data;
}

async function adminProject(sql: Sql, key: string) {
  const project = await getProject(sql, key, ADMIN_VIEW);
  if (!project) throw projectNotFound();
  return project;
}

/** Project and field settings are for the main admin and admins; an editor only adds and fills in. */
const refuseSettings = refuseEditor('প্রকল্পের সেটিং বদলাতে পারেন শুধু মূল এডমিন ও এডমিন');

export function projectsAdminRouter({
  sql,
  storage,
  publicApiUrl,
  receivePhoto,
  readRateLimit = DEFAULT_READ_RATE_LIMIT,
  writeRateLimit = DEFAULT_WRITE_RATE_LIMIT,
}: ProjectsAdminDeps): Router {
  const router = Router();
  const limitReads = readRateLimiter(readRateLimit, 'project admin reads rate-limited');
  const limitWrites = writeRateLimiter(writeRateLimit);

  router.post('/projects', requireAdmin, refuseSettings, limitWrites, async (req, res) => {
    const key = await createProject(sql, actorOf(req), projectCreateBody.parse(req.body));
    res.status(201).json({ data: await adminProject(sql, key) });
  });

  router.put('/projects/order', requireAdmin, refuseSettings, limitWrites, async (req, res) => {
    await reorderProjects(sql, actorOf(req), projectOrderBody.parse(req.body).keys);
    res.status(204).end();
  });

  router.patch('/projects/:key', requireAdmin, refuseSettings, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    const patch = projectPatchBody.parse(req.body);
    const result = await updateProject(sql, actorOf(req), key, patch, ifMatchOf(req));
    if (result === 'missing') throw projectNotFound();
    if (result === 'conflict') throw new AppError('CONFLICT', 'অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন — পাতা রিফ্রেশ করে আবার চেষ্টা করুন');
    res.json({ data: await adminProject(sql, key) });
  });

  router.delete('/projects/:key', requireMainAdmin, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    if (!(await deleteProject(sql, storage, actorOf(req), key, req.log))) throw projectNotFound();
    res.status(204).end();
  });

  router.post('/projects/:key/fields', requireAdmin, refuseSettings, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    const field = await createField(sql, actorOf(req), key, fieldCreateBody.parse(req.body));
    if (!field) throw projectNotFound();
    res.status(201).json({ data: field });
  });

  router.put('/projects/:key/fields/order', requireAdmin, refuseSettings, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    if (!(await reorderFields(sql, actorOf(req), key, fieldOrderBody.parse(req.body).ids))) throw projectNotFound();
    res.status(204).end();
  });

  router.patch('/fields/:id', requireAdmin, refuseSettings, limitWrites, async (req, res) => {
    const { id } = fieldIdParams.parse(req.params);
    const field = await updateField(sql, actorOf(req), id, fieldPatchBody.parse(req.body));
    if (!field) throw fieldNotFound();
    res.json({ data: field });
  });

  router.delete('/fields/:id', requireMainAdmin, limitWrites, async (req, res) => {
    const { id } = fieldIdParams.parse(req.params);
    if (!(await deleteField(sql, actorOf(req), id))) throw fieldNotFound();
    res.status(204).end();
  });

  // Covers (§4.1.8). Multipart, through the record photos' receiver: any image it accepts, re-encoded
  // to WebP without metadata. The project is checked before the body is read, so a refused upload
  // stores nothing. Any admin may upload or replace; only the main admin removes.
  router.put('/projects/:key/cover', requireAdmin, refuseSettings, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    if (!(await visibleProject(sql, key, ADMIN_VIEW))) throw projectNotFound();
    const upload = await receivePhoto(req, { kind: 'cover' });
    await saveCover({ sql, storage, publicApiUrl }, actorOf(req), key, upload, req.log);
    res.json({ data: await adminProject(sql, key) });
  });

  router.delete('/projects/:key/cover', requireMainAdminForCovers, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    if (!(await deleteCover({ sql, storage }, actorOf(req), key, req.log))) throw projectNotFound();
    res.json({ data: await adminProject(sql, key) });
  });

  // Admin-only, so never cached and never on the public-read CORS list.
  router.get('/projects/:key/fields/:field_key/usage', privateNoStore, requireAdmin, refuseSettings, limitReads, async (req, res) => {
    const { key, field_key: fieldKey } = fieldKeyParams.parse(req.params);
    const usage = await fieldUsage(sql, key, fieldKey);
    if (!usage) throw fieldNotFound();
    res.json({ data: usage });
  });

  router.post('/projects/:key/fields/:field_key/rename-value', requireAdmin, refuseSettings, limitWrites, async (req, res) => {
    const { key, field_key: fieldKey } = fieldKeyParams.parse(req.params);
    const { from, to } = renameValueBody.parse(req.body);
    const updated = await renameFieldValue(sql, actorOf(req), key, fieldKey, from, to);
    if (updated === null) throw fieldNotFound();
    res.json({ data: { updated } });
  });

  return router;
}
