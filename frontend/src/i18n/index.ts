import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import esCommon from './locales/es/common.json'
import esAuth from './locales/es/auth.json'
import esFarm from './locales/es/farm.json'
import esField from './locales/es/field.json'
import esEditor from './locales/es/editor.json'
import esPages from './locales/es/pages.json'
import esScouting from './locales/es/scouting.json'
import enCommon from './locales/en/common.json'
import enAuth from './locales/en/auth.json'
import enFarm from './locales/en/farm.json'
import enField from './locales/en/field.json'
import enEditor from './locales/en/editor.json'
import enPages from './locales/en/pages.json'
import enScouting from './locales/en/scouting.json'

// ──────────────────────────────────────────────────────────────────────────
// i18n (SRS: EN+ES). Spanish is the source language — every key exists in
// es/*; missing English falls back to Spanish rather than a bare key. The
// choice persists in localStorage and defaults to the browser language.
// Namespaces mirror the feature areas so dictionary files stay reviewable.
// ──────────────────────────────────────────────────────────────────────────

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: {
        common: esCommon, auth: esAuth, farm: esFarm, field: esField,
        editor: esEditor, pages: esPages, scouting: esScouting,
      },
      en: {
        common: enCommon, auth: enAuth, farm: enFarm, field: enField,
        editor: enEditor, pages: enPages, scouting: enScouting,
      },
    },
    defaultNS: 'common',
    fallbackLng: 'es',
    supportedLngs: ['es', 'en'],
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'mi-finca-lang',
    },
  })

/** BCP-47 tag for date/number formatting that follows the UI language. */
export function dateLocale(): string {
  return i18n.language?.startsWith('en') ? 'en-US' : 'es-PR'
}

const isEnglish = () => i18n.language?.startsWith('en') ?? false

// ── Data-library names ────────────────────────────────────────────────
// Crops, pests, and animals carry both names in their library entries
// (name = English, nameEs = Spanish). These pick by UI language, falling
// back to Spanish for entries without an English name (custom crops).
// Plain functions, not hooks: call them inside components that already
// subscribe via useTranslation so language switches re-render them.

export function localName(
  entity: { name?: string; nameEs: string } | null | undefined,
  fallback = ''
): string {
  if (!entity) return fallback
  return isEnglish() ? (entity.name || entity.nameEs) : entity.nameEs
}

export function localSingular(
  entity: { singular?: string; singularEs: string } | null | undefined,
  fallback = ''
): string {
  if (!entity) return fallback
  return isEnglish() ? (entity.singular || entity.singularEs) : entity.singularEs
}

// Category headers are stored as Spanish strings on the data entries (and
// on user records), so they translate via lookup — unknown (custom)
// categories pass through untouched.
const CATEGORY_EN: Record<string, string> = {
  'Musáceas': 'Bananas & Plantains',
  'Cítricos': 'Citrus',
  'Frutas Tropicales': 'Tropical Fruits',
  'Viandas': 'Root Crops',
  'Árboles': 'Trees',
  'Vegetales': 'Vegetables',
  'Compañeras': 'Companion Plants',
  'Personalizados': 'Custom',
  'Insectos': 'Insects',
  'Enfermedades': 'Diseases',
  'Otros': 'Others',
}

export function localCategory(category: string): string {
  return isEnglish() ? (CATEGORY_EN[category] ?? category) : category
}

export default i18n
