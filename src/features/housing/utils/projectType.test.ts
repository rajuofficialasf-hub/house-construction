import { describe, expect, test } from 'vitest'
import { PROJECT_LIST, PROJECT_META, projectFromSlug, projectPath } from './projectType'

describe('project types', () => {
  test('both project types have a slug and file prefix', () => {
    expect(PROJECT_META.semi_pucca.slug).toBe('semi-pucca')
    expect(PROJECT_META.tin.slug).toBe('tin')
    expect(PROJECT_LIST.map((p) => p.type)).toEqual(['semi_pucca', 'tin'])
  })

  test('projectPath builds the list route', () => {
    expect(projectPath('semi_pucca')).toBe('/housing/semi-pucca')
    expect(projectPath('tin')).toBe('/housing/tin')
  })

  test('projectFromSlug maps slugs back and rejects unknown ones', () => {
    expect(projectFromSlug('semi-pucca')).toBe('semi_pucca')
    expect(projectFromSlug('tin')).toBe('tin')
    expect(projectFromSlug('semi_pucca')).toBeNull()
    expect(projectFromSlug(undefined)).toBeNull()
  })
})
