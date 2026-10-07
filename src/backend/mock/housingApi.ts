import { hasStatsFilters } from '../statsFilters'
import type { HousingApi } from '../interfaces/housingApi'
import type { ImageStorage } from './storage'
import {
  DEFAULT_PAGE_SIZE,
  HousingApiError,
  MAX_PAGE_SIZE,
  type ActivityAction,
  type ActivityEntry,
  type BulkInsertResult,
  type FilterOptions,
  type HousingRecord,
  type HousingRecordInput,
  type HousingStats,
  type ListParams,
  type SortField,
  type Page,
  type PhotoKind,
  type ProjectType,
} from '../interfaces/types'
import { nfc } from '@/features/geo/geo'
import { photoPath } from '@/features/housing/utils/imagePath'
import { toProjectStats, GROUP_KEY, notInMock, recordProjectType } from './projectsApi'
import type { MockStore } from './store'

/** প্রকল্প-রেজিস্ট্রি ছাড়া মক: শুধু ঘর নির্মাণের দুই প্রকল্প (সার্ভারের মতো) */
const PROJECT_TYPES: readonly ProjectType[] = ['semi_pucca', 'tin']

const MAX_BULK = 500
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_THUMB_BYTES = 500 * 1024

const TEXT_LIMITS = { name: 200, father_or_husband_name: 200, division: 100, district: 100, upazila: 100, address: 1000 } as const
const SOURCE_LIMIT = 2000

function bad(message: string, field?: string, row_index?: number): never {
  throw new HousingApiError('VALIDATION_ERROR', message, { field, row_index })
}

function notFound(): never {
  throw new HousingApiError('NOT_FOUND', 'রেকর্ড পাওয়া যায়নি')
}

function pageOf<T>(data: T[], page: number, pageSize: number, total: number): Page<T> {
  return { data, meta: { page, page_size: pageSize, total, total_pages: Math.max(1, Math.ceil(total / pageSize)) } }
}

/** ৩.৩ এর ভ্যালিডেশন; partial = update/bulk-update (দেওয়া ফিল্ডই যাচাই হয়) */
function cleanFields(input: Partial<HousingRecordInput>, partial: boolean, rowIndex?: number) {
  const out: Partial<HousingRecord> = {}
  const need = (v: unknown, field: string) => {
    if (v === undefined || v === null) {
      if (!partial) bad(`${field} আবশ্যক`, field, rowIndex)
      return false
    }
    return true
  }
  if (need(input.year, 'year')) {
    const y = input.year as number
    if (!Number.isInteger(y) || y < 2000 || y > 2100) bad('year ২০০০–২১০০ এর মধ্যে হতে হবে', 'year', rowIndex)
    out.year = y
  }
  for (const f of ['name', 'division', 'district', 'upazila'] as const) {
    if (!need(input[f], f)) continue
    const v = nfc(input[f] as string)
    if (!v || v.length > TEXT_LIMITS[f]) bad(`${f} ১–${TEXT_LIMITS[f]} অক্ষর হতে হবে`, f, rowIndex)
    out[f] = v
  }
  for (const f of ['father_or_husband_name', 'address'] as const) {
    const v = input[f]
    if (v === undefined || v === null) continue
    const t = nfc(v)
    if (t.length > TEXT_LIMITS[f]) bad(`${f} সর্বোচ্চ ${TEXT_LIMITS[f]} অক্ষর`, f, rowIndex)
    out[f] = t
  }
  for (const f of ['prev_photo_source', 'current_photo_source'] as const) {
    const v = input[f]
    if (v === undefined) continue
    if (v !== null && (typeof v !== 'string' || v.length > SOURCE_LIMIT)) bad(`${f} অবৈধ`, f, rowIndex)
    out[f] = v
  }
  return out
}

