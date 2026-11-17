import { createContext, useContext } from 'react'
import sw from '#/locales/sw.json'

export type Lang = 'sw' | 'en'

/**
 * English is the key; Swahili comes from the team's sheet (approved 14 Nov 2026).
 * Workflow: `python3 scripts/i18n/export.py` writes design/translations/Shopi-translations.xlsx,
 * the team checks the Swahili column, `python3 scripts/i18n/import.py <file>` writes src/locales/sw.json.
 * Sellers read the app in their own language (the `shopi_lang` cookie); buyers see a shop in the language its
 * seller chose (`shops.lang`).
 */
export const SWAHILI_ENABLED = true

const SW: Record<string, string> = sw

/** The languages a shop can be in, each named in itself. */
export const LANGUAGES: [Lang, string][] = [
  ['sw', 'Kiswahili'],
  ['en', 'English'],
]

/** A stored language ('sw' or 'en', a cookie or `shops.lang`) as one the app can show. */
export const asLang = (v: unknown): Lang => (SWAHILI_ENABLED && v === 'sw' ? 'sw' : 'en')

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

/** A translate function, as `useT()` returns it, for helpers outside components. */
export type T = (en: string, vars?: Vars) => string

/** Marks English text kept in data (categories, statuses) so the extractor finds it. Translate with t(value) when shown. */
export const msg = (en: string) => en
