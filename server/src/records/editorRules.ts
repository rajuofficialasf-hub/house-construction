import { AppError } from '../errors.js';

// What an editor may not do to a record it can write: empty a filled value or replace a photo.
// Only the main admin and an admin may (the P9b decisions in
// docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md).

type Values = Record<string, unknown>;

/** Blank as SQL 14's guard saw it: null, missing, or text that is empty after trimming. */
const isBlank = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

/**
 * The first value a write would empty, as a field key (a column, or `extra.<key>`), or undefined.
 * `before` is the stored row; `patch` the sent columns, where a sent `extra` replaces the whole map.
 */
export function emptiedField(before: Values & { extra?: Values }, patch: Values & { extra?: Values | undefined }): string | undefined {
  for (const [key, value] of Object.entries(patch)) {
    if (key !== 'extra' && isBlank(value) && !isBlank(before[key])) return key;
  }
  if (patch.extra === undefined) return undefined;
  const after = patch.extra;
  const emptied = Object.keys(before.extra ?? {}).find((key) => !isBlank(before.extra?.[key]) && isBlank(after[key]));
  return emptied && `extra.${emptied}`;
}

/** The refusal of an editor's write that would empty this field. */
export const emptyingRefused = (field: string) =>
  new AppError('FORBIDDEN', 'ভরা ঘর ফাঁকা করতে পারেন শুধু মূল এডমিন ও এডমিন', { field });

/** The refusal of an editor's upload into a filled photo slot. */
export const photoReplaceRefused = (slot: 'prev' | 'current') =>
  new AppError('FORBIDDEN', 'আগে থেকে থাকা ছবি বদলাতে পারেন শুধু মূল এডমিন ও এডমিন', { field: `${slot}_photo_url` });
