import type { QuickStrategyItem, QuickStrategyStatus } from '../../shared/types';

export type QuickButton = Omit<QuickStrategyItem, 'status'> & {
  count: number;
  disabled: boolean;
  /** `empty` means runnable but matching nothing right now. */
  status: QuickStrategyStatus | 'empty';
};

export function quickButtons(items: readonly QuickStrategyItem[]): QuickButton[] {
  return items.map((item) => {
    const status: QuickButton['status'] = item.status === 'ready' && item.matched === 0 ? 'empty' : item.status;
    return { ...item, count: item.matched, disabled: status !== 'ready', status };
  });
}
