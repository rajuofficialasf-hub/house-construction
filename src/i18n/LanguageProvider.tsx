import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SITE_NAME } from '@/config/site'
import { LANG_STORAGE_KEY, setCurrentLang, t, type Lang } from './core'
import { LangContext, useLang } from './langContext'

// ---------------------------------------------------------------- Provider
function readStored(): Lang {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY)
    return v === 'en' ? 'en' : 'bn'
  } catch {
    return 'bn'
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = typeof window === 'undefined' ? 'bn' : readStored()
    setCurrentLang(l) // রেন্ডারের আগেই গ্লোবাল সেট (children এর t()/সংখ্যা সঠিক ভাষা পায়)
    return l
  })

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t(SITE_NAME) // ট্যাবের শিরোনামও ভাষা অনুযায়ী
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang)
    } catch {
      /* private mode */
    }
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setCurrentLang(l)
    setLangState(l)
  }, [])
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])
  // key={lang}: ভাষা বদলালে পুরো অ্যাপ নতুন করে রেন্ডার — সব t() ও সংখ্যা এক ধাপে বদলায়
  return (
    <LangContext.Provider value={value}>
      <div key={lang} className="contents">
        {children}
      </div>
    </LangContext.Provider>
  )
}

/** হেডারের ভাষা টগল (বাং | EN) */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang()
  const btn = (l: Lang, label: string) => (
    <button
      type="button"
      onClick={() => setLang(l)}
      aria-pressed={lang === l}
      lang={l}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${lang === l ? 'bg-white text-brand-800' : 'text-white/85 hover:bg-white/15'}`}
    >
      {label}
    </button>
  )
  return (
    <div role="group" aria-label={t('ভাষা')} className={`inline-flex items-center gap-0.5 rounded-full bg-white/15 p-0.5 ring-1 ring-white/30 ${className}`}>
      {btn('bn', 'বাং')}
      {btn('en', 'EN')}
    </div>
  )
}
