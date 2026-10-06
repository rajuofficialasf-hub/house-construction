import { lt, t } from '@/i18n'
import { useState } from 'react'
import type { Project } from '@/backend'
import { childrenOf, isPublicProject, projectPath } from '@/features/projects/registry'
import { ConfirmDialog } from '@/features/housing/components/ConfirmDialog'
import { formatBanglaNumber } from '@/lib/banglaNumber'
import { inputClass } from '../ui/styles'

/**
 * অপ্রকাশ করার আগে নিশ্চিতকরণ (পরিকল্পনা M-ধাপ ৭): কতটি রেকর্ড আর কোন URL গুলো সবার কাছ থেকে লুকিয়ে যাবে,
 * আর প্রকল্পের বাংলা নাম হুবহু টাইপ করলে তবেই "অপ্রকাশ করুন" চালু হয়।
 */
export function UnpublishDialog({
  project,
  projects,
  records,
  busy,
  onConfirm,
  onCancel,
}: {
  project: Project
  projects: readonly Project[]
  /** প্রকল্পের (গ্রুপ হলে সব উপ-প্রকল্পের) মোট রেকর্ড */
  records: number
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const list = [...projects]
  const hidden = [project, ...childrenOf(project.key, list).filter((c) => isPublicProject(c, list))].map((p) => projectPath(p, list))
  const name = project.name_bn.trim()
  return (
    <ConfirmDialog
      open
      tone="danger"
      title={t('«{name}» অপ্রকাশ করবেন?', { name: lt(project, 'name') })}
      confirmLabel={t('অপ্রকাশ করুন')}
      busy={busy}
      confirmDisabled={typed.trim().normalize('NFC') !== name.normalize('NFC')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          {t('{n}টি রেকর্ড আর নিচের পেইজগুলো দর্শকদের কাছ থেকে লুকিয়ে যাবে (ডাটা মুছবে না; আবার প্রকাশ করলে ফিরে আসবে):', {
            n: formatBanglaNumber(records),
          })}
        </p>
        <ul className="list-inside list-disc font-mono text-xs text-slate-600">
          {hidden.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        <p>{t('শেয়ার করা লিংকগুলো তখন "পেইজটি পাওয়া যায়নি" দেখাবে।')}</p>
        <label className="block">
          <span className="mb-1 block font-medium">{t('নিশ্চিত করতে প্রকল্পের নাম লিখুন: {name}', { name })}</span>
          <input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      </div>
    </ConfirmDialog>
  )
}
