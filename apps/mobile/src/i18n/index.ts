// All strings are externalised (NFR-I18N-01): English and Spanish (M7-T14). The language follows
// the phone unless the member picks one in Settings (kept on this phone).
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import es from './es.json';

export const LANGUAGES = ['en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];
const KEY = 'vf.lang';

/** First supported language among the phone's preferences, else English. */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if ((LANGUAGES as readonly string[]).includes(base ?? '')) return base as Language;
  }
  return 'en';
}

const phoneLanguages = () => {
  try {
    return getLocales().map((l) => l.languageTag);
  } catch {
    return [];
  }
};

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: detectLanguage(phoneLanguages()),
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
});

const isLanguage = (v: string | null): v is Language =>
  (LANGUAGES as readonly string[]).includes(v ?? '');

/** The member's explicit choice, or null when following the phone. */
export async function storedLanguage(): Promise<Language | null> {
  const v = await SecureStore.getItemAsync(KEY).catch(() => null);
  return isLanguage(v) ? v : null;
}

/** Picks a language, or null to follow the phone again. */
export async function setLanguage(lng: Language | null): Promise<void> {
  if (lng) await SecureStore.setItemAsync(KEY, lng);
  else await SecureStore.deleteItemAsync(KEY);
  await i18n.changeLanguage(lng ?? detectLanguage(phoneLanguages()));
}

// Apply a stored choice once it has been read.
void storedLanguage().then((lng) => {
  if (lng && lng !== i18n.language) void i18n.changeLanguage(lng);
});

export default i18n;

/** Translates an API error code (or any error) into a message. */
export function errorText(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  return i18n.t(code ? `errors.${code}` : 'errors.generic', {
    defaultValue: i18n.t('errors.generic'),
  });
}

/**
 * "5 minutes ago", "in 3 days". Hermes (the app's JS engine) has no Intl.RelativeTimeFormat, and
 * calling it crashed the Android app, so the phrases come from the catalogue instead.
 */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const units: [string, number][] = [
    ['day', 86400e3],
    ['hour', 3600e3],
    ['minute', 60e3],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) {
      const n = Math.round(Math.abs(diff) / ms);
      const amount = i18n.t(`time.${unit}${n === 1 ? '' : 's'}`, { count: n });
      return i18n.t(diff < 0 ? 'time.ago' : 'time.in', { amount });
    }
  }
  return i18n.t('time.now');
}
