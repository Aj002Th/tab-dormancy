import type { ComponentChildren } from 'preact';

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ComponentChildren }) {
  return (
    <div class={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
