import type { CleanupPreview } from '../../shared/types';
import { domainOf } from '../../shared/url';

const VISIBLE_SAMPLE = 3;

export type PopupSampleItem = {
  tabId: number;
  title: string;
  domain: string;
};

export type PopupSample = {
  items: PopupSampleItem[];
  hasMore: boolean;
};

export function popupSample(preview: CleanupPreview): PopupSample {
  const items = preview.sample.slice(0, VISIBLE_SAMPLE).map((tab) => {
    const domain = domainOf(tab.url);
    return { tabId: tab.tabId, title: tab.title.trim() || domain || tab.url, domain };
  });
  return { items, hasMore: preview.matched > items.length };
}
