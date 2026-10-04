// All strings are externalised (NFR-I18N-01); English only in v1.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
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
