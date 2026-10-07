import { Router, type Request } from 'express';
import { requireAdmin } from '../../auth/middleware.js';
import { isEditor, requireProjectScope } from '../../auth/scope.js';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import { listActivity, logEvent, type ActivityScope } from '../../housing/activity.js';
import { projectActivityBody, projectActivityQuery } from '../../housing/schemas.js';
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

// The activity log (docs/api/PROJECTS_API_CONTRACT.md §4.5): admin-only, reads included, and never on
// the public-read CORS list. Mounted at /api/v1 with full paths and no router.use(), so each route
// names its own guard. The log can name private fields (never their values), so no answer is cached.

export interface ActivityDeps {
  sql: Sql;
  readRateLimit?: ReadRateLimit;
  writeRateLimit?: WriteRateLimit;
}

/**
 * Only a main admin and an admin read the whole log. An editor is scoped, and so is any principal
 * without an exact allProjects true (fails closed).
 */
function activityScopeOf(req: Request): ActivityScope | undefined {
  const admin = req.admin;
  if (!admin) throw new AppError('UNAUTHENTICATED', 'লগইন করুন');
  if (admin.allProjects === true && !isEditor(admin)) return undefined;
  return { projects: admin.allProjects === true ? 'all' : admin.projects, adminId: admin.id };
}

export function activityRouter({ sql, readRateLimit = DEFAULT_READ_RATE_LIMIT, writeRateLimit = DEFAULT_WRITE_RATE_LIMIT }: ActivityDeps): Router {
  const router = Router();
  const limitReads = readRateLimiter(readRateLimit, 'activity reads rate-limited');
  const limitWrites = writeRateLimiter(writeRateLimit);

  router.get('/activity', privateNoStore, requireAdmin, limitReads, async (req, res) => {
    res.json(await listActivity(sql, projectActivityQuery.parse(req.query), activityScopeOf(req)));
  });

  // A client event is the browser's own summary of work it did (an import, an export); its details
  // are what the client said, not proof of what happened.
  router.post('/activity', privateNoStore, requireAdmin, limitWrites, async (req, res) => {
    const body = projectActivityBody.parse(req.body);
    // An editor reports work only in its own projects.
    if (body.project_type) requireProjectScope(req, body.project_type);
    res.status(201).json({ data: { id: await logEvent(sql, actorOf(req), body) } });
  });

  return router;
}
