import express, { Router, type Request } from 'express';
import { requireAdmin } from '../../auth/middleware.js';
import type { Actor, Sql } from '../../db.js';
import { AppError } from '../../errors.js';
import {
  bulkInsertBody,
  bulkUpdateBody,
  changeSerialBody,
  createBody,
  idParams,
  MAX_BULK_ROWS,
  updateBody,
} from '../../housing/schemas.js';
import { bulkInsert, bulkUpdateBySerial, changeSerial, createRecord, deleteRecord, updateRecord } from '../../housing/writes.js';

// The admin housing routes (docs/api/API_CONTRACT.md §4.5খ–§4.9গ). Mounted on /api/v1/housing
// before the public read router, so its literal paths win over the reads' /:id.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const notFound = () => new AppError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি');

/** The bulk import's full path; app.ts keeps its 100kb parser off it. */
export const BULK_PATH = '/api/v1/housing/bulk';

// 500 rows with every field at its cap in Bangla (3 bytes a character) is about 8.5 MB.
const bulkJson = express.json({ limit: '10mb' });

/** More rows than the contract allows is 413, not 400, so it's checked before the schema. */
function checkRowCount(body: unknown): void {
  const rows = (body as { rows?: unknown } | undefined)?.rows;
  if (Array.isArray(rows) && rows.length > MAX_BULK_ROWS) {
    throw new AppError('PAYLOAD_TOO_LARGE', `একবারে সর্বোচ্চ ${MAX_BULK_ROWS}টি সারি পাঠানো যায়`);
  }
}

/** The logged-in admin as the actor for the activity log; never taken from the request body. */
function actorOf(req: Request): Actor {
  if (!req.admin) throw new AppError('UNAUTHENTICATED', 'লগইন করুন');
  return { id: req.admin.id, email: req.admin.email };
}

export function housingAdminRouter(sql: Sql): Router {
  const router = Router();

  // Deny by default (NE-SEC-03): every write under /housing needs an admin session, including
  // paths with no route yet, before any body is validated. Reads pass through to the read router.
  router.use((req, res, next) => (SAFE_METHODS.has(req.method) ? next() : requireAdmin(req, res, next)));

  // requireAdmin before the parser, so only an admin can make the server read 10 MB.
  router.post('/bulk', requireAdmin, bulkJson, async (req, res) => {
    checkRowCount(req.body);
    res.json({ data: await bulkInsert(sql, actorOf(req), bulkInsertBody.parse(req.body)) });
  });

  router.put('/bulk', requireAdmin, bulkJson, async (req, res) => {
    checkRowCount(req.body);
    res.json({ data: await bulkUpdateBySerial(sql, actorOf(req), bulkUpdateBody.parse(req.body)) });
  });

  router.post('/', requireAdmin, async (req, res) => {
    res.status(201).json({ data: await createRecord(sql, actorOf(req), createBody.parse(req.body)) });
  });

  router.post('/:id/serial', requireAdmin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { serial_no } = changeSerialBody.parse(req.body);
    res.json({ data: await changeSerial(sql, actorOf(req), id, serial_no) });
  });

  router.put('/:id', requireAdmin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const record = await updateRecord(sql, actorOf(req), id, updateBody.parse(req.body));
    if (!record) throw notFound();
    res.json({ data: record });
  });

  router.delete('/:id', requireAdmin, async (req, res) => {
    if (!(await deleteRecord(sql, actorOf(req), idParams.parse(req.params).id))) throw notFound();
    res.status(204).end();
  });

  return router;
}
