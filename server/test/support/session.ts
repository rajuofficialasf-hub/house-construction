import request from 'supertest';
import type { Express } from 'express';
import { hashPassword } from '../../src/auth/password.js';
import type { Sql } from '../../src/db.js';
import { insertAdmin, type AdminInput, type InsertedAdmin } from './db.js';

// An admin session for HTTP tests of admin routes: insert an admin and log in through the real route.

export const TEST_ORIGIN = 'http://localhost:5173';
export const TEST_PASSWORD = 'correct horse battery staple';

// argon2 takes tens of milliseconds, so the hash is made once per test file.
let hash: Promise<string> | undefined;
export const testPasswordHash = () => (hash ??= hashPassword(TEST_PASSWORD));

/** The `name=value` part of the session cookie a response set. */
export function sessionCookieFrom(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('housing_session=') || c.startsWith('__Host-housing_session='));
  if (!cookie) throw new Error('no session cookie set');
  return cookie.split(';')[0] as string;
}

/** Inserts an admin (as the owner) and logs in; returns the admin and the cookie to send. */
export async function loginAdmin(app: Express, owner: Sql, input: AdminInput = {}): Promise<{ admin: InsertedAdmin; cookie: string }> {
  const admin = await insertAdmin(owner, { passwordHash: await testPasswordHash(), ...input });
  const res = await request(app).post('/api/v1/auth/login').set('origin', TEST_ORIGIN).send({ email: admin.email, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`login failed with ${res.status}`);
  return { admin, cookie: sessionCookieFrom(res) };
}
