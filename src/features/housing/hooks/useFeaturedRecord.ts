import { useEffect, useState } from 'react'
import { getHousingApi } from '../backend/factory'
import { HousingApiError, type HousingRecord, type ProjectType } from '../backend/interfaces/types'

export type FeaturedState =
  | { status: 'loading' }
  | { status: 'ready'; record: HousingRecord | null }
  | { status: 'error'; error: HousingApiError }

/**
 * প্রকল্পের "প্রদর্শনী" রেকর্ড — সিরিয়াল-ক্রমে প্রথম উপকারভোগী (হোম পেইজের কার্ডে)।
 * রেকর্ড না থাকলে ready + null (কার্ড শুধু প্রকল্পের বর্ণনা দেখায়)।
 */
export function useFeaturedRecord(projectType: ProjectType): FeaturedState {
  const [result, setResult] = useState<{ key: ProjectType; state: FeaturedState } | null>(null)

  useEffect(() => {
    let alive = true
    getHousingApi()
      .list({ project_type: projectType, page: 1, page_size: 1, sort: 'serial_no', order: 'asc' })
      .then((p) => alive && setResult({ key: projectType, state: { status: 'ready', record: p.data[0] ?? null } }))
      .catch((err: unknown) => alive && setResult({ key: projectType, state: { status: 'error', error: HousingApiError.from(err) } }))
    return () => {
      alive = false
    }
  }, [projectType])

  return result && result.key === projectType ? result.state : { status: 'loading' }
}
