import { lt, t } from '@/i18n'
import { useRef, useState } from 'react'
import { getProjectsApi, HousingApiError, type Project } from '@/backend'
import { useToast } from '@/components/useToast'
import { ConfirmDialog } from '@/features/housing/components/ConfirmDialog'
import { SafeImage } from '@/features/housing/components/SafeImage'
import { useAuth } from '@/features/housing/hooks/useAuth'
import { processImage } from '@/features/housing/utils/imageProcessing'
import { PHOTO_SPEC } from '@/features/housing/utils/photoSpec'
import { accentOf } from '@/features/projects/registry'
import { coverSrc } from '@/features/projects/home/cover'
import { card, secondaryButton, smallButton } from '../ui/styles'

/** চুক্তি §৪.১.৮: কভার ≤ ৫ MB (কম্প্রেসের পর) */
const COVER_MAX_BYTES = 5 * 1024 * 1024

interface Props {
  project: Project
  /** অন্য অংশে সংরক্ষণ হয়নি এমন পরিবর্তন — তখন আপলোড বন্ধ (আপলোডের পর পাতা নতুন করে আনে) */
  blocked: boolean
  onChanged: () => Promise<void>
}

/**
 * প্রকল্পের কভার ছবি (M-ধাপ ১৫) — হোম পেইজের কার্ডে। ব্রাউজারে WebP (সর্বোচ্চ ১৬০০px, PHOTO_SPEC) করে
 * `housing/_projects/{key}/cover.webp` এ আপলোড (একই পাথে ওভাররাইট); মোছা শুধু মূল এডমিন।
 * কভার না থাকলে হোমে সর্বশেষ রেকর্ডের ছবি, তাও না থাকলে প্রকল্পের রঙের পটভূমি ও আইকন — এখানেও সেটাই প্রিভিউ।
 */
export function CoverUpload({ project, blocked, onChanged }: Props) {
  const toast = useToast()
  const mainAdmin = useAuth().user?.role === 'main_admin'
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const src = coverSrc(project.cover_path, project.updated_at)
  const accent = accentOf(project.accent)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const { photo } = await processImage(file)
      if (photo.size > COVER_MAX_BYTES) throw new HousingApiError('PAYLOAD_TOO_LARGE', t('কভার ছবি ৫ MB এর বেশি'))
      await getProjectsApi().uploadCover(project.key, photo)
      toast.success(t('কভার ছবি আপলোড হয়েছে'))
      await onChanged()
    } catch (err) {
      setError(HousingApiError.from(err).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await getProjectsApi().deleteCover(project.key)
      setConfirmDelete(false)
      toast.success(t('কভার ছবি মুছে ফেলা হয়েছে'))
      await onChanged()
    } catch (err) {
      setConfirmDelete(false)
      setError(HousingApiError.from(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${card} space-y-3`} data-cover-upload="">
      <div>
        <p className="text-sm font-medium text-slate-700">{t('কভার ছবি (হোম পেইজের কার্ডে)')}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {t('প্রকাশিত প্রকল্পে আসল ছবি দিন। না দিলে হোমে সর্বশেষ রেকর্ডের ছবি, তাও না থাকলে রঙের পটভূমিতে প্রকল্পের নাম দেখাবে।')}
        </p>
      </div>

      <div className="relative aspect-[16/9] w-full max-w-md overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
        {src ? (
          <SafeImage src={src} alt={t('{name} — কভার ছবি', { name: lt(project, 'name') })} className="h-full w-full object-cover" placeholderClassName="h-full w-full" />
        ) : (
          <div className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br px-6 text-center text-white ${accent.gradient}`}>
            <span className="text-xl leading-snug font-bold">{lt(project, 'name')}</span>
            <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-xs">{t('কভার নেই')}</span>
          </div>
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-medium text-slate-700">{t('প্রক্রিয়া চলছে…')}</div>}
      </div>

      {blocked && <p className="text-xs text-amber-800">{t('আগে বাকি পরিবর্তন সংরক্ষণ বা বাতিল করুন, তারপর কভার বদলান।')}</p>}
      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={PHOTO_SPEC.acceptMimes.join(',')}
          className="sr-only"
          id={`cover-${project.key}`}
          disabled={busy || blocked}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
          }}
        />
        <label htmlFor={`cover-${project.key}`} className={`${secondaryButton} cursor-pointer ${busy || blocked ? 'pointer-events-none opacity-50' : ''}`}>
          {src ? t('কভার বদলান') : t('কভার ছবি দিন')}
        </label>
        {src && mainAdmin && (
          <button type="button" className={`${smallButton} text-red-700`} disabled={busy || blocked} onClick={() => setConfirmDelete(true)}>
            {t('কভার মুছুন')}
          </button>
        )}
        <span className="text-xs text-slate-500">{t('jpg/png/webp — নিজে থেকে WebP (সর্বোচ্চ ১৬০০px) হবে')}</span>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t('কভার ছবি মুছবেন?')}
        confirmLabel={t('মুছুন')}
        tone="danger"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      >
        {t('হোমের কার্ডে তখন সর্বশেষ রেকর্ডের ছবি বা রঙের পটভূমি দেখাবে।')}
      </ConfirmDialog>
    </div>
  )
}
