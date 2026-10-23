import { describe, expect, it } from 'vitest';
import { windowLabelFor, windowLabels, windowSelectionAvailable } from '../../src/ui/dashboard/tabs-window';

function tab(windowId: number, windowFocused = false) {
  return { facts: { windowId, windowFocused } };
}

describe('tabs window labels', () => {
  it('labels a single focused window as the current window', () => {
    expect(windowLabels([tab(7, true), tab(7, true)])).toEqual([{ id: 7, label: '当前窗口' }]);
  });

  it('labels other windows relative to the focused window', () => {
    expect(windowLabels([tab(20), tab(10, true), tab(30)])).toEqual([
      { id: 10, label: '当前窗口' },
      { id: 20, label: '其他窗口 1' },
      { id: 30, label: '其他窗口 2' },
    ]);
  });

  it('labels windows by number when none is focused', () => {
    expect(windowLabels([tab(5), tab(2)])).toEqual([
      { id: 2, label: '窗口 1' },
      { id: 5, label: '窗口 2' },
    ]);
  });

  it('resolves a row label and falls back to the raw id', () => {
    const labels = windowLabels([tab(1, true), tab(2)]);
    expect(windowLabelFor(1, labels)).toBe('当前窗口');
    expect(windowLabelFor(2, labels)).toBe('其他窗口 1');
    expect(windowLabelFor(99, labels)).toBe('窗口 99');
  });

  it('detects whether the selected window is still available', () => {
    const labels = windowLabels([tab(1, true), tab(2)]);
    expect(windowSelectionAvailable('all', labels)).toBe(true);
    expect(windowSelectionAvailable(1, labels)).toBe(true);
    expect(windowSelectionAvailable(99, labels)).toBe(false);
  });
});
