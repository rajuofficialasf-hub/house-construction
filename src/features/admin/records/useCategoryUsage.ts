import { useEffect, useState } from 'react'
import { getProjectsApi, type FieldUsage, type Project } from '@/backend'

/** প্রকল্পের সক্রিয় পাবলিক ক্যাটাগরি ফিল্ড */
export function categoryFields(project: Project) {
  return project.fields.filter((f) => f.type === 'category' && f.visibility === 'public' && f.is_active)
}

export type CategoryUsage = Record<string, FieldUsage['values']>

/**
 * ক্যাটাগরি ফিল্ডের মান ও কতটি রেকর্ডে (project_field_usage, এডমিন) — রেকর্ড-পাতার ফিল্টার আর CategoryValuesPanel দুজনেই।
 * reload বদলালে আবার আনে। ক্যাটাগরি ফিল্ড না থাকলে {} সাথে সাথে।
 */
export function useCategoryUsage(project: Project, reload: number): CategoryUsage | null {
  const keys = categoryFields(project).map((f) => f.key).join(',')
  const [state, setState] = useState<{ for: string; data: CategoryUsage } | null>(null)
  const tag = `${project.key}|${keys}|${reload}`
  useEffect(() => {
    if (!keys) return
    let alive = true
    const api = getProjectsApi()
    Promise.all(keys.split(',').map((k) => api.fieldUsage(project.key, k).then((u) => [k, [...u.values].sort((a, b) => b.n - a.n || a.value.localeCompare(b.value, 'bn'))] as const).catch(() => [k, []] as const)))
      .then((pairs) => alive && setState({ for: tag, data: Object.fromEntries(pairs) }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [keys, project.key, tag])
  if (!keys) return {}
  return state?.for === tag ? state.data : null
}
