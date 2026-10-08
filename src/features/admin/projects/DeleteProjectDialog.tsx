import { lt, t } from '@/i18n'
import { useState } from 'react'
import type { Project } from '@/backend'
import { ConfirmDialog } from '@/features/housing/components/ConfirmDialog'
import { inputClass } from '../ui/styles'

/**
 * মোছার আগে নিশ্চিতকরণ: প্রকল্পের বাংলা নাম হুবহু টাইপ করলে তবেই "মুছুন" চালু হয়, অপ্রকাশের ডায়ালগের
 * মতোই, যাতে এক ক্লিকে কিছু মুছে না যায়। সার্ভার বা ডাটাবেস আটকালে বার্তাটি এখানেই দেখায় আর ডায়ালগ
 * খোলা থাকে, নইলে বন্ধ ডায়ালগের পেছনে কারণটি হারিয়ে যেত।
 * (R3, R5, docs/plans/2026-10-08-1105-feat-project-delete-plan.md)
 */
export function DeleteProjectDialog({
  project,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  project: Project
  busy: boolean
  /** সার্ভারের প্রত্যাখ্যানের বার্তা; null হলে কিছু দেখায় না */
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const name = project.name_bn.trim()
  return (
    <ConfirmDialog
      open
      tone="danger"
      title={t('«{name}» মুছে ফেলবেন?', { name: lt(project, 'name') })}
      confirmLabel={t('মুছুন')}
      busy={busy}
      confirmDisabled={typed.trim().normalize('NFC') !== name.normalize('NFC')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>{t('প্রকল্পটি, এর ফিল্ডগুলো আর কভার ছবি মুছে যাবে। এটি ফেরানো যায় না।')}</p>
        <label className="block">
          <span className="mb-1 block font-medium">{t('নিশ্চিত করতে প্রকল্পের নাম লিখুন: {name}', { name })}</span>
          <input className={inputClass} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            {error}
          </p>
        )}
      </div>
    </ConfirmDialog>
  )
}
