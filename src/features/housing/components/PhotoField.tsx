import { t } from '@/i18n'
import { useEffect, useRef, useState } from 'react'
import type { HousingRecord, PhotoKind } from '../../../backend/interfaces/types'
import { photoSrc } from '../utils/imagePath'
import { createUploadItems, revokeUploadItems, type UploadItem } from '../utils/uploadItems'
import { ImageUploader } from './ImageUploader'
import { SafeImage } from './SafeImage'

const KIND_LABEL: Record<PhotoKind, string> = { prev: 'পূর্বের ঘরের ছবি', current: 'বর্তমান ঘরের ছবি' }

interface Props {
  kind: PhotoKind
  /** এডিট মোডে বিদ্যমান রেকর্ড (থাকা ছবি দেখাতে) */
  record?: HousingRecord | null
  /** নির্বাচিত নতুন ফাইল (একটি) — parent এ রাখা হয়, সেভের সময় আপলোড */
  item: UploadItem | null
  onChange: (item: UploadItem | null) => void
  /** বিদ্যমান ছবি মোছার অনুরোধ (parent নিশ্চিতকরণ + API করে) */
  onDeleteExisting?: () => void
  disabled?: boolean
}

/**
 * ফর্মের একক ছবি ফিল্ড: বিদ্যমান ছবি (থাকলে) + ImageUploader (একটি ফাইল) + নতুন ফাইলের প্রিভিউ।
 * নতুন ফাইল দিলে সেভের সময় সিরিয়াল-ভিত্তিক পাথে ওভাররাইট হয় (HousingApi.uploadPhoto)।
 */
export function PhotoField({ kind, record, item, onChange, onDeleteExisting, disabled = false }: Props) {
  const existing = record ? photoSrc(record[`${kind}_thumb_url`], record.photo_updated_at) : null
  const existingFull = record ? record[`${kind}_photo_url`] : null
  const [items, setItems] = useState<UploadItem[]>(item ? [item] : [])

  // parent item বদলালে (যেমন সেভের পর null) সিঙ্ক
  const lastItem = useRef(item)
  useEffect(() => {
    if (lastItem.current !== item) {
      lastItem.current = item
      setItems(item ? [item] : [])
    }
  }, [item])

  const add = (files: File[]) => {
    const [first] = createUploadItems(files.slice(0, 1))
    if (!first) return
    setItems((prev) => {
      revokeUploadItems(prev)
      return [first]
    })
    onChange(first)
  }
  const remove = () => {
    setItems((prev) => {
      revokeUploadItems(prev)
      return []
    })
    onChange(null)
  }

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-slate-800">{t(KIND_LABEL[kind])}</legend>

      {existingFull && (
        <div className="mb-3 flex items-center gap-3">
          <SafeImage src={existing} alt={`${t(KIND_LABEL[kind])} (${t('বর্তমানে সংরক্ষিত')})`} className="h-20 w-20 rounded-md object-cover" placeholderClassName="h-20 w-20 rounded-md" />
          <div className="text-xs text-slate-600">
            <p className="font-medium text-slate-700">{t('বর্তমানে সংরক্ষিত ছবি')}</p>
            <p>{t('নতুন ছবি দিলে এটি প্রতিস্থাপিত হবে (একই সিরিয়াল পাথে)।')}</p>
            {onDeleteExisting && (
              <button type="button" onClick={onDeleteExisting} className="mt-1 text-red-700 underline-offset-2 hover:underline">
                {t('এই ছবি মুছুন')}
              </button>
            )}
          </div>
        </div>
      )}

      <ImageUploader items={items} onAdd={add} onRemove={remove} multiple={false} disabled={disabled} showList />
    </fieldset>
  )
}
