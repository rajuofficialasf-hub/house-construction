import { useEffect, useState } from 'react'
import { getHousingApi } from '../../../backend/factory'
import { HousingApiError, type ProjectStats, type ProjectType } from '../../../backend/interfaces/types'

export type StatsState =
  | { status: 'loading' }
  | { status: 'ready'; data: ProjectStats }
  | { status: 'error'; error: HousingApiError }

type Settled = Exclude<StatsState, { status: 'loading' }>

const LOADING: StatsState = { status: 'loading' }

/**
 * HousingApi.stats(projectType) লোড করে। ফিল্টারের উপর নির্ভর করে না — সবসময় মোট।
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
