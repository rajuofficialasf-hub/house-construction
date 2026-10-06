import type { ErrorRequestHandler, RequestHandler } from 'express';
import postgres from 'postgres';
import { ZodError } from 'zod';

// Error codes and statuses from docs/api/API_CONTRACT.md §1.2. The REST adapter in
// src/backend/rest/http.ts relies on exactly these codes.
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ErrorDetails {
  field?: string;
  reason?: string;
  /** The failing row of a bulk body (contract §4.9); `field` is then the field inside that row. */
  row_index?: number;
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

function zodDetails(err: ZodError): ErrorDetails {
  const issue = err.issues[0];
  const path = issue?.path ?? [];
  // A custom check names its own reason in params (for example 'duplicate', 'server_logged').
  const params = issue?.code === 'custom' ? (issue.params as { reason?: unknown } | undefined) : undefined;
  const reason = typeof params?.reason === 'string' ? params.reason : issue?.code;
  if (path[0] === 'rows' && typeof path[1] === 'number') {
    return { row_index: path[1], field: path.slice(2).join('.') || undefined, reason };
  }
  return { field: path.join('.') || undefined, reason };
}

const SERIAL_KEY = 'housing_beneficiaries_project_serial_key';

/**
 * Postgres errors the client caused, by SQLSTATE, with fixed messages: Postgres's own text names
 * tables and key values, so it never reaches the client (NE-SEC-11). Anything unlisted, a missing
 * grant (42501) included, is our bug and stays a 500.
 */
function postgresError(err: postgres.PostgresError): AppError | undefined {
  switch (err.code) {
    case '23505':
      // housing_change_serial raises its own 23505 with no constraint (0002_serial.sql).
      if (!err.constraint_name || err.constraint_name === SERIAL_KEY) return new AppError('CONFLICT', 'এই সিরিয়াল আগে থেকেই আছে');
      return undefined;
    case 'P0002':
      return new AppError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি');
    case '23514': // CHECKs and the serial/project_type protect trigger
    case '23502':
    case '22023':
    case '22P02':
      return new AppError('VALIDATION_ERROR', 'ইনপুট সঠিক নয়', { reason: 'constraint' });
    default:
      return undefined;
  }
}

function toAppError(err: unknown): AppError | undefined {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return new AppError('VALIDATION_ERROR', 'ইনপুট সঠিক নয়', zodDetails(err));
  if (err instanceof postgres.PostgresError) return postgresError(err);
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
  // The zod schemas should stop bad input before SQL; a constraint error means they missed a case.
  if (err instanceof postgres.PostgresError && known.code === 'VALIDATION_ERROR') {
    req.log.warn({ code: err.code, constraint: err.constraint_name }, 'database refused input the schema let through');
  }
  res.status(known.status).json({
    error: { code: known.code, message: known.message, ...(known.details && { details: known.details }) },
  });
};
