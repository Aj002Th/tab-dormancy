import { t } from '../../shared/i18n';
import type { QuickStrategyItem } from '../../shared/types';
import { strategyDisplayName } from '../dashboard/strategy-name';
import { type QuickButton, quickButtons } from './quick-buttons';

export function QuickCleanup({
  items,
  onRun,
}: {
  items: readonly QuickStrategyItem[];
  onRun: (button: QuickButton) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section class="popup-card popup-quick" aria-labelledby="popup-quick-title">
      <h2 class="popup-quick-title" id="popup-quick-title">
        {t('popup.quickTitle')}
      </h2>
      <ul class="popup-quick-list">
        {quickButtons(items).map((button) => {
          const name = strategyDisplayName({ id: button.strategyId, name: button.name });
          const reason =
            button.status === 'invalid'
              ? t('popup.quickInvalid')
              : button.status === 'unsupported'
                ? t('popup.quickUnsupported')
                : null;
          const ariaLabel = t('popup.quickAria', { name, count: button.count });
          return (
            <li key={button.strategyId}>
              <button
                type="button"
                class="popup-quick-item"
                disabled={button.disabled}
                aria-label={reason ? `${ariaLabel} — ${reason}` : ariaLabel}
                data-testid={`popup-quick-${button.strategyId}`}
                onClick={() => onRun(button)}
              >
                <span class="popup-quick-name">{name}</span>
                <span class="popup-quick-count" data-testid={`popup-quick-count-${button.strategyId}`}>
                  {t('popup.quickCount', { count: button.count })}
                </span>
                {reason && (
                  <span class="popup-quick-reason" data-testid={`popup-quick-reason-${button.strategyId}`}>
                    {reason}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
