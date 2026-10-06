import express, { type Request, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Actor } from '../../db.js';
import { AppError } from '../../errors.js';
import { MAX_BULK_ROWS } from '../../housing/schemas.js';

// Rate limits, the actor, the admin-only cache header and the bulk body checks that every v1 router shares. Each router builds
// its own limiter from these, so routers never share a counter.

/** For admin-only answers (private values, the activity log): no cache stores them; set first, so a refusal carries it too. */
export const privateNoStore: RequestHandler = (_req, res, next) => {
  res.set('cache-control', 'private, no-store');
  next();
};

export interface RateLimit {
  windowMs: number;
  limit: number;
}

export type ReadRateLimit = RateLimit;

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

export type WriteRateLimit = RateLimit;

// Per-admin cap on writes (NE-SEC-04). A bulk request is one write, so the import's 200-row
// batches and the photo page's 2 uploads at a time stay far below it; a stolen session or a
// runaway script doesn't. In memory, exact while the API runs as one process.
export const DEFAULT_WRITE_RATE_LIMIT: WriteRateLimit = { windowMs: 60_000, limit: 120 };

/** Counts each admin's writes; runs only after requireAdmin, so req.admin is always set. */
export function writeRateLimiter(limits: WriteRateLimit) {
  return rateLimit({
    ...limits,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => actorOf(req).id,
    handler: (req, _res, next) => {
      req.log.warn({ adminId: actorOf(req).id }, 'admin writes rate-limited');
      next(new AppError('RATE_LIMITED', 'অনেক বেশি অনুরোধ হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন'));
    },
  });
}

// 500 rows with every field at its cap in Bangla (3 bytes a character) is about 8.5 MB.
export const bulkJson = express.json({ limit: '10mb' });

// Only the row count; the full body schema runs after this check.
const bulkRows = z.object({ rows: z.array(z.unknown()) });

/** More rows than the contract allows is 413, not 400, so it's checked before the schema. */
export function checkRowCount(body: unknown): void {
  const parsed = bulkRows.safeParse(body);
  if (parsed.success && parsed.data.rows.length > MAX_BULK_ROWS) {
    throw new AppError('PAYLOAD_TOO_LARGE', `একবারে সর্বোচ্চ ${MAX_BULK_ROWS}টি সারি পাঠানো যায়`);
  }
}

/** The logged-in admin as the actor for the activity log; never taken from the request body. */
export function actorOf(req: Request): Actor {
  if (!req.admin) throw new AppError('UNAUTHENTICATED', 'লগইন করুন');
  return { id: req.admin.id, email: req.admin.email };
}
