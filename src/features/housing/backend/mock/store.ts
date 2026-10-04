import type { ActivityEntry, AuthUser, HousingRecord, ProjectType } from '../interfaces/types'
import { photoPath } from '../../utils/imagePath'
import { MOCK_PHOTO_PREFIX, SEED_COUNTS, SEED_VERSION, seedRecords } from './fixtures'

const STORAGE_KEY = 'housing_mock_state'

export interface MockSession {
  user: AuthUser
  /** false = এডমিন তালিকায় নেই (সাধারণত লগইনে আটকায়; টেস্টের জন্য জোর করে বসানো যায়) */
  isAdmin: boolean
}

interface Snapshot {
  version: number
  records: HousingRecord[]
  counters: Record<ProjectType, number>
  activity: ActivityEntry[]
  activitySeq: number
  files: string[]
  session: MockSession | null
}

export interface MockStoreOptions {
  /** true হলে ব্রাউজারের sessionStorage এ অবস্থা রাখে (পেইজ রিলোডে টিকে থাকে) */
  persist?: boolean
}

/**
 * মক ব্যাকএন্ডের একমাত্র অবস্থা: রেকর্ড, সিরিয়াল কাউন্টার (কখনো কমে না), অ্যাক্টিভিটি লগ, ছবির পাথ-সেট, সেশন।
 * ব্রাউজারে persist চালু থাকলে প্রতিটি পরিবর্তনের পর snapshot সংরক্ষিত হয়; নতুন ব্রাউজার কনটেক্সট = নতুন seed।
 */
export class MockStore {
  records: HousingRecord[] = []
  counters: Record<ProjectType, number> = { semi_pucca: 0, tin: 0 }
  activity: ActivityEntry[] = []
  activitySeq = 0
  files = new Set<string>()
  session: MockSession | null = null
  private listeners = new Set<(user: AuthUser | null) => void>()
  private persist: boolean

  constructor(opts: MockStoreOptions = {}) {
    this.persist = !!opts.persist && typeof sessionStorage !== 'undefined'
    if (!this.persist || !this.load()) this.seed()
  }

  /** seed অবস্থায় ফেরা এবং লগআউট */
  reset(): void {
    this.seed()
    this.save()
    this.emit()
  }

  private seed(): void {
    this.records = seedRecords()
    this.counters = { ...SEED_COUNTS }
    this.activity = []
    this.activitySeq = 0
    this.session = null
    this.files = new Set(
      this.records.flatMap((r) =>
        r.prev_photo_url
          ? (['prev', 'current'] as const).flatMap((k) => [photoPath(r.project_type, r.serial_no, k, 'full'), photoPath(r.project_type, r.serial_no, k, 'thumb')])
          : [],
      ),
    )
  }

  private load(): boolean {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const s = JSON.parse(raw) as Snapshot
      if (s.version !== SEED_VERSION) return false
      this.records = s.records
      this.counters = s.counters
      this.activity = s.activity
      this.activitySeq = s.activitySeq
      this.files = new Set(s.files)
      this.session = s.session
      return true
    } catch {
      return false
    }
  }

  /** প্রতিটি লেখার পর ডাকতে হয় */
  save(): void {
    if (!this.persist) return
    try {
      const s: Snapshot = {
        version: SEED_VERSION,
        records: this.records,
        counters: this.counters,
        activity: this.activity,
        activitySeq: this.activitySeq,
        files: [...this.files],
        session: this.session,
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      /* সংরক্ষণ ব্যর্থ হলে শুধু মেমরিতে চলে */
    }
  }

  setSession(session: MockSession | null): void {
    this.session = session
    this.save()
    this.emit()
  }

  subscribe(cb: (user: AuthUser | null) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    const user = this.session?.isAdmin ? this.session.user : null
    for (const cb of this.listeners) cb(user)
  }

  nextActivityId(): number {
    return ++this.activitySeq
  }
}

export const photoUrl = (path: string) => MOCK_PHOTO_PREFIX + encodeURI(path)
