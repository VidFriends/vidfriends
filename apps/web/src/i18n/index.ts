// All UI strings are externalised (NFR-I18N-01). English only in v1.
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
