import { factLabel, getLocale, type MessageKey, type MessageParams, translate } from '../../shared/i18n';
import { formatMinutesAgo } from '../../shared/time';
import type { FactKey, FactValue, Locale, TraceNode } from '../../shared/types';

const COUNT_FACTS = new Set<FactKey>(['totalTabCount', 'windowTabCount']);

function message(locale: Locale | undefined, key: MessageKey, params: MessageParams = {}): string {
  return translate(locale ?? getLocale(), key, params);
}

export function traceFactLabel(fact: FactKey, locale?: Locale): string {
  return factLabel(fact, locale);
}

function baseValue(value: FactValue | null | undefined, locale?: Locale): string {
  if (value === null || value === undefined) return message(locale, 'trace.unknown');
  if (typeof value === 'boolean') return message(locale, value ? 'app.yes' : 'app.no');
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(message(locale, 'listSeparator')) : message(locale, 'app.empty');
  }
  if (typeof value === 'string') return value === '' ? message(locale, 'app.empty') : value;
  return String(value);
}

export function formatTraceValue(fact: FactKey, value: FactValue | null | undefined, locale?: Locale): string {
  if (typeof value === 'number') {
    if (fact === 'lastActiveMinutes') {
      return message(locale, 'trace.minutes', {
        value,
        relative: formatMinutesAgo(value, Date.now(), locale),
      });
    }
    if (COUNT_FACTS.has(fact)) return message(locale, 'trace.count', { count: value });
  }
  return baseValue(value, locale);
}

export function formatTraceExpected(fact: FactKey, value: FactValue | null | undefined, locale?: Locale): string {
  if (value === null || value === undefined) return message(locale, 'trace.notSet');
  if (typeof value === 'number' && COUNT_FACTS.has(fact)) return message(locale, 'trace.count', { count: value });
  if (typeof value === 'number' && fact === 'lastActiveMinutes') {
    return message(locale, 'trace.minutesExpected', { value });
  }
  return baseValue(value, locale);
}

export function traceResultLabel(node: Pick<TraceNode, 'result' | 'reason'>, locale?: Locale): string {
  if (node.result) return message(locale, 'trace.matched');
  if (node.reason === 'unknown') return message(locale, 'trace.unknown');
  if (node.reason === 'unsupported') return message(locale, 'trace.unsupported');
  return message(locale, 'trace.notMatched');
}
