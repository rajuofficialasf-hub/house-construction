/**
 * প্রকাশের চেকলিস্ট (পরিকল্পনা M-ধাপ ৭):
 *   আটকায় (blocking): দুই ভাষায় নাম; অন্তত ১টি স্ট্যাট কার্ড; উপ-প্রকল্প হলে গ্রুপও প্রকাশিত।
 *   শুধু সতর্ক (warnings): ইংরেজি লেখা খালি (বর্ণনা, একক, ছবির লেবেল, কার্ড ও ফিল্ডের লেবেল);
 *                          ক্যাটাগরিতে কাছাকাছি বানানের মান (যেমন "গাভী"/"গাভি") — ডাটা থাকলে।
 */
import type { Project, ProjectStats } from '@/backend'
import { lt, t } from '@/i18n'
import { nearDuplicates } from '@/lib/fuzzyMatch'

export interface PublishCheck {
  blocking: string[]
  warnings: string[]
}

const empty = (s: string | null | undefined) => !s || s.trim() === ''

export function publishChecklist(project: Project, projects: readonly Project[], stats?: ProjectStats | null): PublishCheck {
  const blocking: string[] = []
  const warnings: string[] = []

  if (empty(project.name_bn) || empty(project.name_en)) blocking.push(t('বাংলা ও ইংরেজি দুই নামই দিন'))
  if (!project.stat_cards.length) blocking.push(t('অন্তত একটি পরিসংখ্যান কার্ড লাগবে'))
  if (project.parent_key) {
    const parent = projects.find((p) => p.key === project.parent_key)
    if (!parent?.is_published) blocking.push(t('আগে গ্রুপ «{name}» প্রকাশ করুন', { name: lt(parent, 'name') || project.parent_key }))
  }

  const missingEn: string[] = []
  if (!empty(project.summary_bn) && empty(project.summary_en)) missingEn.push(t('ছোট বর্ণনা'))
  if (!empty(project.description_bn) && empty(project.description_en)) missingEn.push(t('পরিচিতি'))
  if (!empty(project.unit_bn) && empty(project.unit_en)) missingEn.push(t('একক শব্দ'))
  if (!project.is_group && project.photo_mode === 'before_after' && !empty(project.prev_label_bn) && empty(project.prev_label_en)) missingEn.push(t('পূর্বের ছবির লেবেল'))
  if (!project.is_group && project.photo_mode !== 'none' && !empty(project.current_label_bn) && empty(project.current_label_en)) missingEn.push(t('বর্তমান ছবির লেবেল'))
  for (const c of project.stat_cards) if (empty(c.label_en)) missingEn.push(t('কার্ড «{name}»', { name: c.label_bn }))
  for (const f of project.fields) if (f.is_active && empty(f.label_en)) missingEn.push(t('ফিল্ড «{name}»', { name: f.label_bn }))
  if (missingEn.length) warnings.push(t('ইংরেজি খালি (ইংরেজি মোডে বাংলা দেখাবে): {list}', { list: missingEn.join(', ') }))

  for (const f of project.fields) {
    if (f.type !== 'category' || !f.is_active) continue
    const fs = stats?.fields?.[f.key]
    const values = fs && fs.type === 'category' ? Object.keys(fs.by_value ?? {}) : []
    const pairs = nearDuplicates(values)
    if (pairs.length) {
      warnings.push(
        t('«{field}» এ কাছাকাছি বানানের মান — এক করবেন? {pairs}', {
          field: f.label_bn,
          pairs: pairs.slice(0, 5).map((p) => `"${p.a}" / "${p.b}"`).join(', '),
        }),
      )
    }
  }
  return { blocking, warnings }
}
