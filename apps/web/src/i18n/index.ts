// All UI strings are externalised (NFR-I18N-01): English and Spanish (M7-T14). The language
// follows the browser unless the member picks one in Settings (kept in this browser only).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import es from './es.json';

export const LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];
const KEY = 'vf-lang';

/** The member's explicit choice, or null to follow the browser. */
export function storedLanguage(): Language | null {
  try {
    const v = localStorage.getItem(KEY);
    return (LANGUAGES as readonly string[]).includes(v ?? '') ? (v as Language) : null;
  } catch {
    return null;
  }
}

/** First supported language among the browser's preferences, else English. */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if ((LANGUAGES as readonly string[]).includes(base ?? '')) return base as Language;
  }
  return 'en';
}

const browserLanguages = () =>
  typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);

function apply(lng: Language) {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
}

/** Picks a language, or null to follow the browser again. */
export async function setLanguage(lng: Language | null): Promise<void> {
  try {
    if (lng) localStorage.setItem(KEY, lng);
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the choice lasts for this page only
  }
  const next = lng ?? detectLanguage(browserLanguages());
  await i18n.changeLanguage(next);
  apply(next);
}

const initial = storedLanguage() ?? detectLanguage(browserLanguages());
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: initial,
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
});
apply(initial);

export default i18n;

const rtf = () => new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' });
const dtf = () =>
  new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

/** Locale-aware absolute date-time (NFR-I18N-01). */
export function formatDateTime(iso: string): string {
  return dtf().format(new Date(iso));
}

/** Locale-aware relative time such as "in 3 days" or "5 minutes ago". */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86400e3],
    ['month', 30 * 86400e3],
    ['week', 7 * 86400e3],
    ['day', 86400e3],
    ['hour', 3600e3],
    ['minute', 60e3],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf().format(Math.round(diff / ms), unit);
  }
  return rtf().format(Math.round(diff / 1000), 'second');
}

/** Locale-aware byte size such as "1.5 GB". */
export function formatBytes(bytes: number): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return new Intl.NumberFormat(i18n.language, {
    style: 'unit',
    unit: units[i],
    unitDisplay: 'short',
    maximumFractionDigits: i === 0 ? 0 : 1,
  }).format(value);
}
