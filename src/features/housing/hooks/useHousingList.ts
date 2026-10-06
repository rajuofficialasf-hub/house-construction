import { useEffect, useMemo, useState } from 'react'
import { getHousingApi } from '../../../backend/factory'
import { HousingApiError, type HousingRecord, type ListParams, type Page } from '../../../backend/interfaces/types'

export type ListState =
  | { status: 'loading'; data: Page<HousingRecord> | null }
  | { status: 'ready'; data: Page<HousingRecord> }
  | { status: 'error'; error: HousingApiError; data: Page<HousingRecord> | null }

interface Settled {
  key: string
  state: { status: 'ready'; data: Page<HousingRecord> } | { status: 'error'; error: HousingApiError }
}

/**
 * HousingApi.list(params) — সার্ভার-সাইড পেজিনেশন। params বদলালে (পেইজ, ফিল্টার) আবার লোড।
 * নতুন পেইজ লোড হওয়ার সময় আগের ডাটা `data` তে থাকে (status 'loading'), যাতে টেবিল লাফায় না।
 * উত্তর কোন params এর তা key হিসেবে রাখা হয়, তাই loading রেন্ডারেই নির্ণীত (effect এ setState নয়)।
 */
export function useHousingList(params: ListParams, reloadToken = 0): ListState {
  const key = useMemo(() => JSON.stringify({ ...params, _r: reloadToken }), [params, reloadToken])
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    let alive = true
    const { _r: _ignored, ...p } = JSON.parse(key) as ListParams & { _r: number }
    getHousingApi()
      .list(p)
      .then((data) => {
        if (alive) setSettled({ key, state: { status: 'ready', data } })
      })
      .catch((err: unknown) => {
        if (alive) setSettled({ key, state: { status: 'error', error: HousingApiError.from(err) } })
      })
    return () => {
      alive = false
    }
  }, [key])

  const previous = settled?.state.status === 'ready' ? settled.state.data : null
  if (!settled || settled.key !== key) return { status: 'loading', data: previous }
  if (settled.state.status === 'error') return { status: 'error', error: settled.state.error, data: null }
  return settled.state
}
