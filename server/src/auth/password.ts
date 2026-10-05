import { randomBytes } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { verify as bcryptVerify } from '@node-rs/bcrypt';

// Admin password hashes. New hashes are argon2id; bcrypt hashes imported from Supabase are
// accepted until the admin's next login replaces them. Hashing runs off the main thread (NE-ERR-06).

// OWASP's minimum for argon2id: 19 MiB, 2 passes, 1 lane. Algorithm 2 is argon2id; the library
// exports it as a const enum, which isolatedModules can't read.
const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const CURRENT_PREFIX = '$argon2id$v=19$m=19456,t=2,p=1$';
const BCRYPT_PREFIX = /^\$2[aby]\$/;

export function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

/** True when the password matches. A hash in an unknown or broken format never matches. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    if (hash.startsWith('$argon2')) return await argon2Verify(hash, password);
    if (BCRYPT_PREFIX.test(hash)) return await bcryptVerify(password, hash);
    return false;
  } catch {
    // The libraries throw on a malformed hash; for login that is simply not a match.
    return false;
  }
}

/** True when the hash isn't argon2id with the current parameters, so the next login should rehash. */
export function needsUpgrade(hash: string): boolean {
  return !hash.startsWith(CURRENT_PREFIX);
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as checking a real password, then fails. Login calls it for an unknown
 * or disabled email, so response time doesn't tell an attacker which emails are admins (AU-10).
 */
export async function verifyDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
  await argon2Verify(await dummyHash, password);
  return false;
}
