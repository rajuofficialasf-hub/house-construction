import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import {
  getFilterOptions,
  getNextSerial,
  getRecordById,
  getRecordBySerial,
  getRecordsBySerials,
  getStats,
  getYears,
  listRecords,
} from '../../housing/reads.js';
import {
  idParams,
  listQuery,
  nextSerialQuery,
  projectTypeQuery,
  serialParams,
  serialsParams,
  serialsQuery,
} from '../../housing/schemas.js';

// The public housing reads (docs/api/API_CONTRACT.md §4). Anyone may call them, so nothing here
// looks at req.admin. Literal paths come before /:id, which would otherwise swallow them.

export interface ReadRateLimit {
  windowMs: number;
  limit: number;
}

// Per-IP cap on the public reads (NE-SEC-04). Search and stats scan the table and other origins
// can call them; 300 a minute is far above what one visitor's pages need. The counter is in
// memory, which is exact while the API runs as one process.
export const DEFAULT_READ_RATE_LIMIT: ReadRateLimit = { windowMs: 60_000, limit: 300 };

/** A per-IP limit on public reads that answers the contract's 429 and logs which reads hit it. */
export function readRateLimiter(limits: ReadRateLimit, logMessage: string): RequestHandler {
  return rateLimit({
    ...limits,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      req.log.warn(logMessage);
      next(new AppError('RATE_LIMITED', 'অনেক বেশি অনুরোধ হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন'));
    },
  });
}

const notFound = () => new AppError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি');

export function housingReadRouter(sql: Sql, readRateLimit: ReadRateLimit = DEFAULT_READ_RATE_LIMIT): Router {
  const router = Router();

  router.use(readRateLimiter(readRateLimit, 'housing reads rate-limited'));

  router.get('/', async (req, res) => {
    res.json(await listRecords(sql, listQuery.parse(req.query)));
  });

  router.get('/stats', async (req, res) => {
    res.json({ data: await getStats(sql, projectTypeQuery.parse(req.query).project_type) });
  });

  router.get('/years', async (req, res) => {
    res.json({ data: await getYears(sql, projectTypeQuery.parse(req.query).project_type) });
  });

  router.get('/filter-options', async (req, res) => {
    res.json({ data: await getFilterOptions(sql, projectTypeQuery.parse(req.query).project_type) });
  });

  router.get('/next-serial', async (req, res) => {
    const { project_type } = nextSerialQuery.parse(req.query);
    res.json({ data: { project_type, next_serial: await getNextSerial(sql, project_type) } });
  });

  router.get('/:project_type/serial/:serial_no', async (req, res) => {
    const { project_type, serial_no } = serialParams.parse(req.params);
    const record = await getRecordBySerial(sql, project_type, serial_no);
    if (!record) throw notFound();
    res.json({ data: record });
  });

  router.get('/:project_type/serials', async (req, res) => {
    const { project_type } = serialsParams.parse(req.params);
    const { nos } = serialsQuery.parse(req.query);
    res.json({ data: await getRecordsBySerials(sql, project_type, nos) });
  });

  router.get('/:id', async (req, res) => {
    const record = await getRecordById(sql, idParams.parse(req.params).id);
    if (!record) throw notFound();
    res.json({ data: record });
  });

  return router;
}
