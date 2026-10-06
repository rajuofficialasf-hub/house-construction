// Proves the import is exact (docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md, roadmap R16):
// the same queries run on Supabase and on this database, and every difference fails a named check.
// Rows are compared by an md5 of each row's to_jsonb text, keyed by id, so a failure names the
// differing ids and never prints a value.
import { setTimeout as sleep } from 'node:timers/promises';
import type { Sql } from '../db.js';
import type { ImportReport } from './report.js';
import { readOnly, URL_COLUMNS, type UrlColumn } from './source.js';

export interface Check {
  name: string;
  ok: boolean;
  /** Counts or ids only. */
  detail: string;
}

export interface PhotoCheckOptions {
  /** The origin to request photos from instead of PUBLIC_API_URL (the API on loopback, or the public site). */
  via?: string;
  publicApiUrl: string;
  fetch?: typeof fetch;
  concurrency?: number;
}

type Reader = <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;

const UNIMPORTED_EMAIL = /^invalid\+[0-9a-f-]+@import\.invalid$/;

/** Every row's md5, by id, leaving out the given columns. */
async function rowHashes(tx: Sql, table: string, without: readonly string[] = []): Promise<Map<string, string>> {
  const rows = await tx<{ id: string; h: string }[]>`
    select t.id::text as id, md5((to_jsonb(t) - ${without as string[]}::text[])::text) as h from ${tx(`public.${table}`)} t`;
  return new Map(rows.map((r) => [r.id, r.h]));
}

/** Up to ten ids, so a long list stays readable. */
const listIds = (ids: readonly string[]) => `${ids.slice(0, 10).join(', ')}${ids.length > 10 ? ', …' : ''}`;

function compareRows(name: string, source: Map<string, string>, target: Map<string, string>): Check {
  const missing = [...source.keys()].filter((id) => !target.has(id));
  const extra = [...target.keys()].filter((id) => !source.has(id));
  const changed = [...source.keys()].filter((id) => target.has(id) && target.get(id) !== source.get(id));
  const show = (label: string, ids: string[]) => (ids.length ? `${label} ${ids.length}: ${listIds(ids)}` : '');
  const problems = [show('missing', missing), show('extra', extra), show('different', changed)].filter(Boolean);
  return { name, ok: problems.length === 0, detail: problems.length ? problems.join('; ') : `${source.size} rows` };
}

const same = (name: string, source: unknown, target: unknown): Check => {
  const a = JSON.stringify(source);
  const b = JSON.stringify(target);
  return { name, ok: a === b, detail: a === b ? a : `source ${a}, target ${b}` };
};

interface Side {
  projects: { project_type: string; n: number; max: number }[];
  counters: { project_type: string; last_serial: number }[];
  above: string[];
  serialChanges: Map<string, string>;
  serialChangesMax: string | null;
  activity: Map<string, string>;
  activityMax: string | null;
  actions: { action: string; n: number }[];
  records: Map<string, string>;
  slots: Record<UrlColumn, number>;
}

async function readSide(tx: Sql): Promise<Side> {
  const [projects, counters, above, serialChanges, [scMax], activity, [acMax], actions, records, [slots]] = await Promise.all([
    tx<Side['projects']>`select project_type, count(*)::int as n, max(serial_no) as max from public.housing_beneficiaries group by 1 order by 1`,
    tx<Side['counters']>`select project_type, last_serial from public.housing_serial_counters order by 1`,
    tx<{ project_type: string }[]>`
      select b.project_type from public.housing_beneficiaries b join public.housing_serial_counters c using (project_type)
      group by b.project_type, c.last_serial having max(b.serial_no) > c.last_serial order by 1`,
    rowHashes(tx, 'housing_serial_changes'),
    tx<{ max: string | null }[]>`select max(id)::text as max from public.housing_serial_changes`,
    rowHashes(tx, 'housing_activity_log'),
    tx<{ max: string | null }[]>`select max(id)::text as max from public.housing_activity_log`,
    tx<Side['actions']>`select action, count(*)::int as n from public.housing_activity_log group by 1 order by 1`,
    rowHashes(tx, 'housing_beneficiaries', URL_COLUMNS),
    tx<Record<UrlColumn, number>[]>`
      select count(prev_photo_url)::int as prev_photo_url, count(prev_thumb_url)::int as prev_thumb_url,
             count(current_photo_url)::int as current_photo_url, count(current_thumb_url)::int as current_thumb_url
      from public.housing_beneficiaries`,
  ]);
  return {
    projects,
    counters,
    above: above.map((r) => r.project_type),
    serialChanges,
    serialChangesMax: scMax!.max,
    activity,
    activityMax: acMax!.max,
    actions,
    records,
    slots: slots!,
  };
}

