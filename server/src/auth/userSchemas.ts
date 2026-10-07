import { z } from 'zod';
import { timestamp } from '../housing/schemas.js';
import { projectKey } from '../projects/schemas.js';
import { emailSchema } from './credentials.js';
import { ADMIN_ROLES } from './types.js';

// The bodies of /api/v1/admin/users (docs/api/PROJECTS_API_CONTRACT.md §4.6).

/** At most this many keys in one save; far more than the registry holds. */
export const MAX_ASSIGNED_PROJECTS = 200;

/**
 * A save for an existing login. The page can't make a main admin: only the CLI can. The keys are
 * the assigned ones; a group covers its children.
 */
export const adminUserBody = z.strictObject({
  email: emailSchema,
  role: z.enum(['admin', 'editor']),
  all_projects: z.boolean(),
  projects: z
    .array(projectKey)
    .max(MAX_ASSIGNED_PROJECTS)
    .refine((keys) => new Set(keys).size === keys.length, { message: 'একই প্রকল্প দুবার', params: { reason: 'duplicate' } }),
  is_active: z.boolean(),
});
export type AdminUserBody = z.infer<typeof adminUserBody>;

/** A login as the users page lists it. `projects` holds the assigned keys, not the expanded scope. */
export const adminUser = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.enum(ADMIN_ROLES),
  /** True for the main admin, an admin, and an editor with "all projects"; then `projects` is empty. */
  all_projects: z.boolean(),
  is_active: z.boolean(),
  projects: z.array(z.string()),
  created_at: timestamp,
  /** The newest session's last use, or null when the login has no session. */
  last_seen_at: timestamp.nullable(),
});
export type AdminUser = Omit<z.infer<typeof adminUser>, 'created_at' | 'last_seen_at'> & { created_at: Date; last_seen_at: Date | null };
