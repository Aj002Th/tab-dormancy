import type { ComponentChildren } from 'preact';

type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  children: ComponentChildren;
  'data-testid'?: string;
  'aria-label'?: string;
  title?: string;
  id?: string;
  class?: string;
  /** Callback ref for focus management; Preact `ref` on a function component
   * resolves to the component, not the DOM node. */
  focusRef?: (node: HTMLButtonElement | null) => void;
};

export function Button({
  variant = 'secondary',
  disabled,
  onClick,
  children,
  class: className = '',
  'data-testid': testId,
  'aria-label': ariaLabel,
  title,
  id,
  focusRef,
}: ButtonProps) {
  return (
    <button
      type="button"
      class={`btn btn-${variant} ${className}`.trim()}
      disabled={disabled}
      onClick={(event) => onClick?.(event)}
      data-testid={testId}
      aria-label={ariaLabel}
      title={title}
      id={id}
      ref={focusRef}
    >
      {children}
    </button>
  );
}
