import type { ComponentChildren } from 'preact';

type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  children: ComponentChildren;
  'data-testid'?: string;
  'aria-label'?: string;
  title?: string;
  class?: string;
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
    >
      {children}
    </button>
  );
}
