import { hash as argon2Hash } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';
import { hashPassword, needsUpgrade, verifyDummy, verifyPassword } from './password.js';

const PASSWORD = 'correct horse battery staple';
// Made with `htpasswd -bnBC 10 "" '<PASSWORD>'`, outside this code. Supabase exports the same
// format with the $2a$ prefix, which bcrypt treats the same as $2y$.
const BCRYPT_2Y = '$2y$10$BGomm5xAUDEyntfsi23fyOvEM0ZEOWtJ4hQRUJW4IQGwM.Tc9dxfe';
const BCRYPT_2A = BCRYPT_2Y.replace('$2y$', '$2a$');

describe('password hashing', () => {
  it('hashes with argon2id at the OWASP minimum and verifies the hash', async () => {
    const hash = await hashPassword(PASSWORD);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, 'wrong password')).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it('verifies a bcrypt hash imported from Supabase', async () => {
    expect(await verifyPassword(BCRYPT_2A, PASSWORD)).toBe(true);
    expect(await verifyPassword(BCRYPT_2Y, PASSWORD)).toBe(true);
    expect(await verifyPassword(BCRYPT_2A, 'wrong password')).toBe(false);
  });

  it('says a bcrypt hash or a weaker argon2id hash needs an upgrade', async () => {
    expect(needsUpgrade(BCRYPT_2A)).toBe(true);
    expect(needsUpgrade(await argon2Hash(PASSWORD, { timeCost: 1, memoryCost: 19456, parallelism: 1 }))).toBe(true);
    expect(needsUpgrade(await hashPassword(PASSWORD))).toBe(false);
  });

  it('treats an unknown or broken hash as a wrong password, without throwing', async () => {
    expect(await verifyPassword('not-a-hash', PASSWORD)).toBe(false);
    expect(await verifyPassword('$argon2id$v=19$broken', PASSWORD)).toBe(false);
    expect(await verifyPassword('$2a$10$short', PASSWORD)).toBe(false);
  });

  it('never accepts a password through the dummy check', async () => {
    expect(await verifyDummy(PASSWORD)).toBe(false);
    expect(await verifyDummy('')).toBe(false);
  });
});
