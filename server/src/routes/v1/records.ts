import { Router } from 'express';
import type { Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import {
  getRecord,
  getRecordsBySerials,
  listProjectRecords,
  projectNextSerial,
  projectYears,
  recordNotFound,
  recordProject,
} from '../../records/reads.js';
import { fieldFilters, idParams, projectRecordsParams, projectSerialParams, recordListQuery, serialsQuery } from '../../records/schemas.js';
import { DEFAULT_READ_RATE_LIMIT, readRateLimiter, type ReadRateLimit } from './housing.js';
import { sessionAwareCaching, viewerOf } from './projects.js';

// The record reads (docs/api/PROJECTS_API_CONTRACT.md §4.3, §4.4.1–§4.4.3). Mounted at /api/v1 with
// full paths and no router.use(), so its limiter and caching touch only these routes. Public, but an
// admin session also reaches drafts, so answers vary on the cookie.

export function recordsReadRouter(sql: Sql, readRateLimit: ReadRateLimit = DEFAULT_READ_RATE_LIMIT): Router {
  const router = Router();
  const read = [readRateLimiter(readRateLimit, 'record reads rate-limited'), sessionAwareCaching];

  router.get('/projects/:key/records', ...read, async (req, res) => {
    const { key } = projectRecordsParams.parse(req.params);
    const query = recordListQuery.parse(req.query);
    const filters = fieldFilters(req.query);
    const viewer = viewerOf(req);
    const project = await recordProject(sql, key, viewer);
    res.json(await listProjectRecords(sql, project, query, filters, viewer));
  });

  router.get('/projects/:key/records/serial/:n', ...read, async (req, res) => {
    const { key, n } = projectSerialParams.parse(req.params);
    const viewer = viewerOf(req);
    const [record] = await getRecordsBySerials(sql, await recordProject(sql, key, viewer), [n], viewer);
    if (!record) throw recordNotFound();
    res.json({ data: record });
  });

  router.get('/projects/:key/records/serials', ...read, async (req, res) => {
    const { key } = projectRecordsParams.parse(req.params);
    const { nos } = serialsQuery.parse(req.query);
    const viewer = viewerOf(req);
    res.json({ data: await getRecordsBySerials(sql, await recordProject(sql, key, viewer), nos, viewer) });
  });

  router.get('/projects/:key/years', ...read, async (req, res) => {
    const { key } = projectRecordsParams.parse(req.params);
    const years = await projectYears(sql, key, viewerOf(req));
    if (!years) throw new AppError('NOT_FOUND', 'প্রকল্প পাওয়া যায়নি');
    res.json({ data: years });
  });

  router.get('/projects/:key/next-serial', ...read, async (req, res) => {
    const { key } = projectRecordsParams.parse(req.params);
    res.json({ data: { project_type: key, next_serial: await projectNextSerial(sql, key, viewerOf(req)) } });
  });

  router.get('/records/:id', ...read, async (req, res) => {
    const record = await getRecord(sql, idParams.parse(req.params).id, viewerOf(req));
    if (!record) throw recordNotFound();
    res.json({ data: record });
  });

  return router;
}