export function createMockHousingApi(store: MockStore, storage: ImageStorage): HousingApi {
  const requireAdmin = (): { id: string; email: string } => {
    const s = store.session
    if (!s) throw new HousingApiError('UNAUTHENTICATED', 'এই কাজের জন্য লগইন করতে হবে')
    if (!s.isAdmin) throw new HousingApiError('FORBIDDEN', 'আপনার এডমিন অনুমতি নেই')
    return { id: s.user.id, email: s.user.email }
  }
  /** মোছা (রেকর্ড, ছবি) শুধু মূল এডমিন — Supabase অ্যাডাপ্টারের মতো */
  const requireMainAdmin = () => {
    const actor = requireAdmin()
    if (store.session?.user.role !== 'main_admin') throw new HousingApiError('FORBIDDEN', 'শুধু মূল এডমিন মুছতে পারেন')
    return actor
  }

  const find = (id: string) => store.records.find((r) => r.id === id)
  const findOrThrow = (id: string) => find(id) ?? notFound()
  const checkType = (t: unknown): ProjectType => {
    if (!PROJECT_TYPES.includes(t as ProjectType)) bad('project_type অবৈধ', 'project_type')
    return t as ProjectType
  }
  const clone = (r: HousingRecord): HousingRecord => ({ ...r })

  function log(action: ActivityAction, r: Pick<HousingRecord, 'project_type' | 'id' | 'serial_no' | 'name'> | null, details: Record<string, unknown>, actor: { id: string; email: string }, projectType?: ProjectType | null): void {
    store.activity.push({
      id: store.nextActivityId(),
      at: new Date().toISOString(),
      actor_id: actor.id,
      actor_email: actor.email,
      action,
      project_type: r?.project_type ?? projectType ?? null,
      record_id: r?.id ?? null,
      serial_no: r?.serial_no ?? null,
      record_name: r?.name ?? null,
      details,
    })
  }

  function summary(r: HousingRecord) {
    return { year: r.year, division: r.division, district: r.district, upazila: r.upazila }
  }

  /** আগে→পরে (09_activity_log.sql এর ট্রিগারের মতো) */
  function logUpdate(before: HousingRecord, after: HousingRecord, actor: { id: string; email: string }): void {
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    for (const f of ['serial_no', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila', 'address', 'prev_photo_source', 'current_photo_source'] as const) {
      if (before[f] !== after[f]) changes[f] = { old: before[f], new: after[f] }
    }
    const kinds: PhotoKind[] = []
    for (const k of ['prev', 'current'] as const) {
      if (before[`${k}_photo_url`] !== after[`${k}_photo_url`]) {
        kinds.push(k)
        changes[`${k}_photo`] = { old: before[`${k}_photo_url`] !== null, new: after[`${k}_photo_url`] !== null }
      }
    }
    if (!Object.keys(changes).length) return
    const onlyPhoto = Object.keys(changes).every((k) => k === 'prev_photo' || k === 'current_photo')
    const action = before.serial_no !== after.serial_no ? 'serial_change' : kinds.length && onlyPhoto ? 'photo_update' : 'update'
    log(action, after, { changes, photo_kinds: kinds }, actor)
  }

  function insertRecord(projectType: ProjectType, fields: Partial<HousingRecord>, serial: number | undefined, actor: { id: string; email: string }): HousingRecord {
    let serialNo: number
    if (serial === undefined) {
      serialNo = store.counters[projectType] + 1
    } else {
      if (!Number.isInteger(serial) || serial < 1) bad('serial_no ১ বা তার বেশি পূর্ণসংখ্যা হতে হবে', 'serial_no')
      if (store.records.some((r) => r.project_type === projectType && r.serial_no === serial)) {
        throw new HousingApiError('CONFLICT', `সিরিয়াল ${serial} আগে থেকেই আছে`)
      }
      serialNo = serial
    }
    store.counters[projectType] = Math.max(store.counters[projectType], serialNo)
    const now = new Date().toISOString()
    const rec: HousingRecord = {
      id: crypto.randomUUID(),
      project_type: projectType,
      serial_no: serialNo,
      year: fields.year as number,
      name: fields.name as string,
      father_or_husband_name: fields.father_or_husband_name ?? '',
      division: fields.division as string,
      district: fields.district as string,
      upazila: fields.upazila as string,
      address: fields.address ?? '',
      union_name: '',
      extra: {},
      prev_photo_url: null,
      prev_thumb_url: null,
      current_photo_url: null,
      current_thumb_url: null,
      prev_photo_source: fields.prev_photo_source ?? null,
      current_photo_source: fields.current_photo_source ?? null,
      photo_updated_at: null,
      created_at: now,
      updated_at: now,
    }
    store.records.push(rec)
    log('create', rec, { ...summary(rec), has_prev_photo: false, has_current_photo: false }, actor)
    return rec
  }

  const api: HousingApi = {
    async list(params: ListParams) {
      const page = Math.max(1, Math.floor(params.page ?? 1))
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.page_size ?? DEFAULT_PAGE_SIZE)))
      let rows = store.records.filter((r) => {
        const projectType = recordProjectType(params.project_type)
        if (projectType && r.project_type !== projectType) return false
        if (params.serial_no !== undefined && r.serial_no !== params.serial_no) return false
        if (params.year !== undefined && r.year !== params.year) return false
        if (params.division && r.division !== nfc(params.division)) return false
        if (params.district && r.district !== nfc(params.district)) return false
        if (params.upazila && r.upazila !== nfc(params.upazila)) return false
        return true
      })
      const q = params.q ? nfc(params.q).toLowerCase() : ''
      if (q) rows = rows.filter((r) => [r.name, r.father_or_husband_name, r.address].some((v) => v.toLowerCase().includes(q)))
      // ইউনিয়ন ও কাস্টম ফিল্ড নেই — সেগুলো দিয়ে সাজানো সিরিয়ালে ফেরে
      const sort: Exclude<SortField, 'union_name' | `extra.${string}`> =
        params.sort === 'union_name' || params.sort?.startsWith('extra.') ? 'serial_no' : (params.sort as 'serial_no') ?? 'serial_no'
      const dir = (params.order ?? 'asc') === 'asc' ? 1 : -1
      rows = [...rows].sort((a, b) => {
        const av = a[sort]
        const bv = b[sort]
        const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'bn')
        return c !== 0 ? c * dir : a.serial_no - b.serial_no
      })
      const from = (page - 1) * pageSize
      return pageOf(rows.slice(from, from + pageSize).map(clone), page, pageSize, rows.length)
    },

    async getById(id) {
      return clone(findOrThrow(id))
    },

    async getBySerial(projectType, serialNo) {
      const r = store.records.find((x) => x.project_type === projectType && x.serial_no === serialNo)
      return clone(r ?? notFound())
    },

    async getBySerials(projectType, serialNos) {
      const want = new Set(serialNos.filter((n) => Number.isInteger(n) && n >= 1))
      return store.records
        .filter((r) => r.project_type === projectType && want.has(r.serial_no))
        .sort((a, b) => a.serial_no - b.serial_no)
        .map(clone)
    },

    async create(input) {
      const actor = requireAdmin()
      const projectType = checkType(input.project_type)
      const fields = cleanFields(input, false)
      const rec = insertRecord(projectType, fields, input.serial_no, actor)
      store.save()
      return clone(rec)
    },

    async update(id, patch) {
      const actor = requireAdmin()
      if ('project_type' in patch || 'serial_no' in patch) bad('project_type ও serial_no বদলানো যায় না', 'serial_no')
      const rec = findOrThrow(id)
      const before = clone(rec)
      Object.assign(rec, cleanFields(patch, true))
      rec.updated_at = new Date().toISOString()
      logUpdate(before, rec, actor)
      store.save()
      return clone(rec)
    },

    async delete(id) {
      const actor = requireMainAdmin()
      const rec = findOrThrow(id)
      const paths = [rec.prev_photo_url, rec.prev_thumb_url, rec.current_photo_url, rec.current_thumb_url]
        .map((u) => (u ? storage.pathFromUrl(u) : null))
        .filter((p): p is string => !!p)
      store.records = store.records.filter((r) => r.id !== id)
      for (const p of paths) store.files.delete(p)
      log('delete', rec, { ...summary(rec), address: rec.address, father_or_husband_name: rec.father_or_husband_name, had_prev_photo: !!rec.prev_photo_url, had_current_photo: !!rec.current_photo_url }, actor)
      store.save()
    },

    async bulkInsert(input) {
      const actor = requireAdmin()
      const projectType = checkType(input.project_type)
      if (input.mode !== 'assign_serial' && input.mode !== 'use_given_serial') bad('mode অবৈধ', 'mode')
      if (!input.rows.length || input.rows.length > MAX_BULK) {
        if (input.rows.length > MAX_BULK) throw new HousingApiError('PAYLOAD_TOO_LARGE', `সর্বোচ্চ ${MAX_BULK} সারি`)
        bad('rows খালি', 'rows')
      }
      const cleaned = input.rows.map((r, i) => cleanFields({ ...r, project_type: projectType }, false, i))
      if (input.mode === 'use_given_serial') {
        const seen = new Set<number>()
        input.rows.forEach((r, i) => {
          if (!Number.isInteger(r.serial_no) || (r.serial_no ?? 0) < 1) bad(`সারি ${i + 1}: serial_no নেই বা অবৈধ`, 'serial_no', i)
          if (seen.has(r.serial_no!)) bad(`সারি ${i + 1}: serial_no ${r.serial_no} ডুপ্লিকেট`, 'serial_no', i)
          seen.add(r.serial_no!)
        })
        for (const s of seen) {
          if (store.records.some((r) => r.project_type === projectType && r.serial_no === s)) {
            throw new HousingApiError('CONFLICT', `serial_no ${s} আগে থেকেই আছে`)
          }
        }
      }
      // সব যাচাই পাস — এখন একসাথে ইনসার্ট (all-or-nothing)
      cleaned.forEach((fields, i) => insertRecord(projectType, fields, input.mode === 'use_given_serial' ? input.rows[i].serial_no : undefined, actor))
      store.save()
      const result: BulkInsertResult = { inserted: cleaned.length, failed: [] }
      return result
    },

    async bulkUpdateBySerial(input) {
      const actor = requireAdmin()
      const projectType = checkType(input.project_type)
      if (!input.rows.length || input.rows.length > MAX_BULK) {
        if (input.rows.length > MAX_BULK) throw new HousingApiError('PAYLOAD_TOO_LARGE', `সর্বোচ্চ ${MAX_BULK} সারি`)
        bad('rows খালি', 'rows')
      }
      const prepared = input.rows.map((row, i) => {
        if (!Number.isInteger(row.serial_no) || row.serial_no < 1) bad(`সারি ${i + 1}: serial_no আবশ্যক`, 'serial_no', i)
        const { serial_no, ...rest } = row
        const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== ''))
        return { serial_no, fields: cleanFields(defined, true, i) }
      })
      const result = { updated: 0, missing: [] as number[] }
      for (const { serial_no, fields } of prepared) {
        const rec = store.records.find((r) => r.project_type === projectType && r.serial_no === serial_no)
        if (!rec) {
          result.missing.push(serial_no)
          continue
        }
        const before = clone(rec)
        Object.assign(rec, fields)
        rec.updated_at = new Date().toISOString()
        logUpdate(before, rec, actor)
        result.updated++
      }
      store.save()
      return result
    },

    async stats(projectType, opts = {}) {
      const key = projectType ?? GROUP_KEY
      const only = recordProjectType(key)
      const rows = only ? store.records.filter((r) => r.project_type === only) : store.records
      const count = (key: (r: HousingRecord) => string) => {
        const m = new Map<string, number>()
        for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
        return Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])))
      }
      const stats: HousingStats = {
        total: rows.length,
        by_year: count((r) => String(r.year)),
        by_division: count((r) => r.division),
        by_district: count((r) => r.district),
        by_upazila: count((r) => r.upazila),
        distinct: {
          divisions: new Set(rows.map((r) => r.division)).size,
          districts: new Set(rows.map((r) => r.district)).size,
          upazilas: new Set(rows.map((r) => `${r.district}|${r.upazila}`)).size,
        },
        by_location: count((r) => `${r.district}|${r.upazila}`),
      }
      // মক ফিল্টারে গোনে না (বাড়ে না): মোট ফেরত, সাথে বলে দেওয়া যে ফিল্টার হয়নি — পাতা মোট দেখায়, ব্যানার নয়
      const totals = toProjectStats(stats, key)
      return hasStatsFilters(opts.filters) ? { ...totals, filtered: false } : totals
    },

    async years(projectType) {
      const only = recordProjectType(projectType)
      const rows = only ? store.records.filter((r) => r.project_type === only) : store.records
      return [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a)
    },

    async filterOptions(projectType): Promise<FilterOptions> {
      const [years, stats] = await Promise.all([api.years(projectType), api.stats(projectType)])
      const keys = (o: Record<string, number>) => Object.keys(o).sort((a, b) => a.localeCompare(b, 'bn'))
      return { years, divisions: keys(stats.by_division), districts: keys(stats.by_district), upazilas: keys(stats.by_upazila), unions: [] }
    },

    async uploadPhoto(id, kind, files) {
      const actor = requireAdmin()
      if (kind !== 'prev' && kind !== 'current') bad('kind অবৈধ', 'kind')
      if (files.photo.size > MAX_PHOTO_BYTES || files.thumb.size > MAX_THUMB_BYTES) {
        throw new HousingApiError('PAYLOAD_TOO_LARGE', 'ছবি খুব বড়')
      }
      const rec = findOrThrow(id)
      const before = clone(rec)
      const base = { project_type: rec.project_type, serial_no: rec.serial_no, kind }
      const full = await storage.upload(files.photo, { ...base, variant: 'full' })
      const thumb = await storage.upload(files.thumb, { ...base, variant: 'thumb' })
      rec[`${kind}_photo_url`] = full.url
      rec[`${kind}_thumb_url`] = thumb.url
      rec.photo_updated_at = new Date().toISOString()
      rec.updated_at = rec.photo_updated_at
      logUpdate(before, rec, actor)
      store.save()
      return clone(rec)
    },

    async deletePhoto(id, kind) {
      const actor = requireMainAdmin()
      if (kind !== 'prev' && kind !== 'current') bad('kind অবৈধ', 'kind')
      const rec = findOrThrow(id)
      const before = clone(rec)
      const paths = [rec[`${kind}_photo_url`], rec[`${kind}_thumb_url`]].map((u) => (u ? storage.pathFromUrl(u) : null)).filter((p): p is string => !!p)
      if (paths.length) await storage.delete(paths)
      rec[`${kind}_photo_url`] = null
      rec[`${kind}_thumb_url`] = null
      rec.photo_updated_at = new Date().toISOString()
      rec.updated_at = rec.photo_updated_at
      logUpdate(before, rec, actor)
      store.save()
      return clone(rec)
    },

    async nextSerial(projectType) {
      return store.counters[checkType(projectType)] + 1
    },

    async changeSerial(id, newSerialNo) {
      const actor = requireAdmin()
      if (!Number.isInteger(newSerialNo) || newSerialNo < 1) bad('সিরিয়াল ১ বা তার বেশি হতে হবে', 'serial_no')
      const rec = findOrThrow(id)
      if (rec.serial_no === newSerialNo) return clone(rec)
      if (store.records.some((r) => r.project_type === rec.project_type && r.serial_no === newSerialNo)) {
        throw new HousingApiError('CONFLICT', `সিরিয়াল ${newSerialNo} আগে থেকেই আছে`)
      }
      const before = clone(rec)
      rec.serial_no = newSerialNo
      store.counters[rec.project_type] = Math.max(store.counters[rec.project_type], newSerialNo)
      // ছবির ফাইল নতুন সিরিয়ালের পাথে সরানো (ফাইল না থাকলে সেই কলাম null)
      for (const kind of ['prev', 'current'] as const) {
        for (const [col, variant] of [[`${kind}_photo_url`, 'full'], [`${kind}_thumb_url`, 'thumb']] as const) {
          const oldUrl = before[col]
          if (!oldUrl) continue
          const oldPath = storage.pathFromUrl(oldUrl)
          const newPath = photoPath(rec.project_type, newSerialNo, kind, variant)
          if (!oldPath || oldPath === newPath) continue
          try {
            rec[col] = (await storage.move(oldPath, newPath)).url
          } catch (err) {
            if (HousingApiError.is(err) && err.code === 'NOT_FOUND') rec[col] = null
            else throw err
          }
        }
      }
      rec.updated_at = new Date().toISOString()
      if (rec.prev_photo_url !== before.prev_photo_url || rec.current_photo_url !== before.current_photo_url) rec.photo_updated_at = rec.updated_at
      logUpdate(before, rec, actor)
      store.save()
      return clone(rec)
    },

    // গোপন ফিল্ড নেই — REST অ্যাডাপ্টারের মতো খালি
    getPrivate: async () => ({}),
    setPrivate: async () => notInMock(),
    getPrivateMany: async () => ({}),

    async listActivity(params) {
      requireAdmin()
      const page = Math.max(1, Math.floor(params.page ?? 1))
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.page_size ?? DEFAULT_PAGE_SIZE)))
      const actor = params.actor_email?.replace(/[%,()]/g, '').toLowerCase()
      const rows = store.activity
        .filter((e) => {
          if (params.action && e.action !== params.action) return false
          if (params.project_type && e.project_type !== params.project_type) return false
          if (params.record_id && e.record_id !== params.record_id) return false
          if (actor && !(e.actor_email ?? '').toLowerCase().includes(actor)) return false
          if (params.from && e.at < params.from) return false
          if (params.to && e.at > params.to) return false
          return true
        })
        .sort((a, b) => (a.at === b.at ? b.id - a.id : a.at < b.at ? 1 : -1))
      const from = (page - 1) * pageSize
      return pageOf<ActivityEntry>(rows.slice(from, from + pageSize), page, pageSize, rows.length)
    },

    async logActivity(action, details = {}, projectType) {
      // ব্যর্থতা নীরব: এডমিন সেশন না থাকলে কিছু লেখা হয় না (লগ UI/মূল কাজ ভাঙে না)
      const s = store.session
      if (!s?.isAdmin) return
      log(action, null, details, { id: s.user.id, email: s.user.email }, projectType ?? null)
      store.save()
    },
  }

  return api
}
