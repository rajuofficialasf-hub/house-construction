/**
 * প্রকল্প রেজিস্ট্রি (পর্ব ২, পরিকল্পনা §৫.১৪) — কোডে হাতে লেখা প্রকল্প-তালিকার (PROJECT_META) জায়গায় ডাটাবেস-চালিত তালিকা।
 *
 * - মডিউল-স্তরের অবস্থা: ভাষা টগলে LanguageProvider পুরো অ্যাপ remount করলেও এটি থাকে → নতুন রিকোয়েস্ট যায় না।
 * - প্রথম আঁকা সাথে সাথে: localStorage স্ন্যাপশট (`asf_projects_v1`), না থাকলে কোডের ফলব্যাক (ঘর নির্মাণের ৩টি সারি);
 *   পেছনে নেটওয়ার্ক থেকে মিলিয়ে নেয় (getProjectsApi().list)। ব্যর্থ হলে যা আছে তাই থাকে — পেইজ ভাঙে না।
 * - স্ন্যাপশটে শুধু পাবলিক প্রকল্প (এডমিনের খসড়া কখনো ব্রাউজারে জমা থাকে না) এবং এটি কখনো লেখার কাজে ব্যবহার হয় না।
 * - React থেকে পড়া: ./useProjects.ts (useSyncExternalStore)। React-এর বাইরে: getRegistry(), findProject() …
 */
import { FALLBACK_PROJECTS, getProjectsApi, type Project, type ProjectKey } from '@/backend'

export const SNAPSHOT_KEY = 'asf_projects_v1'
/** ঘর নির্মাণ গ্রুপের স্থায়ী key (projects.key কখনো বদলায় না) */
export const HOUSING_GROUP_KEY = 'housing'

export type RegistrySource = 'fallback' | 'snapshot' | 'network'

export interface RegistryState {
  /** sort_order, তারপর key ক্রমে */
  projects: Project[]
  /** এখনকার তালিকা কোথা থেকে */
  source: RegistrySource
  /** নেটওয়ার্ক থেকে মেলানো শেষ (সফল বা ব্যর্থ) — 404 দেখানোর আগে এটির অপেক্ষা (M-ধাপ ৬) */
  synced: boolean
  /** শেষ নেটওয়ার্ক-মেলানো ব্যর্থ হয়েছিল কি না */
  failed: boolean
  /** খসড়াসহ (এডমিন সেশন) */
  includeDrafts: boolean
}

const byOrder = (a: Project, b: Project) => a.sort_order - b.sort_order || a.key.localeCompare(b.key)

function isProjectLike(x: unknown): x is Project {
  const p = x as Partial<Project> | null
  return !!p && typeof p.key === 'string' && typeof p.slug === 'string' && typeof p.name_bn === 'string' && Array.isArray(p.stat_cards)
}

function readSnapshot(): Project[] | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { projects?: unknown }
    const list = Array.isArray(parsed.projects) ? parsed.projects : null
    if (!list || list.length === 0 || !list.every(isProjectLike)) return null
    return (list as Project[]).map((p) => ({ ...p, fields: Array.isArray(p.fields) ? p.fields : [] })).sort(byOrder)
  } catch {
    return null
  }
}

function writeSnapshot(projects: Project[]) {
  try {
    const pub = publicOnly(projects)
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ at: new Date().toISOString(), projects: pub }))
  } catch {
    /* private mode / জায়গা নেই — স্ন্যাপশট ছাড়াই চলে */
  }
}

/** প্রকাশিত এবং (থাকলে) গ্রুপও প্রকাশিত — ডাটাবেসের public_project_keys() এর সমান নিয়ম */
export function isPublicProject(p: Project, projects: Project[] = state.projects): boolean {
  if (!p.is_published) return false
  if (!p.parent_key) return true
  return projects.find((x) => x.key === p.parent_key)?.is_published ?? false
}

function publicOnly(projects: Project[]): Project[] {
  return projects.filter((p) => isPublicProject(p, projects))
}

function initialState(): RegistryState {
  const snap = typeof window === 'undefined' ? null : readSnapshot()
  return {
    projects: snap ?? [...FALLBACK_PROJECTS].sort(byOrder),
    source: snap ? 'snapshot' : 'fallback',
    synced: false,
    failed: false,
    includeDrafts: false,
  }
}

