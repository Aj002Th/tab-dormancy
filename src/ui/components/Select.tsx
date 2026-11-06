import { h, render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { initialHighlight, menuPlacement, nextEnabled, type SelectOption } from './select-state';

const OPTION_HEIGHT = 44;

type SelectProps = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'data-testid'?: string;
  class?: string;
};

export type { SelectOption };

export function Select(props: SelectProps) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement | null>(null);
  const highlight = useRef(-1);
  const listId = useRef(`select-${Math.random().toString(36).slice(2)}`);
  const [open, setOpen] = useState(false);
  const selected = props.options.find((option) => option.value === props.value);

  const outsideListener = useRef<((event: PointerEvent) => void) | null>(null);

  function removeMenu() {
    if (outsideListener.current) {
      document.removeEventListener('pointerdown', outsideListener.current);
      outsideListener.current = null;
    }
    const host = menu.current;
    if (!host) return;
    render(null, host);
    host.remove();
    menu.current = null;
  }

  function paintMenu() {
    const host = menu.current;
    const element = trigger.current;
    if (!host || !element) return;
    const rect = element.getBoundingClientRect();
    const placement = menuPlacement(
      { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      { width: window.innerWidth, height: window.innerHeight },
      Math.min(props.options.length, 4) * OPTION_HEIGHT,
    );
    host.style.top = `${placement.top}px`;
    host.style.left = `${placement.left}px`;
    host.style.width = 'max-content';
    host.style.minWidth = `${placement.width}px`;
    host.style.maxWidth = `${Math.max(placement.width, window.innerWidth - placement.left - 32)}px`;
    host.className = 'select-menu';
    host.role = 'listbox';
    host.id = listId.current;
    host.style.maxHeight = `${placement.maxHeight}px`;
    render(
      props.options.map((option, index) =>
        h(
          'button',
          {
            type: 'button',
            role: 'option',
            id: `${listId.current}-option-${index}`,
            class: `select-option${index === highlight.current ? ' highlighted' : ''}`,
            'data-value': option.value,
            disabled: option.disabled,
            'aria-selected': option.value === props.value,
            onMouseEnter: () => {
              highlight.current = index;
              paintMenu();
            },
            onClick: () => choose(index),
          },
          option.label,
        ),
      ),
      host,
    );
  }

  function openMenu() {
    if (props.disabled || menu.current) return;
    const element = trigger.current;
    if (!element) return;
    highlight.current = initialHighlight(props.options, props.value);
    const host = document.createElement('div');
    document.body.append(host);
    menu.current = host;
    paintMenu();
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (element.contains(target) || host.contains(target))) return;
      closeMenu();
    };
    outsideListener.current = outside;
    document.addEventListener('pointerdown', outside);
    setOpen(true);
  }

  function closeMenu() {
    removeMenu();
    setOpen(false);
  }

  function choose(index: number) {
    const option = props.options[index];
    if (!option || option.disabled) return;
    props.onChange(option.value);
    closeMenu();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!menu.current) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    if (event.key === 'Tab') {
      closeMenu();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      highlight.current = nextEnabled(props.options, highlight.current, event.key === 'ArrowDown' ? 1 : -1);
      paintMenu();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const enabled = props.options
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => !option.disabled);
      if (enabled.length > 0) {
        highlight.current = enabled[event.key === 'Home' ? 0 : enabled.length - 1]?.index ?? highlight.current;
        paintMenu();
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(highlight.current);
    }
  }

  useEffect(() => {
    if (!open) return;
    const element = trigger.current;
    const host = menu.current;
    if (!element || !host) return;
    paintMenu();
    window.addEventListener('resize', paintMenu);
    window.addEventListener('scroll', paintMenu, true);
    return () => {
      window.removeEventListener('resize', paintMenu);
      window.removeEventListener('scroll', paintMenu, true);
      removeMenu();
    };
  }, [open, props.options, props.value]);

  return (
    <button
      ref={trigger}
      type="button"
      class={`input select-trigger${props.compact ? ' compact' : ''}${props.class ? ` ${props.class}` : ''}`}
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-controls={open ? listId.current : undefined}
      aria-activedescendant={
        open && highlight.current >= 0 ? `${listId.current}-option-${highlight.current}` : undefined
      }
      aria-label={props['aria-label']}
      aria-labelledby={props['aria-labelledby']}
      aria-describedby={props['aria-describedby']}
      aria-invalid={props['aria-invalid']}
      id={props.id}
      data-testid={props['data-testid']}
      data-value={props.value}
      disabled={props.disabled}
      title={selected?.label ?? ''}
      onClick={() => (menu.current ? closeMenu() : openMenu())}
      onKeyDown={onKeyDown}
    >
      <span class="select-trigger-label">{selected?.label ?? ''}</span>
    </button>
  );
}
