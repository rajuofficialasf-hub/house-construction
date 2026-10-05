import type { PhotoKind, Project, ProjectKey, ProjectType } from '../../../backend/interfaces/types'

export interface ParsedPhotoName {
  /** ফাইলনামে প্রকল্প না থাকলে null (তখন ড্রপডাউন/--project থেকে নিতে হবে) */
  project_type: ProjectType | null
  serial_no: number
  kind: PhotoKind
}

/** ফাইলনামের প্রিফিক্স → প্রকল্প (ছোট হাতের অক্ষরে) */
export type ProjectAliases = Record<string, ProjectKey>

/**
 * প্রকল্প-রেজিস্ট্রি থেকে প্রিফিক্সের তালিকা: file_prefix (semi), key (semi_pucca), _ ছাড়া key (semipucca)।
 * গ্রুপ বাদ (গ্রুপে ছবি নেই)। একই প্রিফিক্স দুই প্রকল্পে হলে প্রথমটি (file_prefix ডাটাবেসে unique)।
 */
export function buildProjectAliases(projects: readonly Project[]): ProjectAliases {
  const out: ProjectAliases = {}
  for (const p of projects) {
    if (p.is_group) continue
    for (const a of [p.file_prefix, p.key, p.key.replace(/_/g, '')]) {
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
 * গ্রহণযোগ্য: semi_0001_prev.jpg, tin_0012_current.png, semi_pucca-7-before.webp, 0001_current.jpg (প্রকল্প ছাড়া)।
 * প্রিফিক্স চেনা হয় `aliases` দিয়ে (buildProjectAliases — প্রকল্প-রেজিস্ট্রি থেকে)।
 * সিরিয়ালের পরে বাড়তি অংশ (যেমন _v2) থাকলে উপেক্ষা। এক্সটেনশন jpg/jpeg/png/webp। বড়/ছোট হাতের অক্ষর যেকোনো।
 * না মিললে null।
 */
export function parsePhotoFilename(fileName: string, aliases: ProjectAliases): ParsedPhotoName | null {
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  const m = base.match(
    /^(?:([a-z_]+?)[_-])?(\d{1,6})[_-]([a-z]+)(?:[_-][^.]*)?\.(?:jpe?g|png|webp)$/i,
  )
  if (!m) return null
  const [, projRaw, serialRaw, kindRaw] = m
  const kind = KIND_ALIAS[kindRaw.toLowerCase()]
  if (!kind) return null
  const serial_no = Number(serialRaw)
  if (!Number.isInteger(serial_no) || serial_no < 1) return null
  let project_type: ProjectType | null = null
  if (projRaw) {
    project_type = aliases[projRaw.toLowerCase()] ?? null
    if (!project_type) return null // অচেনা প্রিফিক্স
  }
  return { project_type, serial_no, kind }
}
