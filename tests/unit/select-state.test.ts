import { describe, expect, it } from 'vitest';
import { initialHighlight, menuPlacement, nextEnabled, type SelectOption } from '../../src/ui/components/select-state';

const options: SelectOption[] = [
  { value: 'a', label: 'A', disabled: true },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C', disabled: true },
  { value: 'd', label: 'D' },
];

describe('select state', () => {
  it('starts on the selected enabled option', () => {
    expect(initialHighlight(options, 'd')).toBe(3);
  });

  it('starts on the first enabled option when the value is missing or disabled', () => {
    expect(initialHighlight(options, 'missing')).toBe(1);
    expect(initialHighlight(options, 'a')).toBe(1);
  });

  it('skips disabled options and stays put at the ends', () => {
    expect(nextEnabled(options, 1, 1)).toBe(3);
    expect(nextEnabled(options, 3, 1)).toBe(3);
    expect(nextEnabled(options, 3, -1)).toBe(1);
  });

  it('returns no selection when every option is disabled', () => {
    expect(initialHighlight([{ value: 'a', label: 'A', disabled: true }], 'a')).toBe(-1);
  });

  it('opens upward when the space below is smaller than the space above', () => {
    const placed = menuPlacement({ top: 500, bottom: 540, left: 20, width: 180 }, { width: 800, height: 600 }, 160);
    expect(placed.direction).toBe('up');
    expect(placed.left).toBe(20);
    expect(placed.width).toBe(188);
    expect(placed.top).toBeGreaterThanOrEqual(16);
    expect(placed.top + Math.min(160, placed.maxHeight)).toBeLessThanOrEqual(500 - 8);
  });
});
