import { getLocale, type MessageKey, t, translate } from './i18n';
import type { Locale } from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function countMessage(locale: Locale | undefined, key: MessageKey, count: number): string {
  return locale ? translate(locale, key, { count }) : translate(getLocale(), key, { count });
}

export function formatRelativeTime(now: number, then: number, locale?: Locale): string {
  const diff = Math.max(0, now - then);
  if (diff < MINUTE) return locale ? translate(locale, 'time.justNow') : t('time.justNow');
  if (diff < HOUR) return countMessage(locale, 'time.minutesAgo', Math.floor(diff / MINUTE));
  if (diff < DAY) return countMessage(locale, 'time.hoursAgo', Math.floor(diff / HOUR));
  if (diff < 30 * DAY) return countMessage(locale, 'time.daysAgo', Math.floor(diff / DAY));
  const date = new Date(then);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatMinutesAgo(minutes: number, now: number = Date.now(), locale?: Locale): string {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return formatRelativeTime(now, now - safeMinutes * MINUTE, locale);
}
