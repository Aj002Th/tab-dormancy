import type { ComponentChildren } from 'preact';

type ButtonProps = {
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
  children: ComponentChildren;
  'data-testid'?: string;
  'aria-label'?: string;
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
}: ButtonProps) {
  return (
    <button
      type="button"
      class={`btn btn-${variant} ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
