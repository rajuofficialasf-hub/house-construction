/**
 * REST অ্যাডাপ্টারের fetch helper — docs/api/API_CONTRACT.md এর নিয়মে:
 * - JSON body/উত্তর; সফল উত্তর { data, meta? }; এরর { error: { code, message, details } } → HousingApiError
 * - অথ: সার্ভারের HttpOnly সেশন কুকি, প্রতিটি অনুরোধে credentials: 'include'। JS কোনো টোকেন দেখে না বা রাখে না (RE-SEC-03)।
 */
import { HousingApiError, type ApiErrorCode } from '../interfaces/types'

export interface RestRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** multipart হলে FormData দিন (Content-Type ব্রাউজার বসায়) */
  formData?: FormData
  /** বাড়তি হেডার, যেমন প্রকল্প বদলের If-Match */
  headers?: Record<string, string>
}

const KNOWN_CODES: ApiErrorCode[] = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]

function codeFromStatus(status: number): ApiErrorCode {
  if (status === 400) return 'VALIDATION_ERROR'
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 413) return 'PAYLOAD_TOO_LARGE'
  if (status === 429) return 'RATE_LIMITED'
  return 'INTERNAL_ERROR'
}

export async function restRequest<T>(baseUrl: string, path: string, opts: RestRequestOptions = {}): Promise<T> {
  if (!baseUrl) throw new HousingApiError('CONFIG_ERROR', 'VITE_API_BASE_URL সেট নেই')
  const headers: Record<string, string> = { ...opts.headers, accept: 'application/json' }
  if (opts.body !== undefined) headers['content-type'] = 'application/json; charset=utf-8'
  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.formData ? 'POST' : 'GET'),
      headers,
      body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: 'include', // সেশন কুকি পাঠাতে
    })
  } catch (err) {
    throw new HousingApiError('NETWORK_ERROR', 'সার্ভারে সংযোগ করা যায়নি', { cause: String(err) })
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    if (res.ok) throw new HousingApiError('INTERNAL_ERROR', 'সার্ভারের উত্তর JSON নয়')
  }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error
    const code = e?.code && (KNOWN_CODES as string[]).includes(e.code) ? (e.code as ApiErrorCode) : codeFromStatus(res.status)
    throw new HousingApiError(code, e?.message ?? `HTTP ${res.status}`, e?.details)
  }
  return json as T
}

/** The `data` of the server's `{ data }` answer. */
export async function restData<T>(baseUrl: string, path: string, opts?: RestRequestOptions): Promise<T> {
  return (await restRequest<{ data: T }>(baseUrl, path, opts)).data
}

/** A query string without undefined or empty values. */
export function queryOf(values: Record<string, string | number | undefined>): URLSearchParams {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  return query
}
