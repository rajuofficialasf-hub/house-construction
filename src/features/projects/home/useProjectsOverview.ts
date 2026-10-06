import { useEffect, useState } from 'react'
import { getProjectsApi, HousingApiError, type ProjectOverview } from '@/backend'

export type OverviewState =
  | { status: 'loading' }
  | { status: 'ready'; data: ProjectOverview }
  | { status: 'error'; error: HousingApiError }

/**
 * হোম পেইজের সব প্রকল্প — একটিই `projects_overview()` কল (M-ধাপ ১৫; আগে প্রতি কার্ডে list + stats দুটি কল)।
 * কখনো খসড়া নয় (includeDrafts নয় — এডমিন লগইনে থাকলেও হোম পাবলিকের মতো)।
 */
export function useProjectsOverview(): OverviewState {
  const [state, setState] = useState<OverviewState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    getProjectsApi()
      .overview()
      .then((data) => alive && setState({ status: 'ready', data }))
      .catch((err: unknown) => alive && setState({ status: 'error', error: HousingApiError.from(err) }))
    return () => {
      alive = false
    }
  }, [])
  return state
}
