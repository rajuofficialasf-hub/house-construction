import { beforeEach, describe, expect, test } from 'vitest'
import { BD_GEO } from '../../src/features/geo/data/bdGeo'
import type { HousingRecordInput } from '../../src/backend/interfaces/types'
import { code } from './housingApiContract'
import type { ContractHarness } from './harness'

// User management and an editor's limits through the real adapters (docs/api/PROJECTS_API_CONTRACT.md §৪.৬,
// the P9b decisions in docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md). REST only:
// the mock has no AdminUsersApi and doesn't grow (docs/testing/README.md).

const dv = BD_GEO[0]!
const ds = dv.districts[0]!
const up = ds.upazilas[0]!

const record = (projectType: string, over: Partial<HousingRecordInput> = {}): HousingRecordInput => ({
  project_type: projectType,
  year: 2025,
  name: 'চুক্তি পরীক্ষা',
  father_or_husband_name: '',
  division: dv.name,
  district: ds.name,
  upazila: up.name,
  address: 'নদীর ধার',
  ...over,
})

export function runAdminUsersContract(label: string, makeHarness: () => Promise<ContractHarness> | ContractHarness): void {
  describe(`${label}: admin users contract`, () => {
    let h: ContractHarness
    beforeEach(async () => {
      h = await makeHarness()
    })

    const users = () => h.adminUsers!
    const asMain = () => h.auth.login(h.admin!.email, h.admin!.password)
    const asEditor = () => h.auth.login(h.editor!.email, h.editor!.password)

    test("the main admin lists the users and saves an editor's projects; the editor's session then shows them", async () => {
      await asMain()
      const listed = await users().list()
      expect(listed[0]?.role).toBe('main_admin')
      expect(listed.find((u) => u.email === h.editor!.email)).toMatchObject({ role: 'editor', all_projects: false, projects: ['tin'] })

      const saved = await users().save({ email: h.editor!.email, role: 'editor', all_projects: false, projects: ['semi_pucca'], is_active: true })
      expect(saved).toMatchObject({ email: h.editor!.email, role: 'editor', projects: ['semi_pucca'] })

      await asEditor()
      expect(await h.auth.currentUser()).toMatchObject({ role: 'editor', allProjects: false, projects: ['housing', 'semi_pucca'] })
    })

    test('the editor writes in its project, and is refused another project, a serial change and emptying a value', async () => {
      await asEditor()
      const own = await h.api.create(record('tin'))
      expect(own.project_type).toBe('tin')

      expect(await code(h.api.create(record('semi_pucca')))).toBe('FORBIDDEN')
      expect(await code(h.api.changeSerial(own.id, own.serial_no + 100))).toBe('FORBIDDEN')
      expect(await code(h.api.update(own.id, { address: '' }))).toBe('FORBIDDEN')
      expect((await h.api.update(own.id, { address: 'নতুন ঠিকানা' })).address).toBe('নতুন ঠিকানা')
    })

    test("a plain admin's user list is FORBIDDEN", async () => {
      await h.auth.login(h.plainAdmin!.email, h.plainAdmin!.password)
      expect(await code(users().list())).toBe('FORBIDDEN')
    })
  })
}
