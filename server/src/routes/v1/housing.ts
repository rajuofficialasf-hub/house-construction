import { Router } from 'express';
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
import { DEFAULT_READ_RATE_LIMIT, readRateLimiter, type ReadRateLimit } from './shared.js';

// The public housing reads (docs/api/API_CONTRACT.md §4). Anyone may call them, so nothing here
// looks at req.admin. Literal paths come before /:id, which would otherwise swallow them.

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
