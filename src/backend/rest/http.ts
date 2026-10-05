/**
 * REST অ্যাডাপ্টারের fetch helper — docs/API_CONTRACT.md এর নিয়মে:
 * - JSON body/উত্তর; সফল উত্তর { data, meta? }; এরর { error: { code, message, details } } → HousingApiError
 * - অথ: JWT হলে Authorization: Bearer <token> (localStorage এ রাখা); কুকি সেশন হলে credentials: 'include'
 */
import { HousingApiError, type ApiErrorCode } from '../interfaces/types'

export const TOKEN_KEY = 'housing_rest_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage অনুপলব্ধ (private mode) — সেশন শুধু মেমরিতে থাকবে না; কুকি মোডে সমস্যা নেই
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** multipart হলে FormData দিন (Content-Type ব্রাউজার বসায়) */
  formData?: FormData
  auth?: boolean
}

const KNOWN_CODES: ApiErrorCode[] = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
]

function codeFromStatus(status: number): ApiErrorCode {
  if (status === 400) return 'VALIDATION_ERROR'
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 413) return 'PAYLOAD_TOO_LARGE'
  return 'INTERNAL_ERROR'
}

export async function restRequest<T>(baseUrl: string, path: string, opts: RequestOptions = {}): Promise<T> {
  if (!baseUrl) throw new HousingApiError('CONFIG_ERROR', 'VITE_API_BASE_URL সেট নেই')
  const headers: Record<string, string> = { accept: 'application/json' }
  if (opts.body !== undefined) headers['content-type'] = 'application/json; charset=utf-8'
  if (opts.auth !== false) {
    const token = getToken()
    if (token) headers.authorization = `Bearer ${token}`
  }
  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.formData ? 'POST' : 'GET'),
      headers,
      body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: 'include', // কুকি-সেশন মোডের জন্য; JWT মোডে ক্ষতি নেই
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
