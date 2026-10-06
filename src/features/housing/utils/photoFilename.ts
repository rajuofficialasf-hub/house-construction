import type { PhotoKind, PhotoMode, Project, ProjectKey, ProjectType } from '../../../backend/interfaces/types'

export interface ParsedPhotoName {
  /** ফাইলনামে প্রকল্প না থাকলে null (তখন ড্রপডাউন/--project থেকে নিতে হবে) */
  project_type: ProjectType | null
  serial_no: number
  /** ফাইলনামে আগে/পরে লেখা না থাকলে null — প্রকল্পের ছবি মোড দেখে ঠিক হয় (photoTarget) */
  kind: PhotoKind | null
}

/** ফাইলনামের প্রিফিক্স → প্রকল্প (ছোট হাতের অক্ষরে) */
export type ProjectAliases = Record<string, ProjectKey>

/**
 * প্রকল্প-রেজিস্ট্রি থেকে প্রিফিক্সের তালিকা (M-ধাপ ১২): file_prefix (semi, sr, sr2), key (semi_pucca), _ ছাড়া key (semipucca),
 * slug (self-reliance), - ছাড়া slug (selfreliance)। গ্রুপ বাদ (গ্রুপে ছবি নেই)। একই প্রিফিক্স দুই প্রকল্পে হলে প্রথমটি
 * (file_prefix ডাটাবেসে unique)।
 */
export function buildProjectAliases(projects: readonly Project[]): ProjectAliases {
  const out: ProjectAliases = {}
  for (const p of projects) {
    if (p.is_group) continue
    for (const a of [p.file_prefix, p.key, p.key.replace(/_/g, ''), p.slug, p.slug?.replace(/-/g, '')]) {
      if (a && !(a.toLowerCase() in out)) out[a.toLowerCase()] = p.key
    }
  }
  return out
}

const KIND_ALIAS: Record<string, PhotoKind> = {
  prev: 'prev',
  previous: 'prev',
  before: 'prev',
  old: 'prev',
  current: 'current',
  curr: 'current',
  after: 'current',
  now: 'current',
  new: 'current',
}

/**
 * ফাইলনাম → প্রকল্প, সিরিয়াল, ছবির ধরন।
 * গ্রহণযোগ্য: semi_0001_prev.jpg, tin_0012_current.png, semi_pucca-7-before.webp, self-reliance-0003.jpg,
 *   sr2_0004_after.png, demo_0001.jpg (আগে/পরে নেই → kind null), 0001_current.jpg (প্রকল্প ছাড়া)।
 * প্রিফিক্স (অঙ্কসহ) চেনা হয় `aliases` দিয়ে (buildProjectAliases — প্রকল্প-রেজিস্ট্রি থেকে); অচেনা প্রিফিক্স → null।
 * সিরিয়ালের পরের অচেনা শব্দ (যেমন _v2, _photo) উপেক্ষা। এক্সটেনশন jpg/jpeg/png/webp। বড়/ছোট হাতের অক্ষর যেকোনো।
 */
export function parsePhotoFilename(fileName: string, aliases: ProjectAliases): ParsedPhotoName | null {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  const m = base.match(/^(?:([a-z0-9][a-z0-9_-]*?)[_-])?(\d{1,6})(?:[_-]([a-z]+))?(?:[_-][^.]*)?\.(?:jpe?g|png|webp)$/i)
  if (!m) return null
  const [, projRaw, serialRaw, kindRaw] = m
  const serial_no = Number(serialRaw)
  if (!Number.isInteger(serial_no) || serial_no < 1) return null
  let project_type: ProjectType | null = null
  if (projRaw) {
    project_type = aliases[projRaw.toLowerCase()] ?? null
    if (!project_type) return null // অচেনা প্রিফিক্স
  }
  const kind = kindRaw ? (KIND_ALIAS[kindRaw.toLowerCase()] ?? null) : null
  return { project_type, serial_no, kind }
}

export type PhotoTarget = { ok: true; kind: PhotoKind } | { ok: false; reason: 'no_photos' | 'prev_not_allowed' | 'kind_missing' }

/**
 * ছবি মোড অনুযায়ী আসল ঘর: শুধু-পরে প্রকল্পে আগে/পরে না লেখা থাকলে current; সেখানে prev লেখা থাকলে ভুল
 * (লাল বার্তা); আগে-পরে প্রকল্পে আগে/পরে লেখা আবশ্যক; ছবিহীন প্রকল্পে সব ভুল।
 */
export function photoTarget(kind: PhotoKind | null, mode: PhotoMode): PhotoTarget {
  if (mode === 'none') return { ok: false, reason: 'no_photos' }
  if (mode === 'after_only') return kind === 'prev' ? { ok: false, reason: 'prev_not_allowed' } : { ok: true, kind: 'current' }
  return kind ? { ok: true, kind } : { ok: false, reason: 'kind_missing' }
}

/** উদাহরণের ফাইলনাম (প্রকল্পের প্রিফিক্সে): semi_0001_prev.jpg / demo_0001.jpg */
export function photoNameExamples(project: Pick<Project, 'file_prefix' | 'key' | 'photo_mode'>): string[] {
  const prefix = project.file_prefix || project.key
  return project.photo_mode === 'before_after' ? [`${prefix}_0001_prev.jpg`, `${prefix}_0001_current.jpg`] : project.photo_mode === 'after_only' ? [`${prefix}_0001.jpg`] : []
}
