import { beforeEach, describe, expect, test } from 'vitest'
import { BD_GEO } from '../../src/features/housing/data/bdGeo'
import { HousingApiError, type HousingRecord, type HousingRecordInput, type ProjectType } from '../../src/features/housing/backend/interfaces/types'
import type { ContractHarness, ContractOptions } from './harness'

const dv = BD_GEO[0]
const ds = dv.districts[0]
const up = ds.upazilas[0]
const TYPES: ProjectType[] = ['semi_pucca', 'tin']
const MISSING_ID = '00000000-0000-4000-8000-ffffffffffff'

const tag = () => `ct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

const input = (over: Partial<HousingRecordInput> = {}): HousingRecordInput => ({
  project_type: 'tin',
  year: 2025,
  name: `নাম ${tag()}`,
  father_or_husband_name: '',
  division: dv.name,
  district: ds.name,
  upazila: up.name,
  address: '',
  ...over,
})

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'NO_ERROR'
  } catch (e) {
    return HousingApiError.is(e) ? e.code : `OTHER:${String(e)}`
  }
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)

/**
 * ব্যাকএন্ড-নিরপেক্ষ চুক্তি-স্যুট (docs/api/API_CONTRACT.md)। যেকোনো HousingApi/AuthProvider জোড়ায় চলে।
 * নিয়ম: নির্দিষ্ট রেকর্ডের নাম/সংখ্যা ধরে নয়, শুধু সম্পর্ক ধরে যাচাই (পড়ার অংশ লাইভ ডাটাতেও চলে)।
 */
export function runHousingApiContract(label: string, makeHarness: () => Promise<ContractHarness> | ContractHarness, opts: ContractOptions): void {
  // seeded ব্যাকএন্ডে ডাটা না থাকলে এই টেস্টগুলো ব্যর্থ হয়; নইলে (যেমন লাইভ) নিঃশব্দে বাদ যায়
  const hasData = (found: unknown): boolean => {
    if (!found) expect(opts.seeded ?? false, 'this backend is expected to hold records').toBe(false)
    return !!found
  }
  describe(`${label}: read contract`, () => {
    let h: ContractHarness
    beforeEach(async () => {
      h = await makeHarness()
    })

    test('list returns a page with consistent meta and the default page size', async () => {
      const r = await h.api.list({})
      expect(r.meta.page).toBe(1)
      expect(r.meta.page_size).toBe(50)
      expect(r.data.length).toBeLessThanOrEqual(50)
      expect(r.meta.total_pages).toBe(Math.max(1, Math.ceil(r.meta.total / 50)))
      expect(r.meta.total).toBeGreaterThanOrEqual(r.data.length)
    })

    test('page_size above the cap is clamped to 100', async () => {
      expect((await h.api.list({ page_size: 1000 })).meta.page_size).toBe(100)
    })

    test('a search with no match returns an empty page with total_pages 1', async () => {
      const r = await h.api.list({ q: `zz-no-match-${tag()}` })
      expect(r.data).toEqual([])
      expect(r.meta.total).toBe(0)
      expect(r.meta.total_pages).toBe(1)
    })

    test('pages do not overlap', async () => {
      const total = (await h.api.list({ page_size: 1 })).meta.total
      if (!hasData(total > 0)) return
      if (total < 2) return
      const p1 = await h.api.list({ page: 1, page_size: 1 })
      const p2 = await h.api.list({ page: 2, page_size: 1 })
      expect(p1.data[0].id).not.toBe(p2.data[0].id)
      expect(p1.meta.total).toBe(p2.meta.total)
    })

    test('project_type filter narrows, and the two project totals add up to the overall total', async () => {
      const all = await h.api.list({ page_size: 1 })
      let sumTypes = 0
      for (const t of TYPES) {
        const r = await h.api.list({ project_type: t, page_size: 100 })
        expect(r.data.every((x) => x.project_type === t)).toBe(true)
        sumTypes += r.meta.total
      }
      expect(sumTypes).toBe(all.meta.total)
    })

    test('Covers AE3: a district filter keeps only that district and never grows the count', async () => {
      const first = (await h.api.list({ page_size: 1 })).data[0]
      if (!hasData(first)) return
      const all = await h.api.list({ page_size: 1 })
      const r = await h.api.list({ district: first.district, page_size: 100 })
      expect(r.data.length).toBeGreaterThan(0)
      expect(r.data.every((x) => x.district === first.district)).toBe(true)
      expect(r.meta.total).toBeLessThanOrEqual(all.meta.total)
      expect(r.meta.total).toBe((await h.api.stats()).by_district[first.district])
    })

    test('a year filter keeps only that year and matches the stats count', async () => {
      const first = (await h.api.list({ page_size: 1 })).data[0]
      if (!hasData(first)) return
      const r = await h.api.list({ year: first.year, page_size: 100 })
      expect(r.data.every((x) => x.year === first.year)).toBe(true)
      expect(r.meta.total).toBe((await h.api.stats()).by_year[String(first.year)])
    })

    test('search matches name, parent name or address, case-insensitively', async () => {
      const first = (await h.api.list({ page_size: 1 })).data[0]
      if (!hasData(first)) return
      const needle = first.name.slice(0, 3)
      const r = await h.api.list({ q: needle, page_size: 100 })
      expect(r.data.some((x) => x.id === first.id)).toBe(true)
      for (const x of r.data) {
        const hay = [x.name, x.father_or_husband_name, x.address].join('\n').toLowerCase()
        expect(hay.includes(needle.toLowerCase())).toBe(true)
      }
    })

    test('sort by serial is ascending by default and reverses with order desc; ties break by serial', async () => {
      for (const t of TYPES) {
        const asc = (await h.api.list({ project_type: t, page_size: 100 })).data.map((x) => x.serial_no)
        const desc = (await h.api.list({ project_type: t, order: 'desc', page_size: 100 })).data.map((x) => x.serial_no)
        expect(asc).toEqual([...asc].sort((a, b) => a - b))
        expect(desc).toEqual([...desc].sort((a, b) => b - a))
      }
      const byYear = (await h.api.list({ project_type: 'semi_pucca', sort: 'year', page_size: 100 })).data
      for (let i = 1; i < byYear.length; i++) {
        expect(byYear[i].year).toBeGreaterThanOrEqual(byYear[i - 1].year)
        if (byYear[i].year === byYear[i - 1].year) expect(byYear[i].serial_no).toBeGreaterThan(byYear[i - 1].serial_no)
      }
    })

    test('getById and getBySerial return the same record as the list; unknown ones are NOT_FOUND', async () => {
      const first = (await h.api.list({ page_size: 1 })).data[0]
      if (hasData(first)) {
        expect((await h.api.getById(first!.id)).id).toBe(first!.id)
        expect((await h.api.getBySerial(first!.project_type, first!.serial_no)).id).toBe(first!.id)
      }
      expect(await code(h.api.getById(MISSING_ID))).toBe('NOT_FOUND')
      expect(await code(h.api.getBySerial('tin', 2_000_000_000))).toBe('NOT_FOUND')
    })

    test('getBySerials returns the found records in serial order and silently omits missing ones', async () => {
      const rows = (await h.api.list({ project_type: 'semi_pucca', page_size: 100 })).data
      if (!hasData(rows.length)) return
      const serials = rows.map((r) => r.serial_no)
      const got = await h.api.getBySerials('semi_pucca', [...serials].reverse().concat([2_000_000_000]))
      expect(got.map((r) => r.serial_no)).toEqual([...serials].sort((a, b) => a - b))
    })

    test('stats totals agree with the list and with each other', async () => {
      const s = await h.api.stats()
      expect(s.total).toBe((await h.api.list({ page_size: 1 })).meta.total)
      expect(sum(s.by_year)).toBe(s.total)
      expect(sum(s.by_division)).toBe(s.total)
      expect(sum(s.by_district)).toBe(s.total)
      expect(sum(s.by_upazila)).toBe(s.total)
      expect(sum(s.by_location)).toBe(s.total)
      expect(s.distinct.divisions).toBe(Object.keys(s.by_division).length)
      expect(s.distinct.upazilas).toBe(Object.keys(s.by_location).length)
      for (const t of TYPES) {
        expect((await h.api.stats(t)).total).toBe((await h.api.list({ project_type: t, page_size: 1 })).meta.total)
      }
    })

    test('years are unique, newest first, and match the stats years', async () => {
      const years = await h.api.years()
      expect(years).toEqual([...new Set(years)].sort((a, b) => b - a))
      expect(years.map(String).sort()).toEqual(Object.keys((await h.api.stats()).by_year).sort())
    })

    test('filterOptions match what the stats and years report', async () => {
      const o = await h.api.filterOptions()
      expect(o.years).toEqual(await h.api.years())
      expect(new Set(o.divisions)).toEqual(new Set(Object.keys((await h.api.stats()).by_division)))
    })

    test('nextSerial is greater than every existing serial of that project', async () => {
      for (const t of TYPES) {
        const top = (await h.api.list({ project_type: t, order: 'desc', page_size: 1 })).data[0]
        const next = await h.api.nextSerial(t)
        expect(Number.isInteger(next)).toBe(true)
        expect(next).toBeGreaterThan(top?.serial_no ?? 0)
      }
    })

    test('without a session every write is refused as unauthenticated, before anything is written', async () => {
      const before = (await h.api.list({ page_size: 1 })).meta.total
      const some = (await h.api.list({ page_size: 1 })).data[0]
      const id = some?.id ?? MISSING_ID
      const files = { photo: new Blob(['x']), thumb: new Blob(['x']) }
      const calls = [
        h.api.create(input()),
        h.api.update(id, { name: 'x' }),
        h.api.delete(id),
        h.api.changeSerial(id, 2_000_000_000),
        h.api.bulkInsert({ project_type: 'tin', mode: 'assign_serial', rows: [] }),
        h.api.bulkUpdateBySerial({ project_type: 'tin', rows: [] }),
        h.api.uploadPhoto(id, 'prev', files),
        h.api.deletePhoto(id, 'prev'),
        h.api.listActivity({}),
      ]
      for (const c of calls) expect(await code(c)).toBe('UNAUTHENTICATED')
      expect((await h.api.list({ page_size: 1 })).meta.total).toBe(before)
    })
  })

  if (!opts.writes) return

  describe(`${label}: write contract`, () => {
    let h: ContractHarness
    beforeEach(async () => {
      h = await makeHarness()
    })
    const loginAdmin = () => h.auth.login(h.admin!.email, h.admin!.password)

    describe('auth', () => {
      test('a wrong password is refused as unauthenticated and creates no session', async () => {
        expect(await code(h.auth.login(h.admin!.email, 'wrong-password'))).toBe('UNAUTHENTICATED')
        expect(await h.auth.currentUser()).toBeNull()
      })

      test('Covers AE2: an account outside the admin list is forbidden and gets no session', async () => {
        expect(await code(h.auth.login(h.nonAdmin!.email, h.nonAdmin!.password))).toBe('FORBIDDEN')
        expect(await h.auth.currentUser()).toBeNull()
        expect(await h.auth.isAdmin()).toBe(false)
      })

      test('admin login gives an admin user; logout removes the session; auth changes are announced', async () => {
        const seen: (string | null)[] = []
        const off = h.auth.onAuthChange((u) => seen.push(u?.email ?? null))
        const user = await loginAdmin()
        expect(user.role).toBe('admin')
        expect((await h.auth.currentUser())?.email).toBe(h.admin!.email)
        expect(await h.auth.isAdmin()).toBe(true)
        await h.auth.logout()
        expect(await h.auth.currentUser()).toBeNull()
        off()
        expect(seen).toEqual([h.admin!.email, null])
      })

      test('a logged-in non-admin is forbidden on writes and on the activity log', async () => {
        h.forceNonAdminSession!()
        const some = (await h.api.list({ page_size: 1 })).data[0]
        expect(await code(h.api.create(input()))).toBe('FORBIDDEN')
        expect(await code(h.api.delete(some.id))).toBe('FORBIDDEN')
        expect(await code(h.api.listActivity({}))).toBe('FORBIDDEN')
      })
    })

    describe('records and serials', () => {
      beforeEach(async () => {
        await loginAdmin()
      })

      test('create without a serial takes the predicted next serial and returns clean defaults', async () => {
        const next = await h.api.nextSerial('tin')
        const rec = await h.api.create(input({ name: '  নাম  ' }))
        expect(rec.serial_no).toBe(next)
        expect(rec.name).toBe('নাম')
        expect(rec.father_or_husband_name).toBe('')
        expect(rec.address).toBe('')
        expect([rec.prev_photo_url, rec.current_photo_url, rec.photo_updated_at]).toEqual([null, null, null])
        expect((await h.api.getBySerial('tin', next)).id).toBe(rec.id)
      })

      test('create with an explicit serial raises the counter past it; a taken serial is a conflict', async () => {
        const target = (await h.api.nextSerial('tin')) + 40
        const rec = await h.api.create(input({ serial_no: target }))
        expect(rec.serial_no).toBe(target)
        expect(await h.api.nextSerial('tin')).toBe(target + 1)
        expect(await code(h.api.create(input({ serial_no: target })))).toBe('CONFLICT')
      })

      test('create rejects an invalid project type, year, name and an over-long name', async () => {
        const bads: Partial<HousingRecordInput>[] = [
          { project_type: 'villa' as ProjectType },
          { year: 1999 },
          { year: 2101 },
          { year: 2025.5 },
          { name: '   ' },
          { name: 'ক'.repeat(201) },
          { division: '' },
          { serial_no: 0 },
        ]
        for (const b of bads) expect(await code(h.api.create(input(b)))).toBe('VALIDATION_ERROR')
      })

      test('text is NFC-normalized on write and found by search in either form', async () => {
        const decomposed = `বাড়ি-${tag()}`
        const composed = decomposed.replace('ড়', 'ড়')
        const rec = await h.api.create(input({ name: decomposed }))
        expect(rec.name).toBe(decomposed.normalize('NFC'))
        const found = await h.api.list({ q: composed, page_size: 100 })
        expect(found.data.some((r) => r.id === rec.id)).toBe(true)
      })

      test('update changes only the given fields; unknown ids are NOT_FOUND; serial and project type are protected', async () => {
        const rec = await h.api.create(input({ address: 'আগের ঠিকানা' }))
        const upd = await h.api.update(rec.id, { name: `নতুন ${tag()}` })
        expect(upd.name).not.toBe(rec.name)
        expect(upd.address).toBe('আগের ঠিকানা')
        expect(upd.serial_no).toBe(rec.serial_no)
        expect(new Date(upd.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(rec.updated_at).getTime())
        expect(await code(h.api.update(MISSING_ID, { name: 'x' }))).toBe('NOT_FOUND')
        expect(await code(h.api.update(rec.id, { serial_no: 999 } as never))).toBe('VALIDATION_ERROR')
        expect(await code(h.api.update(rec.id, { project_type: 'semi_pucca' } as never))).toBe('VALIDATION_ERROR')
        expect((await h.api.getById(rec.id)).serial_no).toBe(rec.serial_no)
      })

      test('Covers AE1: a deleted record leaves its serial used; the next record does not reuse it', async () => {
        const a = await h.api.create(input())
        await h.api.delete(a.id)
        expect(await code(h.api.getById(a.id))).toBe('NOT_FOUND')
        expect(await code(h.api.delete(a.id))).toBe('NOT_FOUND')
        const b = await h.api.create(input())
        expect(b.serial_no).toBe(a.serial_no + 1)
        expect(await h.api.nextSerial('tin')).toBe(b.serial_no + 1)
      })

      test('changeSerial moves a record to an unused serial and never reuses the old one', async () => {
        const rec = await h.api.create(input())
        const target = rec.serial_no + 25
        const moved = await h.api.changeSerial(rec.id, target)
        expect(moved.serial_no).toBe(target)
        expect(await code(h.api.getBySerial('tin', rec.serial_no))).toBe('NOT_FOUND')
        const next = await h.api.create(input())
        expect(next.serial_no).toBeGreaterThan(target)
      })

      test('changeSerial to a used serial is a conflict that changes nothing; invalid serials are validation errors', async () => {
        const a = await h.api.create(input())
        const b = await h.api.create(input())
        expect(await code(h.api.changeSerial(a.id, b.serial_no))).toBe('CONFLICT')
        expect((await h.api.getById(a.id)).serial_no).toBe(a.serial_no)
        expect((await h.api.getById(b.id)).serial_no).toBe(b.serial_no)
        expect(await code(h.api.changeSerial(a.id, 0))).toBe('VALIDATION_ERROR')
        expect(await code(h.api.changeSerial(MISSING_ID, 5_000))).toBe('NOT_FOUND')
      })

      test('changeSerial carries photos to the new serial path', async () => {
        const rec = await h.api.create(input())
        const withPhoto = await h.api.uploadPhoto(rec.id, 'prev', { photo: new Blob(['p']), thumb: new Blob(['t']) })
        const target = rec.serial_no + 30
        const moved = await h.api.changeSerial(rec.id, target)
        const padded = String(target).padStart(4, '0')
        expect(withPhoto.prev_photo_url).toContain(String(rec.serial_no).padStart(4, '0'))
        expect(moved.prev_photo_url).toContain(`/${padded}/prev.webp`)
        expect(moved.prev_thumb_url).toContain(`/${padded}/prev_thumb.webp`)
      })
    })

    describe('bulk', () => {
      beforeEach(async () => {
        await loginAdmin()
      })
      const row = (over: Record<string, unknown> = {}) => {
        const { project_type: _t, ...rest } = input()
        void _t
        return { ...rest, ...over }
      }

      test('assign_serial numbers rows in order from the next serial', async () => {
        const next = await h.api.nextSerial('tin')
        const r = await h.api.bulkInsert({ project_type: 'tin', mode: 'assign_serial', rows: [row(), row(), row()] })
        expect(r).toEqual({ inserted: 3, failed: [] })
        const got = await h.api.getBySerials('tin', [next, next + 1, next + 2])
        expect(got.map((x) => x.serial_no)).toEqual([next, next + 1, next + 2])
      })

      test('use_given_serial keeps the serials and raises the counter past the largest', async () => {
        const base = (await h.api.nextSerial('tin')) + 100
        await h.api.bulkInsert({ project_type: 'tin', mode: 'use_given_serial', rows: [row({ serial_no: base }), row({ serial_no: base + 5 })] })
        expect(await h.api.nextSerial('tin')).toBe(base + 6)
      })

      test('Covers AE4: a batch with one invalid row writes nothing', async () => {
        const before = (await h.api.list({ project_type: 'tin', page_size: 1 })).meta.total
        const res = await h.api.bulkInsert({ project_type: 'tin', mode: 'assign_serial', rows: [row(), row({ year: 1999 }), row()] }).then(
          (r) => r,
          (e: unknown) => ({ error: HousingApiError.is(e) ? e.code : 'OTHER' }),
        )
        if ('error' in res) expect(res.error).toBe('VALIDATION_ERROR')
        else expect(res.inserted).toBe(0)
        expect((await h.api.list({ project_type: 'tin', page_size: 1 })).meta.total).toBe(before)
      })

      test('duplicate serials inside a batch are rejected as a whole', async () => {
        const base = (await h.api.nextSerial('tin')) + 200
        const before = (await h.api.list({ project_type: 'tin', page_size: 1 })).meta.total
        expect(await code(h.api.bulkInsert({ project_type: 'tin', mode: 'use_given_serial', rows: [row({ serial_no: base }), row({ serial_no: base })] }))).toBe('VALIDATION_ERROR')
        expect((await h.api.list({ project_type: 'tin', page_size: 1 })).meta.total).toBe(before)
      })

      test('more than 500 rows is too large', async () => {
        const rows = Array.from({ length: 501 }, () => row())
        expect(await code(h.api.bulkInsert({ project_type: 'tin', mode: 'assign_serial', rows }))).toBe('PAYLOAD_TOO_LARGE')
      })

      test('bulkUpdateBySerial updates given fields, leaves the rest, and reports unknown serials as missing', async () => {
        const rec = await h.api.create(input({ address: 'অপরিবর্তিত' }))
        const gone = rec.serial_no + 9_000
        const r = await h.api.bulkUpdateBySerial({ project_type: 'tin', rows: [{ serial_no: rec.serial_no, name: `নতুন ${tag()}` }, { serial_no: gone }] })
        expect(r.updated).toBe(1)
        expect(r.missing).toEqual([gone])
        const after = await h.api.getById(rec.id)
        expect(after.name).not.toBe(rec.name)
        expect(after.address).toBe('অপরিবর্তিত')
        expect(after.year).toBe(rec.year)
      })
    })

    describe('photos and activity', () => {
      beforeEach(async () => {
        await loginAdmin()
      })
      const files = () => ({ photo: new Blob(['p']), thumb: new Blob(['t']) })

      test('uploadPhoto sets the serial-based urls and the timestamp; deletePhoto clears them and is idempotent', async () => {
        const rec = await h.api.create(input())
        const up1 = await h.api.uploadPhoto(rec.id, 'current', files())
        const padded = String(rec.serial_no).padStart(4, '0')
        expect(up1.current_photo_url).toContain(`/${padded}/current.webp`)
        expect(up1.current_thumb_url).toContain(`/${padded}/current_thumb.webp`)
        expect(up1.photo_updated_at).not.toBeNull()
        expect(up1.prev_photo_url).toBeNull()
        const del = await h.api.deletePhoto(rec.id, 'current')
        expect([del.current_photo_url, del.current_thumb_url]).toEqual([null, null])
        expect((await h.api.deletePhoto(rec.id, 'current')).current_photo_url).toBeNull()
      })

      test('an over-size photo is too large; an unknown record is not found', async () => {
        const rec = await h.api.create(input())
        const big = { photo: new Blob([new Uint8Array(6 * 1024 * 1024)]), thumb: new Blob(['t']) }
        expect(await code(h.api.uploadPhoto(rec.id, 'prev', big))).toBe('PAYLOAD_TOO_LARGE')
        expect(await code(h.api.uploadPhoto(MISSING_ID, 'prev', files()))).toBe('NOT_FOUND')
      })

      test('every write is logged with before and after values, newest first, and filterable', async () => {
        const rec = await h.api.create(input())
        await h.api.update(rec.id, { address: 'নতুন ঠিকানা' })
        await h.api.uploadPhoto(rec.id, 'prev', files())
        const moved = await h.api.changeSerial(rec.id, rec.serial_no + 20)
        await h.api.delete(rec.id)
        const log = (await h.api.listActivity({ record_id: rec.id })).data
        // Which extra entries a serial change adds for its photos is backend-specific (Supabase logs the serial and the
        // photo move separately), so pin only the ends and the presence of each write kind.
        const actions = log.map((e) => e.action)
        expect(actions[0]).toBe('delete')
        expect(actions[actions.length - 1]).toBe('create')
        for (const a of ['update', 'photo_update', 'serial_change']) expect(actions).toContain(a)
        const update = log.find((e) => e.action === 'update')!
        expect(update.details).toMatchObject({ changes: { address: { old: '', new: 'নতুন ঠিকানা' } } })
        expect(log.find((e) => e.action === 'serial_change')!.details).toMatchObject({ changes: { serial_no: { old: rec.serial_no, new: moved.serial_no } } })
        expect(log.find((e) => e.action === 'photo_update')!.details).toMatchObject({ photo_kinds: ['prev'] })
        expect(log.every((e) => e.actor_email === h.admin!.email && e.record_id === rec.id)).toBe(true)
        const onlyCreates = await h.api.listActivity({ record_id: rec.id, action: 'create' })
        expect(onlyCreates.data).toHaveLength(1)
      })

      test('client events are recorded with the acting admin and without a record', async () => {
        await h.api.logActivity('import_run', { rows: 3 }, 'tin')
        const e = (await h.api.listActivity({ action: 'import_run' })).data[0]
        expect(e).toMatchObject({ action: 'import_run', project_type: 'tin', actor_email: h.admin!.email, record_id: null, details: { rows: 3 } })
      })

      test('logging an event without an admin session fails quietly', async () => {
        await h.auth.logout()
        await expect(h.api.logActivity('login')).resolves.toBeUndefined()
      })
    })
  })
}

export type { HousingRecord }
