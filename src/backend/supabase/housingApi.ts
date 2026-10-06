import type { HousingApi } from '../interfaces/housingApi'
import type { ImageStorage } from '../interfaces/imageStorage'
import type { ProjectsApi } from '../interfaces/projectsApi'
import {
  DEFAULT_PAGE_SIZE,
  HousingApiError,
  MAX_PAGE_SIZE,
  type ActivityEntry,
  type BulkInsertResult,
  type ExtraValues,
  type FilterOptions,
  type HousingRecord,
  type ListParams,
  type Page,
  type PhotoKind,
  type Project,
  type ProjectField,
  type ProjectType,
} from '../interfaces/types'
import { photoPath } from '../../features/housing/utils/imagePath'
import { TABLE, type GetClient } from './client'
import { mapSupabaseError } from './errors'
import { isKnownMissing, isMissingError, legacyWriteError, markMissing } from './legacy'
import { createSupabaseProjectsApi } from './projectsApi'
import { assertAdmin } from './session'
import { LEGACY_GROUP_KEY, fetchProjectStats } from './stats'

const BULK_CHUNK = 200
const IN_CHUNK = 100
const PRIVATE_TABLE = 'beneficiary_private'

export interface SupabaseHousingApiOptions {
  /**
   * true হলে ক্লায়েন্ট-সাইড এডমিন যাচাই (assertAdmin) বাদ — শুধু service_role ক্লায়েন্ট দিয়ে চলা
   * বিশ্বস্ত সার্ভার/স্ক্রিপ্টে (scripts/migrate-photos.mjs)। ব্রাউজারে কখনো true নয়।
   */
  trustedServer?: boolean
  /** প্রকল্পের সেটিং (ফিল্টার whitelist, লেখার payload, ছবি-মোড) — না দিলে একই ক্লায়েন্টে নিজে তৈরি করে */
  projects?: ProjectsApi
}

/** বাংলা তুলনার জন্য NFC (ড়/ঢ়/য় এর দুই রূপ এক করা) + trim */
function nfc(s: string): string {
  return s.trim().normalize('NFC')
}

