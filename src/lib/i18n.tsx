import { createContext, useContext } from 'react'
import sw from '#/locales/sw.json'

export type Lang = 'sw' | 'en'

/**
 * English is the source language and the only one shown until the team's Swahili file is in.
 * Workflow: `python3 scripts/i18n/export.py` writes design/translations/RIZK-translations.xlsx,
 * the team fills the Swahili column, `python3 scripts/i18n/import.py <file>` writes src/locales/sw.json,
 * then flip this to true.
 */
export const SWAHILI_ENABLED = false

const SW: Record<string, string> = sw

const LangContext = createContext<Lang>('en')
export const LangProvider = LangContext.Provider
export function useLang(): Lang {
  const lang = useContext(LangContext)
  return SWAHILI_ENABLED ? lang : 'en'
}

type Vars = Record<string, string | number>

/** The English text is the key. Placeholders look like {name}. Missing Swahili falls back to English. */
export function translate(lang: Lang, en: string, vars?: Vars) {
  const text = lang === 'sw' && SW[en] ? SW[en] : en
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text
}

export function useT() {
  const lang = useLang()
  return (en: string, vars?: Vars) => translate(lang, en, vars)
}

/** Marks English text kept in data (categories, statuses) so the extractor finds it. Translate with t(value) when shown. */
export const msg = (en: string) => en
