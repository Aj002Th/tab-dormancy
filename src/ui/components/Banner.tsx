import type { ComponentChildren } from 'preact';

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ComponentChildren }) {
  return <div class={`banner banner-${tone}`}>{children}</div>;
}