let state: RegistryState = initialState()
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function setState(patch: Partial<RegistryState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

/** নেটওয়ার্ক থেকে মেলানো; একসাথে একটিই কল (একাধিক কম্পোনেন্ট ডাকলেও) */
function sync(): Promise<void> {
  if (inflight) return inflight
  const includeDrafts = state.includeDrafts
  inflight = getProjectsApi()
    .list({ includeDrafts })
    .then((projects) => {
      const sorted = [...projects].sort(byOrder)
      writeSnapshot(sorted)
      setState({ projects: sorted, source: 'network', synced: true, failed: false })
    })
    .catch((err) => {
      if (import.meta.env.DEV) console.warn(`[projects] রেজিস্ট্রি মেলানো যায়নি — আগের তালিকা থাকছে: ${String(err)}`)
      setState({ synced: true, failed: true })
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

let started = false
/** প্রথম ব্যবহারে একবার নেটওয়ার্ক-মেলানো শুরু (subscribe থেকে ডাকা হয়) */
function ensureStarted() {
  if (started) return
  started = true
  void sync()
}

// ---------------------------------------------------------------- পাবলিক API
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  ensureStarted()
  return () => listeners.delete(listener)
}

export function getRegistry(): RegistryState {
  return state
}

/**
 * আবার মেলানো — যেমন এডমিন প্যানেলে সেভের পর (invalidate), বা এডমিন লগইনে খসড়াসহ।
 * includeDrafts দিলে সেটিই পরের সব মেলানোয় থাকে।
 */
export function refreshProjects(opts: { includeDrafts?: boolean } = {}): Promise<void> {
  if (opts.includeDrafts !== undefined && opts.includeDrafts !== state.includeDrafts) {
    setState({ includeDrafts: opts.includeDrafts })
  }
  started = true
  // চলমান কলটি পুরনো অনুরোধের হতে পারে — শেষ হলে নতুন করে
  return (inflight ?? Promise.resolve()).then(() => sync())
}

// ---------------------------------------------------------------- খোঁজার সহায়ক (React-এর বাইরেও)
export function findProject(key: ProjectKey | null | undefined, projects: Project[] = state.projects): Project | undefined {
  return key ? projects.find((p) => p.key === key) : undefined
}

export function findBySlug(slug: string | null | undefined, projects: Project[] = state.projects): Project | undefined {
  return slug ? projects.find((p) => p.slug === slug) : undefined
}

/** গ্রুপের উপ-প্রকল্প (sort_order ক্রমে) */
export function childrenOf(groupKey: ProjectKey, projects: Project[] = state.projects): Project[] {
  return projects.filter((p) => p.parent_key === groupKey)
}

/** শীর্ষ-স্তরের প্রকল্প (গ্রুপ ও একক; উপ-প্রকল্প বাদ) — রাউট আর হেডার মেনুর জন্য */
export function topLevelProjects(projects: Project[] = state.projects): Project[] {
  return projects.filter((p) => !p.parent_key)
}

/** রেকর্ড রাখা যায় এমন প্রকল্প (গ্রুপ বাদ) */
export function leafProjects(projects: Project[] = state.projects): Project[] {
  return projects.filter((p) => !p.is_group)
}

/** ঘর নির্মাণের উপ-প্রকল্প (সেমিপাকা, টিন …) — ঘর নির্মাণের পেইজগুলো এগুলোই দেখায় */
export function housingProjects(projects: Project[] = state.projects): Project[] {
  return childrenOf(HOUSING_GROUP_KEY, projects)
}

/**
 * পাবলিক পেইজের পাথ: গ্রুপের উপ-প্রকল্প `/{group-slug}/{slug}`, একক বা গ্রুপ `/{slug}`।
 * প্রকল্প অচেনা হলে key থেকে বানানো (`semi_pucca` → `/semi-pucca`) — ভাঙা লিংক নয়, 404 পেইজে যায়।
 */
export function projectPath(keyOrProject: ProjectKey | Project, projects: Project[] = state.projects): string {
  const p = typeof keyOrProject === 'string' ? findProject(keyOrProject, projects) : keyOrProject
  if (!p) return `/${String(keyOrProject).replace(/_/g, '-')}`
  const parent = p.parent_key ? findProject(p.parent_key, projects) : undefined
  return parent ? `/${parent.slug}/${p.slug}` : `/${p.slug}`
}

/** কোডের ফলব্যাক তালিকা থেকে slug — স্থির রাউটের জন্য (M-ধাপ ৬-এ রাউট রেজিস্ট্রি-চালিত হবে; প্রকাশিত slug বদলানো যায় না) */
export function fallbackSlug(key: ProjectKey): string {
  const p = FALLBACK_PROJECTS.find((x) => x.key === key)
  if (!p) throw new Error(`ফলব্যাক তালিকায় প্রকল্প নেই: ${key}`)
  return p.slug
}
