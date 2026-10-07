import { Router } from 'express';
import { requireMainAdminForUsers } from '../../auth/middleware.js';
import { adminUserBody } from '../../auth/userSchemas.js';
import { findAdminByEmail, listAdminUsers, saveAdminUser } from '../../auth/users.js';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
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

// The main admin's users page (docs/api/PROJECTS_API_CONTRACT.md §4.6). Mounted at /api/v1 with
// full paths and no router.use(), so each route names its own guard. Never on the public-read CORS
// list, and never cached. Logins are created only by the admin CLI; this saves existing ones.

export interface AdminUsersDeps {
  sql: Sql;
  readRateLimit?: ReadRateLimit;
  writeRateLimit?: WriteRateLimit;
}

export function adminUsersRouter({ sql, readRateLimit = DEFAULT_READ_RATE_LIMIT, writeRateLimit = DEFAULT_WRITE_RATE_LIMIT }: AdminUsersDeps): Router {
  const router = Router();
  const limitReads = readRateLimiter(readRateLimit, 'users list reads rate-limited');
  const limitWrites = writeRateLimiter(writeRateLimit);

  router.get('/admin/users', privateNoStore, requireMainAdminForUsers, limitReads, async (_req, res) => {
    res.json({ data: await listAdminUsers(sql) });
  });

  router.put('/admin/users', privateNoStore, requireMainAdminForUsers, limitWrites, async (req, res) => {
    const body = adminUserBody.parse(req.body);
    // The save function refuses both cases too; answering here gives the page its own words.
    const target = await findAdminByEmail(sql, body.email);
    if (!target) throw new AppError('NOT_FOUND', 'এই ইমেইলে কোনো অ্যাকাউন্ট নেই — আগে সার্ভারের এডমিন CLI দিয়ে অ্যাকাউন্ট খুলুন', { field: 'email' });
    if (target.role === 'main_admin') throw new AppError('FORBIDDEN', 'মূল এডমিনকে এখান থেকে বদলানো যায় না', { field: 'email' });
    const actor = actorOf(req);
    const saved = await saveAdminUser(sql, actor, body);
    // Ids only (NE-LOG-02); the activity row, which only the main admin reads, keeps the email.
    req.log.info(
      { event: 'admin_user_update', actor: actor.id, target: saved.id, role: saved.role, all_projects: saved.all_projects, projects: saved.projects, active: saved.is_active },
      'admin user saved',
    );
    res.json({ data: saved });
  });

  return router;
}
