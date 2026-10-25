import { getLocale, translate } from '../../shared/i18n';
import type { Locale, TabFacts } from '../../shared/types';

type WindowFacts = Pick<TabFacts, 'windowId' | 'windowFocused'>;

/** `id` is semantic; `label` is localized presentation text. */
export type WindowLabel = {
  id: number;
  label: string;
};

export function windowLabels(items: Array<{ facts: WindowFacts }>, locale?: Locale): WindowLabel[] {
  const active = locale ?? getLocale();
  const ids = [...new Set(items.map((item) => item.facts.windowId))].sort((a, b) => a - b);
  const focusedId = items.find((item) => item.facts.windowFocused)?.facts.windowId ?? null;
  let otherIndex = 0;

  return ids.map((id) => {
    if (id === focusedId) return { id, label: translate(active, 'window.current') };
    otherIndex += 1;
    return {
      id,
      label:
        focusedId === null
          ? translate(active, 'window.number', { id: otherIndex })
          : translate(active, 'window.other', { index: otherIndex }),
    };
  });
}

export function windowLabelFor(id: number, labels: WindowLabel[], locale?: Locale): string {
  return labels.find((item) => item.id === id)?.label ?? translate(locale ?? getLocale(), 'window.number', { id });
}

export function windowSelectionAvailable(selected: number | 'all', labels: WindowLabel[]): boolean {
  return selected === 'all' || labels.some((item) => item.id === selected);
}
