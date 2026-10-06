import { afterAll, beforeEach, describe, expect, test as vitestTest } from 'vitest'
import { BD_GEO } from '../../src/features/geo/data/bdGeo'
import type { HousingRecordInput, Project, ProjectFieldInput, ProjectInput } from '../../src/backend/interfaces/types'
import { code, webp } from './housingApiContract'
import type { ContractHarness, ContractOptions } from './harness'

// The ProjectsApi part of the backend contract, plus the HousingApi behaviour that needs a project with
// custom and private fields (union_name, extra, f.<key> filters, private values, field stats, photo mode).
// Every test builds its own draft project through ProjectsApi, the same way on every backend, so no
// backend needs a fixture of its own. A project that ever held a record can't be deleted, so those stay
// behind under unique keys; the REST harness resets its database before each test anyway.
// (docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md, "P6 decisions", U35)

const dv = BD_GEO[0]
const ds = dv.districts[0]
const up = ds.upazilas[0]

/** A key that is also a valid slug and file prefix: a letter and 15 lowercase letters or digits. */
const newKey = () => `c${Date.now().toString(36).slice(-7)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 16).padEnd(16, '0')

const FIELDS: ProjectFieldInput[] = [
  { key: 'amount', label_bn: 'টাকা', type: 'money' },
  { key: 'family_size', label_bn: 'সদস্য', type: 'number' },
  { key: 'trade', label_bn: 'পেশা', type: 'category', options: ['দর্জি', 'মুদি'], filterable: true, searchable: true },
  { key: 'phone', label_bn: 'ফোন', type: 'phone', visibility: 'admin' },
]

export function runProjectsApiContract(label: string, makeHarness: () => Promise<ContractHarness> | ContractHarness, opts: ContractOptions): void {
  const gaps = new Set(opts.knownGaps ?? [])
  const matched = new Set<string>()
  const test = (name: string, fn: () => Promise<void>) => {
    if (!gaps.has(name)) return vitestTest(name, fn)
    matched.add(name)
    return vitestTest.fails(`[known gap] ${name}`, fn)
  }
  if (gaps.size) {
    afterAll(() => {
      expect([...gaps].filter((g) => !matched.has(g)), 'knownGaps entries that match no test').toEqual([])
    })
  }

  describe(`${label}: projects contract`, () => {
    let h: ContractHarness
    beforeEach(async () => {
      h = await makeHarness()
    })

    const projects = () => h.projects!
    const asAdmin = () => h.auth.login(h.admin!.email, h.admin!.password)
    const asVisitor = () => h.auth.logout()

    /** A draft leaf project with the four FIELDS, created as the main admin, who stays logged in. */
    async function draft(over: Partial<ProjectInput> = {}, fields = FIELDS): Promise<Project> {
      await asAdmin()
      const key = newKey()
      return projects().create(
        { key, slug: key, name_bn: `পরীক্ষা ${key}`, name_en: `Test ${key}`, file_prefix: key, photo_mode: 'after_only', geo_depth: 'union', ...over },
        fields,
      )
    }

    const record = (project: Project, over: Partial<HousingRecordInput> = {}): HousingRecordInput => ({
      project_type: project.key,
      year: 2025,
      name: `নাম ${newKey()}`,
      father_or_husband_name: '',
      division: dv.name,
      district: ds.name,
      upazila: up.name,
      address: '',
      ...over,
    })

    describe('registry', () => {
      test('Covers AE2: a new project is always a draft that visitors never see, while an admin sees it and its private field', async () => {
        const p = await draft()
        expect(p.is_published).toBe(false)
        expect(p.fields.map((f) => f.key).sort()).toEqual(['amount', 'family_size', 'phone', 'trade'])

        expect((await projects().list({ includeDrafts: true })).map((x) => x.key)).toContain(p.key)
        expect((await projects().get(p.key)).fields.find((f) => f.key === 'phone')?.visibility).toBe('admin')

        await asVisitor()
        expect((await projects().list({ includeDrafts: true })).map((x) => x.key)).not.toContain(p.key)
        expect(await code(projects().get(p.key))).toBe('NOT_FOUND')
        expect((await projects().overview({ includeDrafts: true })).projects.map((x) => x.key)).not.toContain(p.key)
      })

      test('publishing shows the project to visitors without its private field; unpublishing hides it again', async () => {
        const p = await draft()
        const published = await projects().update(p.key, { is_published: true }, { expectedUpdatedAt: p.updated_at })
        expect(published.is_published).toBe(true)

        await asVisitor()
        const seen = await projects().get(p.key)
        expect(seen.fields.map((f) => f.key)).not.toContain('phone')
        expect((await projects().list()).map((x) => x.key)).toContain(p.key)

        await asAdmin()
        await projects().update(p.key, { is_published: false })
        await asVisitor()
        expect(await code(projects().get(p.key))).toBe('NOT_FOUND')
      })

      test('an update with the version the admin read succeeds; one with an older version is a conflict', async () => {
        const p = await draft()
        const changed = await projects().update(p.key, { summary_bn: 'প্রথম' }, { expectedUpdatedAt: p.updated_at })
        expect(changed.summary_bn).toBe('প্রথম')
        expect(await code(projects().update(p.key, { summary_bn: 'দ্বিতীয়' }, { expectedUpdatedAt: p.updated_at }))).toBe('CONFLICT')
        expect((await projects().get(p.key)).summary_bn).toBe('প্রথম')
      })

      test('a taken URL is a conflict', async () => {
        const a = await draft()
        const b = await draft()
        expect(await code(projects().update(b.key, { slug: a.slug }))).toBe('CONFLICT')
      })

      test('a taken URL names the slug field', async () => {
        const a = await draft()
        const b = await draft()
        const err = await projects()
          .update(b.key, { slug: a.slug })
          .catch((e: unknown) => e)
        expect(err).toMatchObject({ code: 'CONFLICT', details: { field: 'slug' } })
      })

      test('reorder puts the projects in the given order', async () => {
        const a = await draft()
        const b = await draft()
        await projects().reorder([b.key, a.key])
        const keys = (await projects().list({ includeDrafts: true })).map((x) => x.key).filter((k) => k === a.key || k === b.key)
        expect(keys).toEqual([b.key, a.key])
      })

      test('a project that never held a record can be deleted, with its fields', async () => {
        const p = await draft()
        await projects().delete(p.key)
        expect(await code(projects().get(p.key))).toBe('NOT_FOUND')
      })

      test('the overview gives an admin with drafts the photo-less count, and visitors none', async () => {
        const p = await draft()
        await h.api.create(record(p))
        const item = (await projects().overview({ includeDrafts: true })).projects.find((x) => x.key === p.key)
        expect(item?.without_photo).toBe(1)
        expect(item?.stats.total).toBe(1)
        await asVisitor()
        expect((await projects().overview()).projects.every((x) => x.without_photo === null)).toBe(true)
      })

      test('a cover can be uploaded and deleted', async () => {
        const p = await draft()
        const withCover = await projects().uploadCover(p.key, webp())
        expect(withCover.cover_path).toBeTruthy()
        expect((await projects().deleteCover(p.key)).cover_path).toBeNull()
      })
    })

    describe('fields', () => {
      test('fields can be added, changed, archived, restored, reordered and deleted', async () => {
        const p = await draft()
        const f = await projects().createField(p.key, { key: 'note', label_bn: 'নোট', type: 'text' })
        expect((await projects().updateField(f.id, { label_bn: 'মন্তব্য' })).label_bn).toBe('মন্তব্য')
        expect((await projects().updateField(f.id, { is_active: false })).is_active).toBe(false)
        expect((await projects().updateField(f.id, { is_active: true })).is_active).toBe(true)

        const ids = (await projects().get(p.key)).fields.map((x) => x.id)
        await projects().reorderFields(p.key, [...ids].reverse())
        expect((await projects().get(p.key)).fields.map((x) => x.id)).toEqual([...ids].reverse())

        await projects().deleteField(f.id)
        expect((await projects().get(p.key)).fields.map((x) => x.key)).not.toContain('note')
      })

      test('a field key used twice in one project is a conflict', async () => {
        const p = await draft()
        expect(await code(projects().createField(p.key, { key: 'amount', label_bn: 'আবার', type: 'money' }))).toBe('CONFLICT')
      })

      test('usage counts a field\'s values, and a category value can be renamed across the project', async () => {
        const p = await draft()
        await h.api.create(record(p, { extra: { trade: 'দর্জী' } }))
        await h.api.create(record(p, { extra: { trade: 'দর্জী' } }))
        await h.api.create(record(p, { extra: { trade: 'মুদি' } }))
        const usage = await projects().fieldUsage(p.key, 'trade')
        expect(usage.count).toBe(3)
        expect(usage.values).toEqual(expect.arrayContaining([{ value: 'দর্জী', n: 2 }, { value: 'মুদি', n: 1 }]))

        expect(await projects().renameFieldValue(p.key, 'trade', 'দর্জী', 'দর্জি')).toBe(2)
        const after = await projects().fieldUsage(p.key, 'trade')
        expect(after.values).toEqual(expect.arrayContaining([{ value: 'দর্জি', n: 2 }]))
      })

      test('a field that holds values can\'t be deleted', async () => {
        const p = await draft()
        await h.api.create(record(p, { extra: { amount: 100 } }))
        const amount = p.fields.find((f) => f.key === 'amount')!
        expect(await code(projects().deleteField(amount.id))).toBe('VALIDATION_ERROR')
      })
    })

    describe('records with custom and private values', () => {
      test('union_name and extra round-trip through create, read and update', async () => {
        const p = await draft()
        const r = await h.api.create(record(p, { union_name: 'দলদলিয়া', extra: { amount: 5000, trade: 'দর্জি' } }))
        expect(r.union_name).toBe('দলদলিয়া')
        expect(r.extra).toEqual({ amount: 5000, trade: 'দর্জি' })
        expect((await h.api.getById(r.id)).extra).toEqual({ amount: 5000, trade: 'দর্জি' })
        const updated = await h.api.update(r.id, { extra: { amount: 6000 } })
        expect(updated.extra).toEqual({ amount: 6000 })
      })

      test('a custom-field filter, a search over a searchable field and a sort by a custom field', async () => {
        const p = await draft()
        await h.api.create(record(p, { extra: { amount: 300, trade: 'দর্জি' } }))
        await h.api.create(record(p, { extra: { amount: 100, trade: 'মুদি' } }))
        await h.api.create(record(p, { extra: { amount: 200, trade: 'দর্জি' } }))

        const tailors = await h.api.list({ project_type: p.key, fields: { trade: 'দর্জি' } })
        expect(tailors.meta.total).toBe(2)
        expect((await h.api.list({ project_type: p.key, q: 'মুদি' })).meta.total).toBe(1)
        const byAmount = await h.api.list({ project_type: p.key, sort: 'extra.amount', order: 'desc' })
        expect(byAmount.data.map((x) => x.extra.amount)).toEqual([300, 200, 100])
      })

      test('private values are saved and read singly and many at once, and never appear in extra', async () => {
        const p = await draft()
        const a = await h.api.create(record(p))
        const b = await h.api.create(record(p))
        expect(await h.api.setPrivate(a.id, { phone: '01700000001' })).toEqual({ phone: '01700000001' })
        expect(await h.api.getPrivate(a.id)).toEqual({ phone: '01700000001' })
        expect(await h.api.getPrivate(b.id)).toEqual({})
        expect(await h.api.getPrivateMany(p.key, [a.id, b.id])).toEqual({ [a.id]: { phone: '01700000001' } })
        expect((await h.api.getById(a.id)).extra).not.toHaveProperty('phone')
      })

      test('a bulk import routes private keys to the private values', async () => {
        const p = await draft()
        const { project_type: _p, ...row } = record(p, { extra: { amount: 10, phone: '01800000002' } })
        const result = await h.api.bulkInsert({ project_type: p.key, mode: 'assign_serial', rows: [row] })
        expect(result.inserted).toBe(1)
        const [saved] = (await h.api.list({ project_type: p.key })).data
        expect(saved!.extra).toEqual({ amount: 10 })
        expect(await h.api.getPrivate(saved!.id)).toEqual({ phone: '01800000002' })
      })

      test('without a session, private values are refused', async () => {
        const p = await draft()
        const r = await h.api.create(record(p))
        await asVisitor()
        expect(await code(h.api.getPrivate(r.id))).toBe('UNAUTHENTICATED')
      })

      test('stats count unions, sum public money and number fields, break categories down, and leave private fields out', async () => {
        const p = await draft()
        const first = await h.api.create(record(p, { union_name: 'ক', extra: { amount: 100, family_size: 4, trade: 'দর্জি' } }))
        await h.api.setPrivate(first.id, { phone: '01700000003' })
        await h.api.create(record(p, { union_name: 'ক', extra: { amount: 200, trade: 'মুদি' } }))
        const s = await h.api.stats(p.key)
        expect(s.total).toBe(2)
        expect(s.by_project).toEqual({ [p.key]: 2 })
        expect(s.by_union).toEqual({ [`${ds.name}|${up.name}|ক`]: 2 })
        expect(s.distinct.unions).toBe(1)
        expect(s.fields.amount).toEqual({ type: 'money', sum: 300, count: 2 })
        expect(s.fields.family_size).toEqual({ type: 'number', sum: 4, count: 1 })
        expect(s.fields.trade).toEqual({
          type: 'category',
          distinct: 2,
          by_value: { দর্জি: { n: 1, sums: { amount: 100, family_size: 4 } }, মুদি: { n: 1, sums: { amount: 200 } } },
        })
        expect(s.fields).not.toHaveProperty('phone')

        const light = await h.api.stats(p.key, { light: true })
        expect(light.by_union).toEqual({})
        expect(light.fields.trade).toEqual({ type: 'category', distinct: 2 })
      })

      test('years and the next serial follow the project\'s records; a visitor gets no next serial for a draft', async () => {
        const p = await draft()
        await h.api.create(record(p, { year: 2024 }))
        await h.api.create(record(p, { year: 2025 }))
        expect(await h.api.years(p.key)).toEqual([2025, 2024])
        expect(await h.api.nextSerial(p.key)).toBe(3)
        await asVisitor()
        expect(await h.api.nextSerial(p.key)).toBeNull()
      })

      test('Covers AE3: an after-only project refuses a before photo and stores nothing', async () => {
        const p = await draft({ photo_mode: 'after_only' })
        const r = await h.api.create(record(p))
        expect(await code(h.api.uploadPhoto(r.id, 'prev', { photo: webp(), thumb: webp() }))).toBe('VALIDATION_ERROR')
        const after = await h.api.getById(r.id)
        expect(after.prev_photo_url).toBeNull()
        expect(after.prev_thumb_url).toBeNull()
      })
    })

    describe('roles', () => {
      test('Covers AE1: a plain admin may write but every delete is forbidden; the main admin deletes', async () => {
        const p = await draft()
        const r = await h.api.create(record(p))
        const spare = await projects().createField(p.key, { key: 'note', label_bn: 'নোট', type: 'text' })
        await projects().uploadCover(p.key, webp())
        const empty = await draft({}, [])

        await h.auth.login(h.plainAdmin!.email, h.plainAdmin!.password)
        expect((await projects().update(p.key, { summary_bn: 'সাধারণ এডমিন' })).summary_bn).toBe('সাধারণ এডমিন')
        const codes = await Promise.all([
          code(h.api.delete(r.id)),
          code(projects().deleteField(spare.id)),
          code(projects().deleteCover(p.key)),
          code(projects().delete(empty.key)),
        ])
        expect(codes).toEqual(['FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN', 'FORBIDDEN'])

        await asAdmin()
        await h.api.delete(r.id)
        await projects().deleteField(spare.id)
        await projects().delete(empty.key)
        expect(await code(h.api.getById(r.id))).toBe('NOT_FOUND')
      })
    })
  })
}
