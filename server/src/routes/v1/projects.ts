import { Router, type Request, type RequestHandler } from 'express';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import { getProject, listProjectFields, listProjects, type Viewer } from '../../projects/reads.js';
import { projectKeyParams, projectListQuery } from '../../projects/schemas.js';
import { DEFAULT_READ_RATE_LIMIT, readRateLimiter, type ReadRateLimit } from './housing.js';

// The project registry reads (docs/api/PROJECTS_API_CONTRACT.md §4.1). Public, but an admin
// session sees more, so every answer varies on the cookie and an admin's is never cached.

const notFound = () => new AppError('NOT_FOUND', 'প্রকল্প পাওয়া যায়নি');

const viewerOf = (req: Request): Viewer => ({ admin: req.admin !== undefined });

const sessionAwareCaching: RequestHandler = (req, res, next) => {
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

  router.get('/:key', async (req, res) => {
    const found = await getProject(sql, projectKeyParams.parse(req.params).key, viewerOf(req));
    if (!found) throw notFound();
    res.json({ data: found });
  });

  router.get('/:key/fields', async (req, res) => {
    const fields = await listProjectFields(sql, projectKeyParams.parse(req.params).key, viewerOf(req));
    if (!fields) throw notFound();
    res.json({ data: fields });
  });

  return router;
}
