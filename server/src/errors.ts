import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

// Error codes and statuses from docs/api/API_CONTRACT.md §1.2. The REST adapter in
// src/features/housing/backend/rest/http.ts relies on exactly these codes.
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ErrorDetails {
  field?: string;
  reason?: string;
}

/** An error the client is allowed to see: its code, message and details go into the response. */
export class AppError extends Error {
  override name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('NOT_FOUND', 'পাওয়া যায়নি'));
};

/**
 * express.json() errors carry a `type` and a 4xx `status` when the client caused them (bad JSON,
 * too large, unsupported encoding or charset, aborted upload). They are the client's fault, not a 500.
 */
function bodyParserError(err: unknown): AppError | undefined {
  if (typeof err !== 'object' || err === null || !('type' in err) || !('status' in err)) return undefined;
  if (typeof err.status !== 'number' || err.status < 400 || err.status >= 500) return undefined;
  if (err.status === 413) return new AppError('PAYLOAD_TOO_LARGE', 'অনুরোধটি অনেক বড়');
  const reason = err.type === 'entity.parse.failed' ? 'invalid_json' : String(err.type);
  return new AppError('VALIDATION_ERROR', 'অনুরোধটি সঠিক নয়', { reason });
}

function toAppError(err: unknown): AppError | undefined {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    return new AppError('VALIDATION_ERROR', 'ইনপুট সঠিক নয়', {
      field: issue?.path.join('.') || undefined,
      reason: issue?.code,
    });
  }
  return bodyParserError(err);
}

/**
 * The single error middleware (NE-ERR-01). Known errors map to their contract status;
 * anything else is logged in full and answered with a generic 500, never the stack (NE-SEC-11).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Once a response has started, only Express can end it (it closes the connection).
  if (res.headersSent) {
    next(err);
    return;
  }
  const known = toAppError(err);
  if (!known) {
    req.log.error({ err }, 'unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'সার্ভারে সমস্যা হয়েছে' } });
    return;
  }
  res.status(known.status).json({
    error: { code: known.code, message: known.message, ...(known.details && { details: known.details }) },
  });
};
