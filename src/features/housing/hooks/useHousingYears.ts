import { useEffect, useState } from 'react'
import { getHousingApi } from '../../../backend/factory'
import { HousingApiError, type ProjectType } from '../../../backend/interfaces/types'

export type YearsState =
  | { status: 'loading'; years: number[] }
  | { status: 'ready'; years: number[] }
  | { status: 'error'; years: number[]; error: HousingApiError }

/** HousingApi.years(projectType) — ডাটাবেসে বাস্তবে থাকা সাল (ফিল্টার ড্রপডাউনের জন্য) */
export function useHousingYears(projectType?: ProjectType): YearsState {
  const [result, setResult] = useState<{ key: ProjectType | undefined; state: YearsState } | null>(null)

  useEffect(() => {
    let alive = true
    getHousingApi()
      .years(projectType)
      .then((years) => {
        if (alive) setResult({ key: projectType, state: { status: 'ready', years } })
      })
      .catch((err: unknown) => {
        if (alive) setResult({ key: projectType, state: { status: 'error', years: [], error: HousingApiError.from(err) } })
      })
    return () => {
      alive = false
    }
  }, [projectType])

  return result && result.key === projectType ? result.state : { status: 'loading', years: [] }
}
