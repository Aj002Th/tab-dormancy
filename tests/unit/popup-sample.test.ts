import { describe, expect, it } from 'vitest';
import type { CleanupPreview } from '../../src/shared/types';
import { popupSample } from '../../src/ui/popup/sample';

function preview(titles: string[]): CleanupPreview {
  return {
    matched: titles.length,
    sample: titles.map((title, index) => ({
      tabId: index + 1,
      title,
      url: `https://example.com/page-${index + 1}`,
      trace: [],
    })),
    totalManagedTabs: 10,
    strategyId: 'preset:standard',
    strategyName: '标准',
  };
}

describe('popupSample', () => {
  it('shows at most three tabs and reports when more were matched', () => {
    const view = popupSample(preview(['One', 'Two', 'Three', 'Four', 'Five']));
    expect(view.items.map((item) => item.title)).toEqual(['One', 'Two', 'Three']);
    expect(view.items.map((item) => item.domain)).toEqual(['example.com', 'example.com', 'example.com']);
    expect(view.hasMore).toBe(true);
  });

  it('uses the domain when a matched tab has no title', () => {
    const view = popupSample(preview(['', 'Docs']));
    expect(view.items[0]).toEqual({ tabId: 1, title: 'example.com', domain: 'example.com' });
    expect(view.hasMore).toBe(false);
  });

  it('is empty when nothing matched', () => {
    expect(popupSample(preview([]))).toEqual({ items: [], hasMore: false });
  });
});
