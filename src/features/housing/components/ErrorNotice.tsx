import { t } from '@/i18n'
import type { HousingApiError } from '../backend/interfaces/types'

interface Props {
  title: string
  error: HousingApiError
}

/** অ্যাডাপ্টারের এরর → বাংলা বার্তা (কারণভেদে ইঙ্গিত) */
export function ErrorNotice({ title, error }: Props) {
  const hint =
    error.code === 'CONFIG_ERROR'
      ? t('ব্যাকএন্ড সংযোগ কনফিগার করা হয়নি (.env.local দেখুন)।')
      : error.code === 'NETWORK_ERROR'
        ? t('ইন্টারনেট সংযোগ বা সার্ভারে সমস্যা।')
        : error.code === 'NOT_IMPLEMENTED'
          ? t('এই ব্যাকএন্ড অ্যাডাপ্টার এখনো তৈরি হয়নি।')
          : null
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">{title}</p>
      <p className="mt-1">{hint ?? error.message}</p>
    </div>
  )
}
