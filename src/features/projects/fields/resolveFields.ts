/**
 * resolveFields(project) — একটি প্রকল্পের সব ফিল্ড এক তালিকায় (পরিকল্পনা §৫.১৪): সিস্টেম ফিল্ড (প্রকল্পের core_fields
 * অনুযায়ী লেবেল/চালু/আবশ্যক) তারপর কাস্টম ফিল্ড (project_fields, sort_order ক্রমে)। ফর্ম, ইম্পোর্ট, টেবিল, বিস্তারিত,
 * CSV সবাই এই তালিকা থেকে চলবে।
 */
import type { ExtraValues, HousingRecord, Project, ProjectField } from '@/backend'
import { ALWAYS_REQUIRED, SYSTEM_FIELDS } from './systemFields'
import type { FieldDef, FieldValue } from './fieldValues'

export interface ResolveOptions {
  /** গোপন ফিল্ড (এডমিন) — ডিফল্ট true; পাবলিক পেইজে false দিন (anon এর কাছে এমনিতেই আসে না) */
  includePrivate?: boolean
  /** আর্কাইভ করা কাস্টম ফিল্ড (পুরনো মান দেখাতে/এক্সপোর্টে) — ডিফল্ট false */
  includeArchived?: boolean
}

/** project_fields এর সারি → FieldDef */
export function fieldFromProject(f: ProjectField): FieldDef {
  return {
    key: f.key,
    source: f.visibility === 'admin' ? 'private' : 'extra',
    type: f.type,
    label_bn: f.label_bn,
    label_en: f.label_en,
    help_bn: f.help_bn,
    help_en: f.help_en,
    required: f.required,
    visibility: f.visibility,
    max_length: f.max_length,
    min_value: f.min_value,
    max_value: f.max_value,
    show_in_table: f.show_in_table,
    show_in_card: f.show_in_card,
    show_in_detail: f.show_in_detail,
    filterable: f.filterable,
    searchable: f.searchable,
    fill_down: f.fill_down,
    import_aliases: f.import_aliases,
    sort_order: f.sort_order,
    is_active: f.is_active,
  }
}

export function resolveFields(project: Project, opts: ResolveOptions = {}): FieldDef[] {
  const includePrivate = opts.includePrivate ?? true
  const core = project.core_fields ?? {}
  const system = SYSTEM_FIELDS.filter((f) => {
    if (f.key === 'union_name') return project.geo_depth === 'union'
    if (ALWAYS_REQUIRED.includes(f.key)) return true
    return core[f.key]?.enabled !== false
  }).map((f) => {
    const c = core[f.key] ?? {}
    return {
      ...f,
      label_bn: c.label_bn?.trim() || f.label_bn,
      label_en: c.label_en?.trim() || f.label_en,
      required: ALWAYS_REQUIRED.includes(f.key) ? true : (c.required ?? f.required),
    }
  })
  const custom = [...project.fields]
    .filter((f) => (opts.includeArchived || f.is_active) && (includePrivate || f.visibility === 'public'))
    .sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key))
    .map(fieldFromProject)
  return [...system, ...custom]
}

/** রেকর্ড (আর এডমিনের গোপন মান) থেকে একটি ফিল্ডের মান — Cell/CSV এর জন্য */
export function fieldValue(def: FieldDef, record: HousingRecord, privateValues?: ExtraValues | null): FieldValue | null {
  if (def.source === 'system') {
    const v = (record as unknown as Record<string, unknown>)[def.key]
    return typeof v === 'string' || typeof v === 'number' ? v : null
  }
  const v = def.source === 'extra' ? record.extra?.[def.key] : privateValues?.[def.key]
  return v === undefined ? null : v
}
