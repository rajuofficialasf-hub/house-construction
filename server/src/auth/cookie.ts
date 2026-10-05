import type { CookieOptions } from 'express';
import { ABSOLUTE_TIMEOUT_MS } from './session.js';

export interface SessionCookie {
  name: string;
  options: CookieOptions;
}

/**
 * The session cookie's name and attributes (NE-SEC-05). Browsers accept a `__Host-` cookie only
 * when it is Secure with Path=/, so plain-http local development uses the bare name.
 */
export function sessionCookie(secure: boolean): SessionCookie {
  return {
    name: secure ? '__Host-housing_session' : 'housing_session',
    options: { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: ABSOLUTE_TIMEOUT_MS },
  };
}

/** The value of one cookie from a Cookie header. Session tokens are base64url, so nothing is decoded. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const pair of header?.split(';') ?? []) {
    const eq = pair.indexOf('=');
    if (eq > 0 && pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return undefined;
}
