/** Supabase/PostgREST/Auth/Storage এরর → HousingApiError ম্যাপিং */
import { HousingApiError, type ApiErrorCode } from '../interfaces/types'

interface SupabaseLikeError {
  message?: string
  code?: string
  status?: number
  statusCode?: string | number
  details?: string
  hint?: string
}

export function mapSupabaseError(err: unknown, fallback = 'সার্ভারে সমস্যা হয়েছে'): HousingApiError {
  if (HousingApiError.is(err)) return err
  const e = (err ?? {}) as SupabaseLikeError
  // RLS এর ইংরেজি বার্তা ("new row violates row-level security policy …") → বাংলা (পর্ব চ: প্রকল্পভিত্তিক অনুমতি)
  const message = /row-level security/i.test(e.message ?? '')
    ? 'এই কাজের অনুমতি আপনার নেই — নিজের প্রকল্পে যোগ ও এডিট করা যায়; মোছা, থাকা ছবি বদল, মান ফাঁকা করা ও প্রকল্পের সেটিং শুধু মূল এডমিন'
    : e.message || fallback
  const code = String(e.code ?? e.statusCode ?? '')
  const status = Number(e.status ?? e.statusCode ?? 0)

  let mapped: ApiErrorCode = 'INTERNAL_ERROR'
  if (code === '23505') mapped = 'CONFLICT' // unique_violation (project_type, serial_no)
  else if (code === '23514' || code === '23502' || code === '22P02') mapped = 'VALIDATION_ERROR'
  else if (code === '42501' || status === 403) mapped = 'FORBIDDEN' // RLS
  else if (code === 'PGRST116' || code === 'P0002' || status === 404 || /not found/i.test(message)) mapped = 'NOT_FOUND'
  else if (status === 401) mapped = 'UNAUTHENTICATED'
  else if (status === 413 || /exceeded the maximum allowed size/i.test(message)) mapped = 'PAYLOAD_TOO_LARGE'
  else if (/fetch|network|Failed to fetch/i.test(message)) mapped = 'NETWORK_ERROR'

  return new HousingApiError(mapped, message, {
    supabase_code: code || undefined,
    status: status || undefined,
    details: e.details,
    hint: e.hint,
  })
}