/** PostgREST `or()` ফিল্টারে বিশেষ অক্ষর (, ( ) %) সমস্যা করে, তাই বাদ */
function sanitizeSearch(q: string): string {
  return nfc(q).replace(/[,()%\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** কাস্টম ফিল্ডের ফিল্টার-মান: NFC, একাধিক ফাঁকা → এক, ≤ ১০০ অক্ষর (ক্যাটাগরির সার্ভার-নিয়মের সমান) */
function sanitizeValue(v: string): string {
  return nfc(v).replace(/\s+/g, ' ').slice(0, 100)
}

/** পুরনো ডাটাবেসের সারিতে নতুন কলাম থাকে না — খালি মান বসানো, যাতে UI সবসময় একই শেপ পায় */
function normalizeRecord(row: unknown): HousingRecord {
  const r = row as HousingRecord
  return { ...r, union_name: r.union_name ?? '', extra: r.extra ?? {} }
}

function pageOf<T>(data: T[], page: number, pageSize: number, total: number): Page<T> {
  return {
    data,
    meta: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) },
  }
}

const publicFields = (p: Project | null): ProjectField[] =>
  (p?.fields ?? []).filter((f) => f.visibility === 'public' && f.is_active)

/** লেখার payload এ যে কী-গুলো পুরনো ডাটাবেসে বা প্রকল্প ব্যবহার না করলে বাদ পড়ে */
interface NewColumns {
  union_name?: string
  extra?: ExtraValues
  _clear?: string[]
}

export function createSupabaseHousingApi(
  getClient: GetClient,
  storage: ImageStorage,
  options: SupabaseHousingApiOptions = {},
): HousingApi {
  const table = () => getClient().from(TABLE)
  const projects = options.projects ?? createSupabaseProjectsApi(getClient, { trustedServer: options.trustedServer })
  const guard = async () => {
    if (!options.trustedServer) await assertAdmin(getClient)
  }

  /** প্রকল্পের সেটিং; না পেলে (গ্রুপ-key, অচেনা, খসড়া ও anon) null — তখন কোনো নিয়ম চাপানো হয় না */
  async function projectOf(key: ProjectType | undefined): Promise<Project | null> {
    if (!key) return null
    try {
      return await projects.get(key)
    } catch (err) {
      if (HousingApiError.is(err) && err.code === 'NOT_FOUND') return null
      throw err
    }
  }

  /**
   * লেখার payload এর নিয়ম (পরিকল্পনা §৫.১৪): union_name শুধু ইউনিয়ন-স্তরের প্রকল্পে, extra শুধু কাস্টম ফিল্ড থাকলে;
   * পুরনো ডাটাবেসে (কলামই নেই) দুটোই সবসময় বাদ — তাই ঘর নির্মাণে লেখা আগের মতোই চলে।
   */
  async function shapeWrite<T extends NewColumns>(row: T, projectKey: ProjectType | undefined): Promise<T> {
    if (row.union_name === undefined && row.extra === undefined && row._clear === undefined) return row
    const project = await projectOf(projectKey) // এর ভেতরেই পুরনো ডাটাবেস চেনা হয়
    const out = { ...row }
    if (isKnownMissing('projects')) {
      delete out.union_name
      delete out.extra
      if (out._clear) out._clear = out._clear.filter((k) => k !== 'union_name' && !k.startsWith('extra.'))
      return out
    }
    if (project) {
      if (project.geo_depth !== 'union') delete out.union_name
      // কাস্টম ফিল্ড না থাকলে extra বাদ (পুরনো আচরণ); গোপন-ফিল্ডের মান বাল্ক-আপডেটে extra দিয়েই যায় (RPC আলাদা করে) — M-ধাপ ১১
      if (!project.fields.some((f) => f.is_active)) delete out.extra
    }
    if (out.union_name !== undefined) out.union_name = nfc(out.union_name)
    return out
  }

  async function fetchOne(build: (q: ReturnType<typeof table>) => PromiseLike<{ data: unknown; error: unknown }>) {
    const { data, error } = await build(table())
    if (error) throw mapSupabaseError(error)
    if (!data) throw new HousingApiError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি')
    return normalizeRecord(data)
  }

  /** প্রকল্পের ছবি-মোড: আপলোডের আগেই আটকানো (ডাটাবেস-ট্রিগারও আটকায়, কিন্তু তখন ফাইল অনাথ থাকত) */
  async function assertPhotoAllowed(projectKey: ProjectType, kind: PhotoKind) {
    const project = await projectOf(projectKey)
    if (!project) return
    if (project.photo_mode === 'none') {
      throw new HousingApiError('VALIDATION_ERROR', 'এই প্রকল্পে ছবি নেই', { field: `${kind}_photo_url` })
    }
    if (project.photo_mode === 'after_only' && kind === 'prev') {
      throw new HousingApiError('VALIDATION_ERROR', 'এই প্রকল্পে শুধু বর্তমান ছবি রাখা হয় — পূর্বের ছবি নয়', {
        field: 'prev_photo_url',
      })
    }
  }

  const api: HousingApi = {
    async list(params: ListParams) {
      const page = Math.max(1, Math.floor(params.page ?? 1))
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.page_size ?? DEFAULT_PAGE_SIZE)))
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      // কাস্টম ফিল্টার/সার্চ/সাজানো লাগলে প্রকল্পের ফিল্ড-তালিকা দিয়ে whitelist (না লাগলে বাড়তি কল নয়)
      const fieldFilters = Object.entries(params.fields ?? {}).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
      const needsProject =
        fieldFilters.length > 0 || !!params.q?.trim() || (params.sort ?? '').startsWith('extra.') || !!params.union_name
      const project = needsProject ? await projectOf(params.project_type) : null
      const legacy = isKnownMissing('projects')
      const pub = legacy ? [] : publicFields(project)

      let query = table().select('*', { count: 'exact' })
      if (params.project_type) query = query.eq('project_type', params.project_type)
      if (params.serial_no !== undefined) query = query.eq('serial_no', params.serial_no)
      if (params.year !== undefined) query = query.eq('year', params.year)
      if (params.division) query = query.eq('division', nfc(params.division))
      if (params.district) query = query.eq('district', nfc(params.district))
      if (params.upazila) query = query.eq('upazila', nfc(params.upazila))
      if (params.union_name && !legacy) query = query.eq('union_name', nfc(params.union_name))
      for (const [key, raw] of fieldFilters) {
        const def = pub.find((f) => f.key === key && f.filterable)
        if (!def) continue // whitelist: অচেনা/গোপন/ফিল্টার-বন্ধ key নীরবে বাদ
        if (def.type === 'money' || def.type === 'number') {
          const n = Number(raw)
          if (Number.isFinite(n)) query = query.contains('extra', { [key]: n })
        } else {
          query = query.contains('extra', { [key]: sanitizeValue(raw) })
        }
      }
      const q = params.q ? sanitizeSearch(params.q) : ''
      if (q) {
        const like = `%${q}%`
        const extraCols = pub.filter((f) => f.searchable).map((f) => `extra->>${f.key}.ilike.${like}`)
        query = query.or(
          [`name.ilike.${like}`, `father_or_husband_name.ilike.${like}`, `address.ilike.${like}`, ...extraCols].join(','),
        )
      }
      let sort: string = 'serial_no'
      if (params.sort?.startsWith('extra.')) {
        const key = params.sort.slice('extra.'.length)
        if (pub.some((f) => f.key === key)) sort = `extra->${key}`
      } else if (params.sort === 'union_name') {
        if (!legacy) sort = 'union_name'
      } else if (params.sort) {
        sort = params.sort
      }
      const ascending = (params.order ?? 'asc') === 'asc'
      query = query.order(sort, { ascending }).range(from, to)
      if (sort !== 'serial_no') query = query.order('serial_no', { ascending: true })

      const { data, error, count } = await query
      if (error) {
        // union_name কলাম নেই (পুরনো ডাটাবেস, কিন্তু এখনো চেনা হয়নি): মনে রেখে ফিল্টার ছাড়া আবার
        if (isMissingError(error) && params.union_name && !legacy) {
          markMissing('projects')
          return api.list({ ...params, union_name: undefined })
        }
        throw mapSupabaseError(error)
      }
      return pageOf((data ?? []).map(normalizeRecord), page, pageSize, count ?? 0)
    },

    getById(id) {
      return fetchOne((q) => q.select('*').eq('id', id).maybeSingle())
    },

    getBySerial(projectType, serialNo) {
      return fetchOne((q) =>
        q.select('*').eq('project_type', projectType).eq('serial_no', serialNo).maybeSingle(),
      )
    },

    async getBySerials(projectType, serialNos) {
      const unique = [...new Set(serialNos.filter((n) => Number.isInteger(n) && n >= 1))]
      const out: HousingRecord[] = []
      for (let i = 0; i < unique.length; i += IN_CHUNK) {
        const chunk = unique.slice(i, i + IN_CHUNK)
        const { data, error } = await table()
          .select('*')
          .eq('project_type', projectType)
          .in('serial_no', chunk)
          .order('serial_no', { ascending: true })
        if (error) throw mapSupabaseError(error)
        out.push(...(data ?? []).map(normalizeRecord))
      }
      return out
    },

    async create(input) {
      await guard()
      // serial_no undefined হলে কলামটি পাঠানো হয় না → ট্রিগার বরাদ্দ করে
      const { serial_no, ...rest } = await shapeWrite(input, input.project_type)
      const row = serial_no ? { ...rest, serial_no } : rest
      const { data, error } = await table().insert(row).select('*').single()
      if (error) throw mapSupabaseError(error)
      return normalizeRecord(data)
    },

    async update(id, patch) {
      await guard()
      // নতুন কলাম থাকলে প্রকল্প জানতে রেকর্ডটি পড়া লাগে; না থাকলে বাড়তি কল নয়
      const needsProject = patch.union_name !== undefined || patch.extra !== undefined
      const shaped = needsProject ? await shapeWrite(patch, (await api.getById(id)).project_type) : patch
      const { data, error } = await table().update(shaped).eq('id', id).select('*').maybeSingle()
      if (error) throw mapSupabaseError(error)
      if (!data) throw new HousingApiError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি')
      return normalizeRecord(data)
    },

    async delete(id) {
      await guard()
      const record = await api.getById(id)
      const { data, error } = await table().delete().eq('id', id).select('id')
      if (error) throw mapSupabaseError(error)
      // রেকর্ডটি একটু আগেই পড়া গেছে, তবু ০ সারি মুছলে কারণ RLS: মোছা শুধু মূল এডমিনের (পর্ব ২)
      if (!data || data.length === 0) throw new HousingApiError('FORBIDDEN', 'শুধু মূল এডমিন রেকর্ড মুছতে পারেন')
      // সিরিয়াল পুনঃব্যবহার হয় না, তাই ছবিগুলো অনাথ হয়ে থাকত; মুছে দেওয়া হয়
      const paths = [
        record.prev_photo_url,
        record.prev_thumb_url,
        record.current_photo_url,
        record.current_thumb_url,
      ]
        .map((u) => (u ? storage.pathFromUrl(u) : null))
        .filter((p): p is string => !!p)
      if (paths.length) await storage.delete(paths)
    },

    async bulkInsert(input) {
      await guard()
      const { project_type, mode, rows } = input
      if (mode === 'use_given_serial') {
        const missing = rows.findIndex((r) => !Number.isInteger(r.serial_no) || (r.serial_no ?? 0) < 1)
        if (missing !== -1) {
          throw new HousingApiError('VALIDATION_ERROR', `সারি ${missing + 1}: serial_no নেই বা অবৈধ`, {
            row_index: missing,
          })
        }
        const seen = new Set<number>()
        for (const [i, r] of rows.entries()) {
          if (seen.has(r.serial_no!)) {
            throw new HousingApiError('VALIDATION_ERROR', `সারি ${i + 1}: serial_no ${r.serial_no} ডুপ্লিকেট`, {
              row_index: i,
            })
          }
          seen.add(r.serial_no!)
        }
      }

      const result: BulkInsertResult = { inserted: 0, failed: [] }
      for (let start = 0; start < rows.length; start += BULK_CHUNK) {
        const shaped = await Promise.all(rows.slice(start, start + BULK_CHUNK).map((r) => shapeWrite(r, project_type)))
        const chunk = shaped.map((r) => {
          const { serial_no, ...rest } = r
          return {
            ...rest,
            project_type,
            // assign_serial মোডে serial_no পাঠানো হয় না; DB ট্রিগার বরাদ্দ করে
            ...(mode === 'use_given_serial' ? { serial_no } : {}),
          }
        })
        const { error, count } = await table().insert(chunk, { count: 'exact' })
        if (error) {
          const mapped = mapSupabaseError(error)
          result.failed.push({
            row_index: start,
            error: { code: mapped.code, message: `সারি ${start + 1}–${start + chunk.length}: ${mapped.message}`, details: mapped.details },
          })
          break // একটি চাঙ্ক ব্যর্থ হলে থামি; আগের চাঙ্কগুলো ইতিমধ্যে সংরক্ষিত
        }
        result.inserted += count ?? chunk.length
      }
      return result
    },

    async bulkUpdateBySerial(input) {
      await guard()
      const result = { updated: 0, missing: [] as number[] }
      for (let start = 0; start < input.rows.length; start += BULK_CHUNK) {
        const chunk = await Promise.all(
          input.rows.slice(start, start + BULK_CHUNK).map((r) => shapeWrite(r, input.project_type)),
        )
        const { data, error } = await getClient().rpc('housing_bulk_update_by_serial', {
          p_project_type: input.project_type,
          p_rows: chunk,
        })
        if (error) throw mapSupabaseError(error)
        const r = (data ?? {}) as { updated?: number; missing?: number[] }
        result.updated += r.updated ?? 0
        result.missing.push(...(r.missing ?? []))
      }
      return result
    },

    stats(projectType, opts = {}) {
      return fetchProjectStats(getClient, projectType ?? LEGACY_GROUP_KEY, !!opts.light)
    },

    async years(projectType?: ProjectType) {
      const { data, error } = await getClient().rpc('housing_years', {
        p_project_type: projectType ?? null,
      })
      if (error) throw mapSupabaseError(error)
      return ((data ?? []) as { year: number }[]).map((r) => r.year)
    },

    async filterOptions(projectType?: ProjectType): Promise<FilterOptions> {
      const [years, stats] = await Promise.all([api.years(projectType), api.stats(projectType)])
      const keys = (o: Record<string, number>) => Object.keys(o).sort((a, b) => a.localeCompare(b, 'bn'))
      return {
        years,
        divisions: keys(stats.by_division),
        districts: keys(stats.by_district),
        upazilas: keys(stats.by_upazila),
        unions: keys(stats.by_union),
      }
    },

    async uploadPhoto(id, kind: PhotoKind, files) {
      await guard()
      const record = await api.getById(id)
      await assertPhotoAllowed(record.project_type, kind)
      const base = { project_type: record.project_type, serial_no: record.serial_no, kind }
      const full = await storage.upload(files.photo, { ...base, variant: 'full' })
      const thumb = await storage.upload(files.thumb, { ...base, variant: 'thumb' })

      // পুরনো ফরম্যাটের পাথ (ভিন্ন এক্সটেনশন/ফোল্ডার) থাকলে অনাথ ফাইল মুছি; একই পাথ হলে ওভাররাইট হয়েই গেছে
      const oldPaths = [record[`${kind}_photo_url`], record[`${kind}_thumb_url`]]
        .map((u) => (u ? storage.pathFromUrl(u) : null))
        .filter((p): p is string => !!p && p !== full.path && p !== thumb.path)
      if (oldPaths.length) await storage.delete(oldPaths)

      const patch = {
        [`${kind}_photo_url`]: full.url,
        [`${kind}_thumb_url`]: thumb.url,
        photo_updated_at: new Date().toISOString(),
      }
      const { data, error } = await table().update(patch).eq('id', id).select('*').single()
      if (error) throw mapSupabaseError(error)
      return normalizeRecord(data)
    },

    async nextSerial(projectType) {
      const { data, error } = await getClient().rpc('housing_next_serial', { p_project_type: projectType })
      if (error) throw mapSupabaseError(error)
      return Number(data ?? 1)
    },

    async changeSerial(id, newSerialNo) {
      await guard()
      const before = await api.getById(id)
      if (before.serial_no === newSerialNo) return before
      // ১) ডাটাবেসে সিরিয়াল বদল (RPC: এডমিন যাচাই, অনন্যতা, কাউন্টার)
      const { data, error } = await getClient().rpc('housing_change_serial', { p_id: id, p_new_serial: newSerialNo })
      if (error) throw mapSupabaseError(error)
      let record = normalizeRecord(data)
      // ২) ছবির ফাইল নতুন সিরিয়ালের পাথে সরানো ও url আপডেট (ফাইল না থাকলে সেই কলাম null)
      const patch: Record<string, string | null> = {}
      for (const kind of ['prev', 'current'] as const) {
        for (const [col, variant] of [
          [`${kind}_photo_url`, 'full'],
          [`${kind}_thumb_url`, 'thumb'],
        ] as const) {
          const oldUrl = before[col]
          if (!oldUrl) continue
          const oldPath = storage.pathFromUrl(oldUrl)
          const newPath = photoPath(record.project_type, newSerialNo, kind, variant)
          if (!oldPath || oldPath === newPath) continue
          try {
            const moved = await storage.move(oldPath, newPath)
            patch[col] = moved.url
          } catch (err) {
            if (HousingApiError.is(err) && err.code === 'NOT_FOUND') patch[col] = null
            else throw err
          }
        }
      }
      if (Object.keys(patch).length) {
        const upd = await table().update({ ...patch, photo_updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
        if (upd.error) throw mapSupabaseError(upd.error)
        record = normalizeRecord(upd.data)
      }
      return record
    },

    async getPrivate(id) {
      await guard()
      if (isKnownMissing('projects')) return {}
      const { data, error } = await getClient().from(PRIVATE_TABLE).select('data').eq('record_id', id).maybeSingle()
      if (error) {
        if (isMissingError(error)) {
          markMissing('projects')
          return {}
        }
        throw mapSupabaseError(error)
      }
      return ((data as { data?: ExtraValues } | null)?.data ?? {}) as ExtraValues
    },

    async setPrivate(id, values) {
      await guard()
      if (isKnownMissing('projects')) throw legacyWriteError()
      const { data, error } = await getClient()
        .from(PRIVATE_TABLE)
        .upsert({ record_id: id, data: values }, { onConflict: 'record_id' })
        .select('data')
        .single()
      if (error) {
        if (isMissingError(error)) throw legacyWriteError()
        throw mapSupabaseError(error)
      }
      // ডাটাবেস-ট্রিগার মান স্বাভাবিক করে (যেমন বাংলা অঙ্ক → ইংরেজি), তাই ফেরত মানই সঠিক
      return ((data as { data?: ExtraValues } | null)?.data ?? {}) as ExtraValues
    },

    // projectType: REST পাথের জন্য (/api/projects/:key/records/private); Supabase এ RLS-ই যথেষ্ট (beneficiary_private শুধু এডমিন পড়েন),
    // আর id গুলো ডাকার জায়গা এই প্রকল্পের তালিকা থেকেই নেয়
    async getPrivateMany(_projectType, ids) {
      await guard()
      if (isKnownMissing('projects') || ids.length === 0) return {}
      if (ids.length > MAX_PAGE_SIZE) throw new HousingApiError('VALIDATION_ERROR', `এক কলে সর্বোচ্চ ${MAX_PAGE_SIZE}টি রেকর্ড`)
      const { data, error } = await getClient().from(PRIVATE_TABLE).select('record_id, data').in('record_id', ids)
      if (error) {
        if (isMissingError(error)) {
          markMissing('projects')
          return {}
        }
        throw mapSupabaseError(error)
      }
      const out: Record<string, ExtraValues> = {}
      for (const row of (data ?? []) as { record_id: string; data: ExtraValues | null }[]) {
        if (row.data && Object.keys(row.data).length) out[row.record_id] = row.data
      }
      return out
    },

    async listActivity(params) {
      await guard()
      const page = Math.max(1, Math.floor(params.page ?? 1))
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.page_size ?? DEFAULT_PAGE_SIZE)))
      const from = (page - 1) * pageSize
      let q = getClient().from('housing_activity_log').select('*', { count: 'exact' })
      if (params.action) q = q.eq('action', params.action)
      if (params.project_type) q = q.eq('project_type', params.project_type)
      if (params.record_id) q = q.eq('record_id', params.record_id)
      if (params.actor_email) q = q.ilike('actor_email', `%${params.actor_email.replace(/[%,()]/g, '')}%`)
      if (params.from) q = q.gte('at', params.from)
      if (params.to) q = q.lte('at', params.to)
      const { data, error, count } = await q.order('at', { ascending: false }).order('id', { ascending: false }).range(from, from + pageSize - 1)
      if (error) throw mapSupabaseError(error)
      return pageOf((data ?? []) as ActivityEntry[], page, pageSize, count ?? 0)
    },

    async logActivity(action, details = {}, projectType) {
      // ব্যর্থতা নীরব: লগ লিখতে না পারলে মূল কাজ (লগইন/ইম্পোর্ট) আটকানো যাবে না
      try {
        await getClient().rpc('housing_log_event', {
          p_action: action,
          p_details: details,
          p_project_type: projectType ?? null,
        })
      } catch {
        /* উপেক্ষা */
      }
    },

    async deletePhoto(id, kind: PhotoKind) {
      await guard()
      const record = await api.getById(id)
      const paths = [record[`${kind}_photo_url`], record[`${kind}_thumb_url`]]
        .map((u) => (u ? storage.pathFromUrl(u) : null))
        .filter((p): p is string => !!p)
      if (paths.length) await storage.delete(paths)
      const patch = {
        [`${kind}_photo_url`]: null,
        [`${kind}_thumb_url`]: null,
        photo_updated_at: new Date().toISOString(),
      }
      const { data, error } = await table().update(patch).eq('id', id).select('*').single()
      if (error) throw mapSupabaseError(error)
      return normalizeRecord(data)
    },
  }

  return api
}
