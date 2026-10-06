// Supabase admins (public.housing_admins joined to auth.users) become housing_admins rows with the
// same id, so the activity log's actor ids still point at them, and the same bcrypt hash, so they
// log in with their current password (the login rehashes it to argon2id). An admin who couldn't
// log in anyway is imported disabled and reported by id, never by email.
import { emailSchema } from '../auth/credentials.js';
import { CliError } from '../cli/prompt.js';
import type { SourceUser } from './source.js';

/** Stored for an admin with no usable hash: verifyPassword never matches it. */
const UNUSABLE_HASH = '!';

const BCRYPT_HASH = /^\$2[aby]\$\d\d\$/;

export type DisabledReason = 'deleted' | 'banned' | 'bad_email' | 'no_bcrypt_hash' | 'without_passwords';

export interface TargetAdmin {
  id: string;
  email: string;
  name: string | null;
  password_hash: string;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisabledAdmin {
  id: string;
  reasons: DisabledReason[];
}

export interface MappedAdmins {
  admins: TargetAdmin[];
  disabled: DisabledAdmin[];
}

/**
 * Maps the source admins. `withoutPasswords` (the staging rehearsal) keeps every real hash out of
 * the target and disables everyone. Throws when two admins share an email after lower-casing.
 */
export function mapAdmins(users: SourceUser[], { withoutPasswords, now }: { withoutPasswords: boolean; now: Date }): MappedAdmins {
  const stamp = now.toISOString();
  const seen = new Set<string>();
  const admins: TargetAdmin[] = [];
  const disabled: DisabledAdmin[] = [];

  for (const user of users) {
    const reasons: DisabledReason[] = [];
    const lowered = (user.email ?? '').trim().toLowerCase();
    const parsed = emailSchema.safeParse(lowered);
    // A missing or malformed email still needs a unique placeholder; the admin is disabled anyway.
    const email = parsed.success ? parsed.data : `invalid+${user.id}@import.invalid`;
    if (!parsed.success) reasons.push('bad_email');
    if (seen.has(email)) throw new CliError(`two source admins share one email (admin ${user.id}); fix it in Supabase first`);
    seen.add(email);

    if (user.deleted) reasons.push('deleted');
    if (user.banned) reasons.push('banned');
    const hash = user.encrypted_password ?? '';
    const usable = BCRYPT_HASH.test(hash);
    if (!usable) reasons.push('no_bcrypt_hash');
    if (withoutPasswords) reasons.push('without_passwords');

    admins.push({
      id: user.id,
      email,
      name: user.name?.trim() || null,
      password_hash: usable && !withoutPasswords ? hash : UNUSABLE_HASH,
      disabled_at: reasons.length > 0 ? stamp : null,
      created_at: user.created_at,
      updated_at: stamp,
    });
    if (reasons.length > 0) disabled.push({ id: user.id, reasons });
  }
  return { admins, disabled };
}
