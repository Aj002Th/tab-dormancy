import type { TabListItem } from '../../shared/types';

export function filterTabs(items: TabListItem[], query: string, windowId: number | 'all'): TabListItem[] {
  const search = query.trim().toLowerCase();
  return items.filter((item) => {
    if (windowId !== 'all' && item.facts.windowId !== windowId) return false;
    if (!search) return true;
    return [item.facts.title, item.facts.url, item.facts.domain].some((value) => value.toLowerCase().includes(search));
  });
}
