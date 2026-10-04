import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '@/i18n'

interface Props {
  children: ReactNode
  /** বক্সের শিরোনাম (ডিফল্ট: "কিছু একটা ভুল হয়েছে") */
  title?: string
  /** ছোট (ইনলাইন) বক্স — যেমন মানচিত্রের জায়গায় */
  compact?: boolean
}
interface State {
  error: Error | null
}

/**
 * রেন্ডারে কোনো JS error হলে পুরো পেইজ সাদা না হয়ে এই বক্স দেখায় — ত্রুটির বার্তা ও "আবার চেষ্টা"/"রিলোড"।
 * বার্তাটি ব্যবহারকারী দেখে জানাতে পারেন (console-ও পায়)। App (পেইজ-স্তর) ও মানচিত্রের চারপাশে ব্যবহৃত।
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const { title, compact = false } = this.props
    return (
      <div role="alert" className={`rounded-xl border border-red-200 bg-red-50 text-red-900 ${compact ? 'p-4' : 'container-page my-10 p-6'}`}>
        <p className="font-semibold">{title ?? t('কিছু একটা ভুল হয়েছে')}</p>
        <p className="mt-1 text-sm text-red-800">{t('ত্রুটির বার্তা (সাপোর্টকে জানাতে পারেন):')}</p>
        <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-white/70 p-2 text-xs break-words whitespace-pre-wrap text-red-900">
          {error.name}: {error.message}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="inline-flex h-10 items-center rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-600"
          >
            {t('আবার চেষ্টা করুন')}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center rounded-md border border-red-300 bg-white px-4 text-sm font-medium text-red-800 hover:bg-red-100"
          >
            {t('পেইজ রিলোড করুন')}
          </button>
        </div>
      </div>
    )
  }
}
