import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';
import { readCookie } from './cookie.js';
import { authenticate, hashSessionToken } from './session.js';
import type { AdminPrincipal, AuthDeps } from './types.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by sessionMiddleware for a live admin session; absent otherwise. */
    admin?: AdminPrincipal;
    /** The session's id (its token hash), set together with admin. */
    sessionId?: Buffer;
  }
}

/**
 * The one place a session cookie becomes `req.admin` (AU-21). Routes never read the cookie.
 * A missing or dead session is not an error here; requireAdmin refuses it where it matters.
 */
export function sessionMiddleware(deps: AuthDeps, cookieName: string): RequestHandler {
  return async (req, _res, next) => {
    const token = readCookie(req.headers.cookie, cookieName);
    if (token) {
      const sessionId = hashSessionToken(token);
      const admin = await authenticate(deps, sessionId);
      if (admin) {
        req.admin = admin;
        req.sessionId = sessionId;
      }
    }
    next();
  };
}

/** Refuses the request unless a live admin session is present (NE-SEC-03). */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.admin) throw new AppError('UNAUTHENTICATED', 'লগইন করুন');
  next();
};

/** A guard that refuses the request unless the session's admin is the main admin, with this 403 message. */
function mainAdminOnly(message: string): RequestHandler {
  return (req, _res, next) => {
    if (!req.admin) throw new AppError('UNAUTHENTICATED', 'লগইন করুন');
    if (req.admin.role !== 'main_admin') {
      req.log.warn({ adminId: req.admin.id }, 'delete refused: not the main admin');
      throw new AppError('FORBIDDEN', message);
    }
    next();
  };
}

/** Refuses the request unless the session's admin is the main admin, the only one who may delete. */
export const requireMainAdmin = mainAdminOnly('শুধু মূল এডমিন মুছতে পারেন');

/** requireMainAdmin for a photo delete, with the contract's own message (§4.4.11). */
export const requireMainAdminForPhotos = mainAdminOnly('শুধু মূল এডমিন ছবি মুছতে পারেন');
