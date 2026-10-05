import { Router } from 'express';
import { pingDb, type Sql } from '../../db.js';

// Unauthenticated liveness and readiness checks for nginx and the uptime monitor (NE-ERR-05).
// They say only "ok" or "unavailable", never why.
export function healthRouter(sql: Sql): Router {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  router.get('/readyz', async (req, res) => {
    try {
      await pingDb(sql);
      res.json({ data: { status: 'ok' } });
    } catch (err) {
      req.log.warn({ err }, 'readiness check failed: database unavailable');
      res.status(503).json({ error: { code: 'INTERNAL_ERROR', message: 'সার্ভিস এখন পাওয়া যাচ্ছে না' } });
    }
  });

  return router;
}
