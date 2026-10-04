import { createContext, useContext } from 'react'
import type { Lang } from './core'

export interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
}
export const LangContext = createContext<LangCtx>({ lang: 'bn', setLang: () => {} })

/** বর্তমান ভাষা ও বদলানোর ফাংশন (LanguageProvider এর ভেতরে) */
export function useLang(): LangCtx {
  return useContext(LangContext)
}
