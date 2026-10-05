import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF guard for the cookie session (NE-SEC-05): a request that can change state must come from
 * an allowed origin. Browsers always send Origin on these methods, so a missing one is refused too.
 */
export function originCheck(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin !== undefined && allowed.has(origin)) return next();
    req.log.warn({ origin: origin ?? null }, 'refused a state-changing request from a disallowed origin');
    next(new AppError('FORBIDDEN', 'এই উৎস থেকে অনুরোধ গ্রহণযোগ্য নয়'));
  };
}
