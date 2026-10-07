import { describe, expect, it } from 'vitest'
import { FALLBACK_PROJECTS } from '@/backend/fallbackProjects'
import type { Project } from '@/backend'
import { projectPath } from './projectsStore'

// A record's public link is its project's path plus the serial, so the serial-change warning
// (RecordForm) shows the same path a visitor's link uses.
describe('projectPath', () => {
  const single = { ...FALLBACK_PROJECTS[1]!, key: 'self_reliance', slug: 'self-reliance', parent_key: null } as Project
  const list = [...FALLBACK_PROJECTS, single]

  it('puts a group child under its group: /<group>/<child>', () => {
    expect(projectPath('semi_pucca', list)).toBe('/housing/semi-pucca')
  })

  it('gives a single project its own slug: /<slug>', () => {
    expect(projectPath(single, list)).toBe('/self-reliance')
  })

  it('builds a path from an unknown key instead of a broken link', () => {
    expect(projectPath('new_project', list)).toBe('/new-project')
  })
})
