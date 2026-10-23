import type { TabFacts } from '../../shared/types';

type WindowFacts = Pick<TabFacts, 'windowId' | 'windowFocused'>;

export type WindowLabel = {
  id: number;
  label: string;
};

export function windowLabels(items: Array<{ facts: WindowFacts }>): WindowLabel[] {
  const ids = [...new Set(items.map((item) => item.facts.windowId))].sort((a, b) => a - b);
  const focusedId = items.find((item) => item.facts.windowFocused)?.facts.windowId ?? null;
  let otherIndex = 0;

  return ids.map((id) => {
    if (id === focusedId) return { id, label: '当前窗口' };
    otherIndex += 1;
    return { id, label: focusedId === null ? `窗口 ${otherIndex}` : `其他窗口 ${otherIndex}` };
  });
}

export function windowLabelFor(id: number, labels: WindowLabel[]): string {
  return labels.find((item) => item.id === id)?.label ?? `窗口 ${id}`;
}

export function windowSelectionAvailable(selected: number | 'all', labels: WindowLabel[]): boolean {
  return selected === 'all' || labels.some((item) => item.id === selected);
}
