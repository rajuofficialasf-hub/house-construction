import type { HousingApi } from '../interfaces/housingApi'
import type { ImageStorage } from '../interfaces/imageStorage'
import {
  DEFAULT_PAGE_SIZE,
  HousingApiError,
  MAX_PAGE_SIZE,
  type ActivityEntry,
  type BulkInsertResult,
  type FilterOptions,
  type HousingRecord,
  type HousingStats,
  type ListParams,
  type Page,
  type PhotoKind,
  type ProjectType,
} from '../interfaces/types'
import { photoPath } from '../../utils/imagePath'
import { TABLE, type GetClient } from './client'
import { mapSupabaseError } from './errors'
import { assertAdmin } from './session'

const BULK_CHUNK = 200
const IN_CHUNK = 100

export interface SupabaseHousingApiOptions {
  /**
   * true হলে ক্লায়েন্ট-সাইড এডমিন যাচাই (assertAdmin) বাদ — শুধু service_role ক্লায়েন্ট দিয়ে চলা
   * বিশ্বস্ত সার্ভার/স্ক্রিপ্টে (scripts/migrate-photos.mjs)। ব্রাউজারে কখনো true নয়।
   */
  trustedServer?: boolean
}

/** বাংলা তুলনার জন্য NFC (ড়/ঢ়/য় এর দুই রূপ এক করা) + trim */
function nfc(s: string): string {
  return s.trim().normalize('NFC')
}

/** PostgREST `or()` ফিল্টারে বিশেষ অক্ষর (, ( ) %) সমস্যা করে, তাই বাদ */
function sanitizeSearch(q: string): string {
  return nfc(q).replace(/[,()%\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

function pageOf(data: HousingRecord[], page: number, pageSize: number, total: number): Page<HousingRecord> {
  return {
    data,
    meta: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) },
  }
}

function emptyStats(): HousingStats {
  return {
    total: 0,
    by_year: {},
    by_division: {},
    by_district: {},
    by_upazila: {},
    distinct: { divisions: 0, districts: 0, upazilas: 0 },
    by_location: {},
  }
}

export function createSupabaseHousingApi(
  getClient: GetClient,
  storage: ImageStorage,
  options: SupabaseHousingApiOptions = {},
): HousingApi {
  const table = () => getClient().from(TABLE)
  const guard = async () => {
    if (!options.trustedServer) await assertAdmin(getClient)
  }

  async function fetchOne(build: (q: ReturnType<typeof table>) => PromiseLike<{ data: unknown; error: unknown }>) {
    const { data, error } = await build(table())
    if (error) throw mapSupabaseError(error)
    if (!data) throw new HousingApiError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি')
    return data as HousingRecord
  }

  const api: HousingApi = {
    async list(params: ListParams) {
      const page = Math.max(1, Math.floor(params.page ?? 1))
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.page_size ?? DEFAULT_PAGE_SIZE)))
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = table().select('*', { count: 'exact' })
      if (params.project_type) query = query.eq('project_type', params.project_type)
      if (params.serial_no !== undefined) query = query.eq('serial_no', params.serial_no)
      if (params.year !== undefined) query = query.eq('year', params.year)
      if (params.division) query = query.eq('division', nfc(params.division))
      if (params.district) query = query.eq('district', nfc(params.district))
      if (params.upazila) query = query.eq('upazila', nfc(params.upazila))
      const q = params.q ? sanitizeSearch(params.q) : ''
      if (q) {
        const like = `%${q}%`
        query = query.or(
          `name.ilike.${like},father_or_husband_name.ilike.${like},address.ilike.${like}`,
        )
      }
      const sort = params.sort ?? 'serial_no'
      const ascending = (params.order ?? 'asc') === 'asc'
      query = query.order(sort, { ascending }).range(from, to)
      if (sort !== 'serial_no') query = query.order('serial_no', { ascending: true })

      const { data, error, count } = await query
      if (error) throw mapSupabaseError(error)
      return pageOf((data ?? []) as HousingRecord[], page, pageSize, count ?? 0)
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
        out.push(...((data ?? []) as HousingRecord[]))
      }
      return out
    },

    async create(input) {
      await guard()
      // serial_no undefined হলে কলামটি পাঠানো হয় না → ট্রিগার বরাদ্দ করে
      const { serial_no, ...rest } = input
      const row = serial_no ? { ...rest, serial_no } : rest
      const { data, error } = await table().insert(row).select('*').single()
      if (error) throw mapSupabaseError(error)
      return data as HousingRecord
    },

    async update(id, patch) {
      await guard()
      const { data, error } = await table().update(patch).eq('id', id).select('*').maybeSingle()
      if (error) throw mapSupabaseError(error)
      if (!data) throw new HousingApiError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি')
      return data as HousingRecord
    },

    async delete(id) {
      await guard()
      const record = await api.getById(id)
      const { data, error } = await table().delete().eq('id', id).select('id')
      if (error) throw mapSupabaseError(error)
      if (!data || data.length === 0) throw new HousingApiError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি')
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
        const chunk = rows.slice(start, start + BULK_CHUNK).map((r) => {
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
        const chunk = input.rows.slice(start, start + BULK_CHUNK)
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

    async stats(projectType?: ProjectType) {
      const { data, error } = await getClient().rpc('housing_stats', {
        p_project_type: projectType ?? null,
      })
      if (error) throw mapSupabaseError(error)
      const raw = (data ?? {}) as Partial<HousingStats>
      const empty = emptyStats()
      return { ...empty, ...raw, distinct: { ...empty.distinct, ...(raw.distinct ?? {}) } }
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
      }
    },

    async uploadPhoto(id, kind: PhotoKind, files) {
      await guard()
      const record = await api.getById(id)
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
      return data as HousingRecord
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
      let record = data as HousingRecord
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
        record = upd.data as HousingRecord
      }
      return record
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
      return pageOf((data ?? []) as unknown as HousingRecord[], page, pageSize, count ?? 0) as unknown as Page<ActivityEntry>
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
      return data as HousingRecord
    },
  }

  return api
}
