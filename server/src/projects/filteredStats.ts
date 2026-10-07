import type { Sql } from '../db.js';
import { recordFilters, type BaseFilters, type FilterFields } from '../records/filters.js';
import type { Viewer } from './reads.js';

// A project's stats under the list's filters, for the list page's cards: one query over the counted
// leaves with the list's own conditions (records/filters.ts), so the cards count what the list shows.
// It answers total, distinct, by_project and fields with filtered: true; the by_ counts are empty and
// categories carry no by_value.

interface LeafField {
  project_key: string;
  key: string;
  type: string;
  filterable: boolean;
  searchable: boolean;
}

/**
 * The fields every counted leaf has public and active with the same type; only those filter, search
 * or count. A key that is private, archived or typed differently in any leaf is left out, so it can't
 * narrow or count a sibling's values.
 */
function sharedFields(leaves: string[], rows: LeafField[]) {
  const byKey = new Map<string, LeafField[]>();
  for (const row of rows) {
    const defs = byKey.get(row.key);
    if (defs) defs.push(row);
    else byKey.set(row.key, [row]);
  }
  const shared = [...byKey.values()].filter((defs) => defs.length === leaves.length && defs.every((d) => d.type === defs[0]!.type));
  const fields: FilterFields = {
    filterable: new Map(shared.filter((defs) => defs.every((d) => d.filterable)).map((defs) => [defs[0]!.key, defs[0]!.type])),
    searchable: shared.filter((defs) => defs.every((d) => d.searchable)).map((defs) => defs[0]!.key),
  };
  const counted = shared
    .map((defs) => ({ key: defs[0]!.key, type: defs[0]!.type }))
    .filter((f) => f.type === 'money' || f.type === 'number' || f.type === 'category')
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  return { fields, counted };
}

/**
 * Filtered stats, or null when the project doesn't exist or the viewer may not see it. A visitor
 * counts only published leaves. The query runs under a short statement timeout, since anyone may
 * call it.
 */
export async function filteredProjectStats(
  sql: Sql,
  key: string,
  viewer: Viewer,
  query: BaseFilters,
  filters: Map<string, string>,
): Promise<object | null> {
  return (await sql.begin(async (tx) => {
    await tx`set local statement_timeout = '2s'`;
    const [project] = await tx<{ leaves: string[] }[]>`
      select public.housing_project_counted_leaves(key, ${!viewer.admin}) as leaves
      from public.housing_projects
      where key = ${key} and (${viewer.admin} or key = any(public.housing_public_project_keys()))`;
    if (!project) return null;
    const { leaves } = project;
    const rows = leaves.length
      ? await tx<LeafField[]>`
      select project_key, key, type, filterable, searchable from public.housing_project_fields
      where project_key = any(${leaves}) and visibility = 'public' and is_active`
      : [];
    const { fields, counted } = sharedFields(leaves, rows);

    const where = [tx`b.project_type = any(${leaves})`, ...recordFilters(tx, fields, filters, query)].reduce(
      (all, condition) => tx`${all} and ${condition}`,
    );
    // Field keys and types are bound as values, never spliced into the SQL. Sums take JSON numbers
    // only, and category distinct compares bytes, as housing_project_stats does (0016_project_stats.sql).
    const fieldStats = counted.map(({ key: k, type }) =>
      type === 'category'
        ? tx`${k}::text, jsonb_build_object('type', 'category', 'distinct',
            (select count(distinct (extra ->> ${k}::text) collate "C") from base
              where jsonb_typeof(extra -> ${k}::text) = 'string' and extra ->> ${k}::text <> ''))`
        : tx`${k}::text, (select jsonb_build_object('type', ${type}::text, 'sum', coalesce(sum((extra ->> ${k}::text)::numeric), 0), 'count', count(*))
            from base where jsonb_typeof(extra -> ${k}::text) = 'number')`,
    );
    // jsonb_build_object takes at most 100 arguments; the field guard caps a project at 40 fields (80).
    const fieldsObject = fieldStats.length
      ? tx`jsonb_build_object(${fieldStats.reduce((all, one) => tx`${all}, ${one}`)})`
      : tx`'{}'::jsonb`;

    const [row] = await tx<{ s: object }[]>`
      with base as (
        select b.project_type, b.division, b.district, b.upazila, b.union_name, b.extra
        from public.housing_beneficiaries b where ${where}
      )
      select jsonb_build_object(
        'total', (select count(*) from base),
        'by_year', '{}'::jsonb, 'by_division', '{}'::jsonb, 'by_district', '{}'::jsonb,
        'by_upazila', '{}'::jsonb, 'by_location', '{}'::jsonb, 'by_union', '{}'::jsonb,
        'distinct', jsonb_build_object(
          'divisions', (select count(distinct division collate "C") from base),
          'districts', (select count(distinct district collate "C") from base),
          'upazilas',  (select count(*) from (select distinct district collate "C", upazila collate "C" from base) u),
          'unions',    (select count(*) from (select distinct district collate "C", upazila collate "C", union_name collate "C" from base where union_name <> '') u)
        ),
        'by_project', coalesce((
          select jsonb_object_agg(l, coalesce(c.n, 0))
            from unnest(${leaves}::text[]) as l
            left join (select project_type, count(*) as n from base group by project_type) c on c.project_type = l
        ), '{}'::jsonb),
        'fields', ${fieldsObject},
        'filtered', true
      ) as s`;
    return row?.s ?? null;
  })) as object | null;
}