async function adminChecks(source: Sql, target: Sql): Promise<Check[]> {
  const [from, to] = await Promise.all([
    source<{ id: string; email: string; hash: string | null }[]>`
      select u.id, lower(trim(coalesce(u.email, ''))) as email, u.encrypted_password as hash
      from public.housing_admins a join auth.users u on u.id = a.user_id order by u.id`,
    target<{ id: string; email: string; hash: string; disabled: boolean }[]>`
      select id, email, password_hash as hash, disabled_at is not null as disabled from public.housing_admins order by id`,
  ]);
  const targetById = new Map(to.map((a) => [a.id, a]));
  const sourceIds = new Set(from.map((a) => a.id));
  const missing = from.filter((a) => !targetById.has(a.id)).map((a) => a.id);
  const extra = to.filter((a) => !sourceIds.has(a.id)).map((a) => a.id);
  const email = from
    .filter((a) => {
      const t = targetById.get(a.id);
      return t && t.email !== a.email && !UNIMPORTED_EMAIL.test(t.email);
    })
    .map((a) => a.id);
  // A hash that is now argon2id was replaced by a successful login with the imported one.
  const hash = from
    .filter((a) => {
      const t = targetById.get(a.id);
      return t && !t.disabled && t.hash !== a.hash && !t.hash.startsWith('$argon2id$');
    })
    .map((a) => a.id);
  return [
    {
      name: 'admins',
      ok: missing.length === 0 && extra.length === 0,
      detail: missing.length || extra.length ? `missing ${listIds(missing)}; extra ${listIds(extra)}` : `${from.length} admins`,
    },
    { name: 'admin emails', ok: email.length === 0, detail: email.length ? `different for ${listIds(email)}` : 'same' },
    { name: 'admin password hashes', ok: hash.length === 0, detail: hash.length ? `different for ${listIds(hash)}` : 'same' },
  ];
}

async function photoFileChecks(target: Sql): Promise<Check[]> {
  const [[orphanUrls], [counts]] = await Promise.all([
    target<{ n: number }[]>`
      select count(*)::int as n from public.housing_beneficiaries b
      cross join lateral (values ('prev', 'photo', b.prev_photo_url), ('prev', 'thumb', b.prev_thumb_url),
                                 ('current', 'photo', b.current_photo_url), ('current', 'thumb', b.current_thumb_url)) v(kind, variant, url)
      where v.url is not null and not exists (
        select 1 from public.housing_files f
        where f.record_id = b.id and f.kind = v.kind and f.variant = v.variant and f.deleted_at is null
          and v.url like '%/api/v1/photos/' || f.id::text)`,
    target<{ files: number; urls: number }[]>`
      select (select count(*)::int from public.housing_files where deleted_at is null) as files,
             (select (count(prev_photo_url) + count(prev_thumb_url) + count(current_photo_url) + count(current_thumb_url))::int
              from public.housing_beneficiaries) as urls`,
  ]);
  return [
    { name: 'photo URLs have a live file', ok: orphanUrls!.n === 0, detail: orphanUrls!.n ? `${orphanUrls!.n} without` : 'all' },
    { name: 'live files = photo URLs', ok: counts!.files === counts!.urls, detail: `${counts!.files} files, ${counts!.urls} URLs` },
  ];
}

