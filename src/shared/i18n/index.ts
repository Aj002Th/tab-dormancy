import { browserLanguages, resolveLocale } from '../language';
import type { Locale } from '../types';
import { en } from './en';
import type { Message, MessageParams } from './types';
import { type MessageKey, zh } from './zh';

export type { Message, MessageParams } from './types';
export type { MessageKey } from './zh';

const CATALOGS: Record<Locale, Record<MessageKey, Message>> = { zh, en };
const listeners = new Set<() => void>();

function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh';
  return resolveLocale('system', browserLanguages());
}

let locale: Locale = detectLocale();

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  if (next === locale) return;
  locale = next;
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function translate(next: Locale, key: MessageKey, params: MessageParams = {}): string {
  const message = CATALOGS[next][key];
  if (typeof message === 'function') return message(params);
  return message.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function t(key: MessageKey, params: MessageParams = {}): string {
  return translate(locale, key, params);
}
