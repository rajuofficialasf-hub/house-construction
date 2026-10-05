import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { SessionCookie } from '../../auth/cookie.js';
import { requireAdmin } from '../../auth/middleware.js';
import { login, logout } from '../../auth/service.js';
import type { AdminPrincipal, AuthDeps } from '../../auth/types.js';
import { AppError } from '../../errors.js';

// Admin login, logout and current-admin routes (docs/api/API_CONTRACT.md §2).

const loginBody = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(200),
});

// Per-IP throttle on failed logins (NE-SEC-04, AU-13). Ten, not fewer, because an office shares
// one address. The counter lives in memory, which is exact while the API runs as one process.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURES_PER_WINDOW = 10;

const toUser = (admin: AdminPrincipal) => ({ ...admin, role: 'admin' as const });

export function authRouter(deps: AuthDeps, cookie: SessionCookie): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
  });

  const loginLimiter = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: LOGIN_FAILURES_PER_WINDOW,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      req.log.warn('admin login rate-limited');
      next(new AppError('RATE_LIMITED', 'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন'));
    },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = loginBody.parse(req.body);
    const result = await login(deps, email, password);
    if (!result.ok) {
      req.log.warn({ reason: result.reason }, 'admin login failed');
      // One message for every failure, so it reveals nothing about the account (AU-10).
      throw new AppError('UNAUTHENTICATED', 'ইমেইল বা পাসওয়ার্ড সঠিক নয়');
    }
    req.log.info({ adminId: result.admin.id }, 'admin logged in');
    res.cookie(cookie.name, result.token, cookie.options);
    res.json({ data: { expires_at: result.expiresAt.toISOString(), user: toUser(result.admin) } });
  });

  // Always 204, so a tab whose session already ended can still log out cleanly.
  router.post('/logout', async (req, res) => {
    if (req.admin && req.sessionId) {
      await logout(deps, req.admin, req.sessionId);
      req.log.info({ adminId: req.admin.id }, 'admin logged out');
    }
    res.clearCookie(cookie.name, cookie.options);
    res.status(204).end();
  });

  router.get('/me', requireAdmin, (req, res) => {
    res.json({ data: toUser(req.admin as AdminPrincipal) });
  });

  return router;
}
