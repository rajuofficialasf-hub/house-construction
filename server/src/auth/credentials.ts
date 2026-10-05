import { z } from 'zod';

// Email and password rules shared by the login route and the admin CLI, so an admin can always
// log in with what the CLI accepted. Emails are stored and looked up lower-cased.

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;
