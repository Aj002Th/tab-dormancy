import { t } from '../../shared/i18n';
import type { QuickStrategyItem } from '../../shared/types';
import { type QuickButton, quickButtons } from './quick-buttons';

export function QuickCleanup({
  items,
  disabled,
  onRun,
}: {
  items: readonly QuickStrategyItem[];
  disabled: boolean;
  onRun: (button: QuickButton) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section class="popup-card popup-quick" aria-labelledby="popup-quick-title">
      <h2 class="popup-quick-title" id="popup-quick-title">
        {t('popup.quickTitle')}
      </h2>
      <ul class="popup-quick-list">
        {quickButtons(items).map((button) => (
          <li key={button.strategyId}>
            <button
              type="button"
              class="popup-quick-item"
              disabled={disabled || button.disabled}
              aria-label={t('popup.quickAria', { name: button.name, count: button.count })}
              data-testid={`popup-quick-${button.strategyId}`}
              onClick={() => onRun(button)}
            >
              <span class="popup-quick-name">{button.name}</span>
              {button.status === 'ready' || button.status === 'empty' ? (
                <span class="popup-quick-count" data-testid={`popup-quick-count-${button.strategyId}`}>
                  {t('popup.quickCount', { count: button.count })}
                </span>
              ) : (
                <span class="popup-quick-reason">
                  {t(button.status === 'invalid' ? 'popup.quickInvalid' : 'popup.quickUnsupported')}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
