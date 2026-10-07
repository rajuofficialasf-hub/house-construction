import { Router, type Request, type RequestHandler } from 'express';
import type { Sql } from '../../db.js';
import { getProject, listProjectFields, listProjects, projectStats, projectsOverview, type Viewer } from '../../projects/reads.js';
import { filteredProjectStats } from '../../projects/filteredStats.js';
import { overviewQuery, projectKeyParams, projectListQuery } from '../../projects/schemas.js';
import { hasRecordFilters } from '../../records/filters.js';
import { fieldFilters, statsQuery } from '../../records/schemas.js';
import { projectNotFound } from '../../records/reads.js';
import { DEFAULT_READ_RATE_LIMIT, readRateLimiter, type ReadRateLimit } from './shared.js';

// The project registry reads (docs/api/PROJECTS_API_CONTRACT.md §4.1). Public, but an admin
// session sees more, so every answer varies on the cookie and an admin's is never cached.

/**
 * The reader as the read queries see it. Every draft only for an exact `allProjects: true`; a scoped
 * editor its project keys; anything else (a visitor, a principal without a list) nothing: fails closed.
 */
export function viewerOf(req: Request): Viewer {
  const admin = req.admin;
  if (!admin) return { admin: false, drafts: [] };
  if (admin.allProjects === true) return { admin: true, drafts: 'all' };
  return { admin: true, drafts: Array.isArray(admin.projects) ? admin.projects : [] };
}

/** Answers vary on the cookie, and an admin's is never stored by any cache. */
export const sessionAwareCaching: RequestHandler = (req, res, next) => {
  res.vary('Cookie');
  if (req.admin) res.set('cache-control', 'private, no-store');
  next();
};

export function projectsReadRouter(sql: Sql, readRateLimit: ReadRateLimit = DEFAULT_READ_RATE_LIMIT): Router {
  const router = Router();

  router.use(readRateLimiter(readRateLimit, 'project reads rate-limited'));
  router.use(sessionAwareCaching);

  router.get('/', async (req, res) => {
    res.json({ data: await listProjects(sql, projectListQuery.parse(req.query), viewerOf(req)) });
  });

  // Before /:key, which would otherwise read "overview" as a project key.
  router.get('/overview', async (req, res) => {
    const { drafts } = overviewQuery.parse(req.query);
    res.json({ data: await projectsOverview(sql, drafts === '1', viewerOf(req)) });
  });

  router.get('/:key', async (req, res) => {
    const found = await getProject(sql, projectKeyParams.parse(req.params).key, viewerOf(req));
    if (!found) throw projectNotFound();
    res.json({ data: found });
  });

  router.get('/:key/stats', async (req, res) => {
    const { key } = projectKeyParams.parse(req.params);
    const query = statsQuery.parse(req.query);
    const filters = fieldFilters(req.query);
    const viewer = viewerOf(req);
    const stats = hasRecordFilters(query, filters)
      ? await filteredProjectStats(sql, key, viewer, query, filters)
      : await projectStats(sql, key, query.light !== undefined, viewer);
    if (stats === null) throw projectNotFound();
    res.json({ data: stats });
  });

  router.get('/:key/fields', async (req, res) => {
    const fields = await listProjectFields(sql, projectKeyParams.parse(req.params).key, viewerOf(req));
    if (!fields) throw projectNotFound();
    res.json({ data: fields });
  });

  return router;
}