/** GETs every photo URL in the target and expects 200 image/webp. */
async function photoHttpCheck(target: Sql, options: PhotoCheckOptions): Promise<Check> {
  const fetchFn = options.fetch ?? fetch;
  const rows = await target<{ id: string; url: string }[]>`
    select b.id, v.url from public.housing_beneficiaries b
    cross join lateral (values (b.prev_photo_url), (b.prev_thumb_url), (b.current_photo_url), (b.current_thumb_url)) v(url)
    where v.url is not null order by b.id`;
  const queue = rows.map((r) => ({
    ...r,
    url: options.via && r.url.startsWith(options.publicApiUrl) ? `${options.via}${r.url.slice(options.publicApiUrl.length)}` : r.url,
  }));
  const failed: string[] = [];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
          res = await fetchFn(item.url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
        } catch {
          failed.push(item.id);
          break;
        }
        // The photo route is rate-limited per IP; wait as told and ask again.
        if (res.status === 429 && attempt < 5) {
          await res.body?.cancel();
          const wait = Number(res.headers.get('retry-after') ?? '1');
          await sleep(Math.min(Number.isFinite(wait) ? wait : 1, 60) * 1000);
          continue;
        }
        const ok = res.status === 200 && res.headers.get('content-type') === 'image/webp';
        await res.arrayBuffer().catch(() => undefined);
        if (!ok) failed.push(item.id);
        break;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 4, queue.length) }, worker));
  const unique = [...new Set(failed)];
  return {
    name: 'photo URLs answer 200',
    ok: failed.length === 0,
    detail: failed.length ? `${failed.length} of ${rows.length} failed, records: ${listIds(unique)}` : `${rows.length} photos`,
  };
}

/**
 * Compares the source and the target and returns one check per rule. `report` (from the import)
 * explains photo gaps and generated thumbs; without it the photo count check is skipped.
 */
export async function verifyImport(source: Sql, target: Sql, report: ImportReport | undefined, photos?: PhotoCheckOptions): Promise<Check[]> {
  const reader =
    (sql: Sql): Reader =>
    (fn) =>
      readOnly(sql, (tx) => fn(tx as unknown as Sql));
  const readSource = reader(source);
  const readTarget = reader(target);
  const [s, t] = await Promise.all([readSource(readSide), readTarget(readSide)]);
  const checks: Check[] = [
    same('records per project', s.projects, t.projects),
    same('serial counters', s.counters, t.counters),
    { name: 'serials at or below their counter', ok: s.above.length === 0 && t.above.length === 0, detail: [...s.above, ...t.above].join(', ') || 'yes' },
    compareRows('records', s.records, t.records),
    same('serial changes max id', s.serialChangesMax, t.serialChangesMax),
    compareRows('serial changes', s.serialChanges, t.serialChanges),
    same('activity log max id', s.activityMax, t.activityMax),
    same('activity log per action', s.actions, t.actions),
    compareRows('activity log', s.activity, t.activity),
    ...(await adminChecks(source, target)),
    ...(await readTarget(photoFileChecks)),
  ];

  if (report) {
    const per = (list: { slot: UrlColumn }[], slot: UrlColumn) => list.filter((x) => x.slot === slot).length;
    const off = URL_COLUMNS.filter((slot) => s.slots[slot] + per(report.generated_thumbs, slot) !== t.slots[slot] + per(report.photo_gaps, slot));
    checks.push({
      name: 'photo slots (source + generated = target + gaps)',
      ok: off.length === 0,
      detail: off.length ? `off for ${off.join(', ')}` : JSON.stringify(t.slots),
    });
  } else {
    checks.push({ name: 'photo slots', ok: true, detail: 'skipped: no --report' });
  }
  if (photos) checks.push(await photoHttpCheck(target, photos));
  return checks;
}
