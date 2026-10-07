import { useEffect, useState } from 'react'
import { getHousingApi } from '../../../backend/factory'
import { HousingApiError, type ProjectStats, type ProjectType, type StatsFilters } from '../../../backend/interfaces/types'

export type StatsState =
  | { status: 'loading' }
  | { status: 'ready'; data: ProjectStats }
  | { status: 'error'; error: HousingApiError }

type Settled = Exclude<StatsState, { status: 'loading' }>

const LOADING: StatsState = { status: 'loading' }

/**
 * HousingApi.stats(projectType) লোড করে — সবসময় মোট (ফিল্টারের ড্রপডাউন, মানচিত্র)। ফিল্টার অনুযায়ী কার্ড: useFilteredStats।
 * projectType বদলালে আবার লোড হয়; পুরনো উত্তর (অন্য projectType এর) উপেক্ষা হয়।
 * উত্তর কোন projectType এর তা সাথে রাখা হয়, তাই "loading" রেন্ডারের সময়ই নির্ণীত হয় (effect এ setState নয়)।
 */
export function useHousingStats(projectType?: ProjectType): StatsState {
  const [result, setResult] = useState<{ key: ProjectType | undefined; state: Settled } | null>(null)

  useEffect(() => {
    let alive = true
    getHousingApi()
      .stats(projectType)
      .then((data) => {
        if (alive) setResult({ key: projectType, state: { status: 'ready', data } })
      })
      .catch((err: unknown) => {
        if (alive) setResult({ key: projectType, state: { status: 'error', error: HousingApiError.from(err) } })
      })
    return () => {
      alive = false
    }
  }, [projectType])

  return result && result.key === projectType ? result.state : LOADING
}

/**
 * ফিল্টার অনুযায়ী পরিসংখ্যান (SQL ১৫): filters = null হলে কোনো কল নয়, null ফেরত (তখন মোট stats ব্যবহার করুন)।
 * ফিল্টার বদলালে আবার লোড; পুরনো উত্তর (অন্য ফিল্টারের) উপেক্ষা হয়। ডাটাবেসে সুবিধা না থাকলে data.filtered = false।
 */
export function useFilteredStats(projectType: ProjectType, filters: StatsFilters | null): StatsState | null {
  const key = filters ? JSON.stringify(filters) : null
  const [result, setResult] = useState<{ key: string; state: Settled } | null>(null)

  useEffect(() => {
    if (!key) return
    let alive = true
    getHousingApi()
      .stats(projectType, { filters: JSON.parse(key) as StatsFilters })
      .then((data) => {
        if (alive) setResult({ key, state: { status: 'ready', data } })
      })
      .catch((err: unknown) => {
        if (alive) setResult({ key, state: { status: 'error', error: HousingApiError.from(err) } })
      })
    return () => {
      alive = false
    }
  }, [projectType, key])

  if (!key) return null
  return result && result.key === key ? result.state : LOADING
}
