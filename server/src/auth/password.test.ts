import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, needsUpgrade, verifyDummy, verifyPassword } from './password.js';

// The real argon2 verify, wrapped so a test can see that a refused hash still pays for one.
vi.mock('@node-rs/argon2', async (importOriginal) => {
  const real = await importOriginal<typeof import('@node-rs/argon2')>();
  return { ...real, verify: vi.fn(real.verify) };
});

const PASSWORD = 'correct horse battery staple';
// A valid hash of PASSWORD in another scheme ($2b$, made with `htpasswd -bnBC 10` outside this code).
// The server only ever writes argon2id, so it must never accept one.
const OTHER_SCHEME = '$2b$10$BGomm5xAUDEyntfsi23fyOvEM0ZEOWtJ4hQRUJW4IQGwM.Tc9dxfe';

beforeEach(() => {
  vi.mocked(argon2Verify).mockClear();
});

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

  it('refuses a hash in any other scheme, even with the right password', async () => {
    expect(await verifyPassword(OTHER_SCHEME, PASSWORD)).toBe(false);
  });

  it('spends exactly one argon2 verify, against the dummy hash, on a hash in another scheme', async () => {
    const argon2i = await argon2Hash(PASSWORD, { algorithm: 1 });
    for (const hash of [OTHER_SCHEME, 'not-a-hash', argon2i]) {
      vi.mocked(argon2Verify).mockClear();
      expect(await verifyPassword(hash, PASSWORD), hash).toBe(false);
      expect(vi.mocked(argon2Verify).mock.calls, hash).toHaveLength(1);
      expect(vi.mocked(argon2Verify).mock.calls[0]?.[0], hash).not.toBe(hash);
    }
  });

  it('spends the dummy verify too when an argon2id hash is broken', async () => {
    const broken = '$argon2id$v=19$broken';
    vi.mocked(argon2Verify).mockClear();
    expect(await verifyPassword(broken, PASSWORD)).toBe(false);
    // The library throws on the broken hash, then the dummy verify runs.
    expect(vi.mocked(argon2Verify).mock.calls).toHaveLength(2);
    expect(vi.mocked(argon2Verify).mock.calls[1]?.[0]).not.toBe(broken);
  });

  it('says a weaker argon2id hash needs an upgrade', async () => {
    expect(needsUpgrade(await argon2Hash(PASSWORD, { timeCost: 1, memoryCost: 19456, parallelism: 1 }))).toBe(true);
    expect(needsUpgrade(await hashPassword(PASSWORD))).toBe(false);
  });

  it('treats an unknown or broken hash as a wrong password, without throwing', async () => {
    expect(await verifyPassword('not-a-hash', PASSWORD)).toBe(false);
    expect(await verifyPassword('$argon2id$v=19$broken', PASSWORD)).toBe(false);
  });

  it('never accepts a password through the dummy check', async () => {
    expect(await verifyDummy(PASSWORD)).toBe(false);
    expect(await verifyDummy('')).toBe(false);
  });
});
