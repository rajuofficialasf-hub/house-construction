import { Router, type Request } from 'express';
import { requireAdmin, requireMainAdmin } from '../../auth/middleware.js';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import { getProject } from '../../projects/reads.js';
import {
  fieldCreateBody,
  fieldIdParams,
  fieldOrderBody,
  fieldPatchBody,
  ifMatch,
  projectCreateBody,
  projectKeyParams,
  projectOrderBody,
  projectPatchBody,
} from '../../projects/schemas.js';
import {
  createField,
  createProject,
  deleteField,
  deleteProject,
  reorderFields,
  reorderProjects,
  updateField,
  updateProject,
} from '../../projects/writes.js';
import { actorOf, DEFAULT_WRITE_RATE_LIMIT, writeRateLimiter, type WriteRateLimit } from './shared.js';

// The project registry admin routes (docs/api/PROJECTS_API_CONTRACT.md §4.1, §4.2). Mounted at /api/v1
// with full paths and no router.use(), before the projects read router, so each route names its own
// guard: the admin check first (deny by default, NE-SEC-03), then the per-admin write limit. Every
// delete is the main admin's.

export interface ProjectsAdminDeps {
  sql: Sql;
  writeRateLimit?: WriteRateLimit;
}

const projectNotFound = () => new AppError('NOT_FOUND', 'প্রকল্প পাওয়া যায়নি');
const fieldNotFound = () => new AppError('NOT_FOUND', 'ফিল্ড পাওয়া যায়নি');
const ADMIN = { admin: true };

/** The If-Match header as a timestamp, or undefined when it isn't sent. */
function ifMatchOf(req: Request): string | undefined {
  const header = req.get('if-match');
  if (header === undefined) return undefined;
  const parsed = ifMatch.safeParse(header);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'If-Match সঠিক নয়', { reason: 'if_match' });
  return parsed.data;
}

async function adminProject(sql: Sql, key: string) {
  const project = await getProject(sql, key, ADMIN);
  if (!project) throw projectNotFound();
  return project;
}

export function projectsAdminRouter({ sql, writeRateLimit = DEFAULT_WRITE_RATE_LIMIT }: ProjectsAdminDeps): Router {
  const router = Router();
  const limitWrites = writeRateLimiter(writeRateLimit);

  router.post('/projects', requireAdmin, limitWrites, async (req, res) => {
    const key = await createProject(sql, actorOf(req), projectCreateBody.parse(req.body));
    res.status(201).json({ data: await adminProject(sql, key) });
  });

  // Before /projects/:key, though no other PUT shares the path today.
  router.put('/projects/order', requireAdmin, limitWrites, async (req, res) => {
    await reorderProjects(sql, actorOf(req), projectOrderBody.parse(req.body).keys);
    res.status(204).end();
  });

  router.patch('/projects/:key', requireAdmin, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    const patch = projectPatchBody.parse(req.body);
    const result = await updateProject(sql, actorOf(req), key, patch, ifMatchOf(req));
    if (result === 'missing') throw projectNotFound();
    if (result === 'conflict') throw new AppError('CONFLICT', 'অন্য কেউ এর মধ্যে প্রকল্পটি বদলেছেন — পাতা রিফ্রেশ করে আবার চেষ্টা করুন');
    res.json({ data: await adminProject(sql, key) });
  });

  router.delete('/projects/:key', requireMainAdmin, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    if (!(await deleteProject(sql, actorOf(req), key))) throw projectNotFound();
    res.status(204).end();
  });

  router.post('/projects/:key/fields', requireAdmin, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    const field = await createField(sql, actorOf(req), key, fieldCreateBody.parse(req.body));
    if (!field) throw projectNotFound();
    res.status(201).json({ data: field });
  });

  router.put('/projects/:key/fields/order', requireAdmin, limitWrites, async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    if (!(await reorderFields(sql, actorOf(req), key, fieldOrderBody.parse(req.body).ids))) throw projectNotFound();
    res.status(204).end();
  });

  router.patch('/fields/:id', requireAdmin, limitWrites, async (req, res) => {
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

  return router;
}
