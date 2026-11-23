import { useEffect, useRef, useState } from 'preact/hooks';
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
  const [armed, setArmed] = useState<string | null>(null);
  const confirmRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Opening a row moves focus to its confirm button so the keyboard path does
  // not depend on the mouse having pointed at anything.
  useEffect(() => {
    if (armed) confirmRefs.current[armed]?.focus();
  }, [armed]);

  if (items.length === 0) return null;

  return (
    <section
      class="popup-card popup-quick"
      aria-labelledby="popup-quick-title"
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        // The clean button switches the open row itself; only clicks elsewhere
        // in the block collapse it.
        if (target?.closest('.popup-quick-clean')) return;
        if (armed && !target?.closest('[data-armed="true"]')) setArmed(null);
      }}
    >
      <h2 class="popup-quick-title" id="popup-quick-title" data-testid="popup-quick-title">
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
          const isArmed = armed === button.strategyId;
          const cleanLabel = t('popup.quickAria', { name, count: button.count });
          return (
            <li
              key={button.strategyId}
              class="popup-quick-row"
              data-armed={isArmed ? 'true' : 'false'}
              data-testid={`popup-quick-row-${button.strategyId}`}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && isArmed) {
                  event.stopPropagation();
                  setArmed(null);
                }
              }}
            >
              <div class="popup-quick-row-content">
                <span class="popup-quick-name">{name}</span>
                <span class="popup-quick-count" data-testid={`popup-quick-count-${button.strategyId}`}>
                  {t('popup.quickCount', { count: button.count })}
                </span>
                <button
                  type="button"
                  class="popup-quick-clean"
                  aria-expanded={isArmed}
                  aria-controls={`popup-quick-actions-${button.strategyId}`}
                  aria-label={reason ? `${cleanLabel} — ${reason}` : cleanLabel}
                  disabled={button.disabled}
                  data-testid={`popup-quick-clean-${button.strategyId}`}
                  onClick={() => setArmed(button.strategyId)}
                >
                  {t('popup.quickClean')}
                </button>
                {reason && (
                  <span class="popup-quick-reason" data-testid={`popup-quick-reason-${button.strategyId}`}>
                    {reason}
                  </span>
                )}
              </div>
              {isArmed && (
                <div class="popup-quick-actions" id={`popup-quick-actions-${button.strategyId}`}>
                  <button
                    type="button"
                    class="popup-quick-cancel"
                    aria-label={t('popup.quickCancelAria', { name })}
                    data-testid={`popup-quick-cancel-${button.strategyId}`}
                    onClick={() => setArmed(null)}
                  >
                    {t('popup.quickCancel')}
                  </button>
                  <button
                    type="button"
                    class="popup-quick-confirm"
                    aria-label={t('popup.quickConfirmAria', { name, count: button.count })}
                    data-testid={`popup-quick-confirm-${button.strategyId}`}
                    ref={(node) => {
                      confirmRefs.current[button.strategyId] = node as HTMLButtonElement | null;
                    }}
                    onClick={() => onRun(button)}
                  >
                    {t('popup.quickConfirm')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
