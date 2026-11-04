// @vitest-environment happy-dom
import { h, render } from 'preact';
import { afterEach, describe, expect, it } from 'vitest';
import { Select, type SelectOption } from '../../src/ui/components/Select';

const options: SelectOption[] = [
  { value: 'a', label: 'A', disabled: true },
  { value: 'b', label: 'B' },
  { value: 'd', label: 'D' },
];

let container: HTMLDivElement | null = null;

function mount(props: {
  value: string;
  disabled?: boolean;
  options?: SelectOption[];
  onChange?: (value: string) => void;
}) {
  container = document.createElement('div');
  document.body.append(container);
  render(
    h(Select, {
      options: props.options ?? options,
      value: props.value,
      disabled: props.disabled,
      onChange: props.onChange ?? (() => {}),
    }),
    container,
  );
  return container.querySelector('[role="combobox"]') as HTMLButtonElement;
}

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
    container = null;
  }
  document.body.replaceChildren();
});

describe('Select', () => {
  it('shows the selected option while closed', () => {
    const trigger = mount({ value: 'b' });
    expect(trigger.getAttribute('data-value')).toBe('b');
    expect(trigger.textContent).toContain('B');
  });

  it('renders the menu on document.body', () => {
    const trigger = mount({ value: 'b' });
    trigger.click();
    const menu = document.querySelector('[role="listbox"]');
    expect(menu?.parentElement).toBe(document.body);
    expect(trigger.contains(menu)).toBe(false);
  });

  it('selects an enabled option and closes', () => {
    const chosen: string[] = [];
    mount({ value: 'b', onChange: (value) => chosen.push(value) });
    document.querySelector<HTMLButtonElement>('[role="combobox"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-value="d"]')?.click();
    expect(chosen).toEqual(['d']);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('ignores a disabled option', () => {
    const chosen: string[] = [];
    mount({ value: 'b', onChange: (value) => chosen.push(value) });
    document.querySelector<HTMLButtonElement>('[role="combobox"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-value="a"]')?.click();
    expect(chosen).toEqual([]);
  });

  it('closes on Escape without selecting', () => {
    const chosen: string[] = [];
    const trigger = mount({ value: 'b', onChange: (value) => chosen.push(value) });
    trigger.click();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(chosen).toEqual([]);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('closes when clicking outside', () => {
    const chosen: string[] = [];
    mount({ value: 'b', onChange: (value) => chosen.push(value) });
    document.querySelector<HTMLButtonElement>('[role="combobox"]')?.click();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(chosen).toEqual([]);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it('shows nothing when the value is missing', () => {
    const trigger = mount({ value: 'missing' });
    expect(trigger.textContent?.trim()).toBe('');
  });

  it('does not select when every option is disabled', () => {
    const chosen: string[] = [];
    const trigger = mount({
      value: 'a',
      options: [{ value: 'a', label: 'A', disabled: true }],
      onChange: (value) => chosen.push(value),
    });
    trigger.click();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(chosen).toEqual([]);
  });

  it('keeps one outside listener when the value changes while open', () => {
    const listeners: Array<(event: Event) => void> = [];
    const original = document.addEventListener.bind(document);
    document.addEventListener = ((type: string, listener: (event: Event) => void) => {
      if (type === 'pointerdown') listeners.push(listener);
      original(type, listener);
    }) as typeof document.addEventListener;
    try {
      run();
      expect(listeners).toHaveLength(1);
    } finally {
      document.addEventListener = original;
    }

    function run() {
      container = document.createElement('div');
      document.body.append(container);
      let value = 'b';
      const draw = () => {
        if (!container) return;
        render(
          h(Select, {
            options,
            value,
            onChange: (next) => {
              value = next;
              draw();
            },
          }),
          container,
        );
      };
      draw();
      container.querySelector<HTMLButtonElement>('[role="combobox"]')?.click();
      value = 'd';
      draw();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(document.querySelector('[role="listbox"]')).toBeNull();
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      expect(document.querySelector('[role="listbox"]')).toBeNull();
    }
  });

  it('does not open when disabled', () => {
    const trigger = mount({ value: 'b', disabled: true });
    trigger.click();
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });
});
