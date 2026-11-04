export type SelectOption = { value: string; label: string; disabled?: boolean };

export function initialHighlight(options: SelectOption[], value: string): number {
  const selected = options.findIndex((option) => option.value === value && !option.disabled);
  if (selected >= 0) return selected;
  return options.findIndex((option) => !option.disabled);
}

export function nextEnabled(options: SelectOption[], index: number, delta: 1 | -1): number {
  for (let next = index + delta; next >= 0 && next < options.length; next += delta) {
    if (!options[next]?.disabled) return next;
  }
  return index;
}

export type MenuPlacement = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  direction: 'down' | 'up';
};

const GAP = 8;
const MARGIN = 32;
const OUTSET = 4;

export function menuPlacement(
  trigger: { top: number; bottom: number; left: number; width: number },
  viewport: { width: number; height: number },
  contentHeight: number,
): MenuPlacement {
  const below = viewport.height - trigger.bottom - GAP - MARGIN;
  const above = trigger.top - GAP - MARGIN;
  const direction = below >= contentHeight || below >= above ? 'down' : 'up';
  const maxHeight = Math.max(0, direction === 'down' ? below : above);
  const height = Math.min(contentHeight, maxHeight);
  return {
    direction,
    left: trigger.left,
    width: Math.min(trigger.width + OUTSET * 2, viewport.width - MARGIN * 2),
    maxHeight,
    top: direction === 'down' ? trigger.bottom + GAP : trigger.top - GAP - height,
  };
}
