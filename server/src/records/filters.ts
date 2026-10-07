import type { Sql, Tx } from '../db.js';
import { AppError } from '../errors.js';
import { likePattern } from '../housing/reads.js';

// The record filters and search, shared by the list and the filtered stats so the cards always count
// exactly what the list shows (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md,
// P8b decisions). The caller adds its own project condition; every condition reads the alias b.

/** The fields that may filter (key to type) and be searched, already limited to what the viewer may use. */
export interface FilterFields {
  filterable: Map<string, string>;
  searchable: string[];
}

/** The base filters of a list or stats query, parsed and NFC'd by the route's zod schema. */
export interface BaseFilters {
  year?: number | undefined;
  division?: string | undefined;
  district?: string | undefined;
  upazila?: string | undefined;
  union_name?: string | undefined;
  q?: string | undefined;
}

/** True when any filter holds a value; blanks don't count, as recordFilters skips them too. */
export function hasRecordFilters(query: BaseFilters, filters: Map<string, string>): boolean {
  const base = query.year !== undefined || !!(query.division || query.district || query.upazila || query.union_name || query.q);
  return base || [...filters.values()].some((value) => value.trim() !== '');
}

/** A filter value as the trigger stores it, so it matches exactly (0013_record_rules.sql). */
function filterValue(key: string, type: string, raw: string): string | number {
  if (type === 'number' || type === 'money') {
    if (!/^-?[0-9]{1,15}(\.[0-9]{1,2})?$/.test(raw.trim())) {
      throw new AppError('VALIDATION_ERROR', 'শুধু সংখ্যা দিন', { field: `f.${key}`, reason: 'invalid_type' });
    }
    return Number(raw);
  }
  const text = raw.trim().normalize('NFC');
  return type === 'category' ? text.replace(/\s+/g, ' ') : text;
}

/** The where conditions for the base filters, the f.<key> filters and the search, to be joined with and. */
export function recordFilters(sql: Sql | Tx, fields: FilterFields, filters: Map<string, string>, query: BaseFilters) {
  const conditions = [];
  if (query.year !== undefined) conditions.push(sql`b.year = ${query.year}`);
  if (query.division) conditions.push(sql`b.division = ${query.division}`);
  if (query.district) conditions.push(sql`b.district = ${query.district}`);
  if (query.upazila) conditions.push(sql`b.upazila = ${query.upazila}`);
  if (query.union_name) conditions.push(sql`b.union_name = ${query.union_name}`);
  // Only fields the caller allows filter; any other f.<key> is ignored (§4.4.1). Keys and values
  // are bound, never spliced into the SQL.
  for (const [key, raw] of filters) {
    const type = fields.filterable.get(key);
    if (type === undefined || raw.trim() === '') continue;
    conditions.push(sql`b.extra @> ${sql.json({ [key]: filterValue(key, type, raw) })}`);
  }
  if (query.q) {
    const pattern = likePattern(query.q);
    const custom = fields.searchable.map((key) => sql`or b.extra ->> ${key}::text ilike ${pattern} escape '\\'`);
    conditions.push(sql`(b.name ilike ${pattern} escape '\\'
      or b.father_or_husband_name ilike ${pattern} escape '\\'
      or b.address ilike ${pattern} escape '\\'
      ${custom.reduce((all, one) => sql`${all} ${one}`, sql``)})`);
  }
  return conditions;
}
