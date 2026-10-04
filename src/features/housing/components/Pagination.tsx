import { t } from '@/i18n'
import { formatBanglaNumber, toBanglaNumber } from '@/lib/banglaNumber'
import type { PageMeta } from '../backend/interfaces/types'

interface Props {
  meta: PageMeta
  onPageChange: (page: number) => void
  disabled?: boolean
}

/** দেখানোর জন্য পেইজ নম্বরের তালিকা: ১ … বর্তমান±১ … শেষ ('…' = ellipsis) */
function pageItems(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const set = new Set<number>([1, total, current - 1, current, current + 1])
  if (current <= 3) [2, 3, 4].forEach((n) => set.add(n))
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => set.add(n))
  const pages = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) out.push('…')
    out.push(n)
  })
  return out
}

/**
 * সার্ভার-সাইড পেজিনেশনের কন্ট্রোল: "মোট X টির মধ্যে Y–Z দেখানো হচ্ছে", আগের/পরের, পেইজ নম্বর।
 */
export function Pagination({ meta, onPageChange, disabled = false }: Props) {
  const { page, page_size, total, total_pages } = meta
  const from = total === 0 ? 0 : (page - 1) * page_size + 1
  const to = Math.min(total, page * page_size)
  const items = pageItems(page, total_pages)

  const btn =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'
  const idle = 'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:text-brand-700'
  const active = 'border-brand-700 bg-brand-700 text-white'

  return (
    <nav aria-label={t('পেজিনেশন')} className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-sm text-slate-600" aria-live="polite">
        {t('মোট {total} টির মধ্যে {from}–{to} দেখানো হচ্ছে', { total: formatBanglaNumber(total), from: toBanglaNumber(from), to: toBanglaNumber(to) })}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          className={`${btn} ${idle}`}
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('আগের পেইজ')}
        >
          {t('‹ আগের')}
        </button>
        {items.map((it, i) =>
          it === '…' ? (
            <span key={`e${i}`} className="px-1 text-slate-400" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              className={`${btn} ${it === page ? active : idle}`}
              disabled={disabled}
              aria-current={it === page ? 'page' : undefined}
              aria-label={t('পেইজ {n}', { n: toBanglaNumber(it) })}
              onClick={() => it !== page && onPageChange(it)}
            >
              {toBanglaNumber(it)}
            </button>
          ),
        )}
        <button
          type="button"
          className={`${btn} ${idle}`}
          disabled={disabled || page >= total_pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('পরের পেইজ')}
        >
          {t('পরের ›')}
        </button>
      </div>
    </nav>
  )
}
