import type { PhotoKind, ProjectType } from '../../../backend/interfaces/types'

export interface ParsedPhotoName {
  /** ফাইলনামে প্রকল্প না থাকলে null (তখন ড্রপডাউন/--project থেকে নিতে হবে) */
  project_type: ProjectType | null
  serial_no: number
  kind: PhotoKind
}

const PROJECT_ALIAS: Record<string, ProjectType> = {
  semi: 'semi_pucca',
  semi_pucca: 'semi_pucca',
  semipucca: 'semi_pucca',
  tin: 'tin',
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
 * সিরিয়ালের পরে বাড়তি অংশ (যেমন _v2) থাকলে উপেক্ষা। এক্সটেনশন jpg/jpeg/png/webp। বড়/ছোট হাতের অক্ষর যেকোনো।
 * না মিললে null।
 */
export function parsePhotoFilename(fileName: string): ParsedPhotoName | null {
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
    project_type = PROJECT_ALIAS[projRaw.toLowerCase()] ?? null
    if (!project_type) return null // অচেনা প্রিফিক্স
  }
  return { project_type, serial_no, kind }
}
