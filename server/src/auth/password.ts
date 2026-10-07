import { randomBytes } from 'node:crypto';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';

// Admin password hashes are argon2id, and nothing else is ever accepted. Hashing runs off the main
// thread (NE-ERR-06).

// OWASP's minimum for argon2id: 19 MiB, 2 passes, 1 lane. Algorithm 2 is argon2id; the library
// exports it as a const enum, which isolatedModules can't read.
const ARGON2_OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const CURRENT_PREFIX = '$argon2id$v=19$m=19456,t=2,p=1$';

export function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, ARGON2_OPTIONS);
}

/**
 * True when the password matches. A hash in another scheme or a broken one never matches, and still
 * costs one argon2 verify, so response time doesn't tell which admins hold such a hash (AU-10).
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (hash.startsWith('$argon2')) {
    try {
      return await argon2Verify(hash, password);
    } catch {
      // The library throws on a malformed hash; for login that is simply not a match.
    }
  }
  return verifyDummy(password);
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
