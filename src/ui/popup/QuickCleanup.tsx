import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../shared/i18n';
import type { QuickStrategyItem } from '../../shared/types';
import { Button } from '../components/Button';
import { strategyDisplayName } from '../dashboard/strategy-name';
import { type QuickButton, quickButtons } from './quick-buttons';

// A click that lands on Confirm right after the row expanded is almost always a
// double click on Clean, which sat in the same corner.
const CONFIRM_GUARD_MS = 250;

export function QuickCleanup({
  items,
  onRun,
}: {
  items: readonly QuickStrategyItem[];
  onRun: (button: QuickButton) => void;
}) {
  const [armed, setArmed] = useState<string | null>(null);
  const confirmRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const cleanRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastArmed = useRef<string | null>(null);
  const armedAt = useRef(0);

  // Opening a row moves focus to Confirm; closing it hands focus back to Clean
  // so the keyboard path never drops to <body>.
  useEffect(() => {
    if (armed) {
      lastArmed.current = armed;
      confirmRefs.current[armed]?.focus();
      return;
    }
    const previous = lastArmed.current;
    if (!previous) return;
    lastArmed.current = null;
    cleanRefs.current[previous]?.focus();
  }, [armed]);

  function arm(id: string): void {
    armedAt.current = Date.now();
    setArmed(id);
  }

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
      onKeyDown={(event) => {
        if (event.key === 'Escape' && armed) {
          event.stopPropagation();
          setArmed(null);
        }
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
            >
              <div class="popup-quick-row-content">
                <span class="popup-quick-name">{name}</span>
                <span class="popup-quick-count" data-testid={`popup-quick-count-${button.strategyId}`}>
                  {t('popup.quickCount', { count: button.count })}
                </span>
                {/* Raw <button> rather than <Button>: this one needs
                    aria-expanded/aria-controls, a ref and a display toggle,
                    while still wearing the shared .btn styling. */}
                <button
                  type="button"
                  class="btn btn-secondary popup-quick-clean"
                  aria-expanded={isArmed}
                  aria-controls={isArmed ? `popup-quick-actions-${button.strategyId}` : undefined}
                  aria-label={reason ? `${cleanLabel} — ${reason}` : cleanLabel}
                  disabled={button.disabled}
                  style={isArmed ? { display: 'none' } : undefined}
                  data-testid={`popup-quick-clean-${button.strategyId}`}
                  ref={(node) => {
                    cleanRefs.current[button.strategyId] = node as HTMLButtonElement | null;
                  }}
                  onClick={() => arm(button.strategyId)}
                >
                  {t('popup.quickClean')}
                </button>
                {isArmed && (
                  <div class="popup-quick-actions" id={`popup-quick-actions-${button.strategyId}`}>
                    <Button
                      variant="secondary"
                      aria-label={t('popup.quickCancelAria', { name })}
                      data-testid={`popup-quick-cancel-${button.strategyId}`}
                      onClick={() => setArmed(null)}
                    >
                      {t('popup.quickCancel')}
                    </Button>
                    <Button
                      variant="danger"
                      aria-label={t('popup.quickConfirmAria', { name, count: button.count })}
                      data-testid={`popup-quick-confirm-${button.strategyId}`}
                      focusRef={(node) => {
                        confirmRefs.current[button.strategyId] = node;
                      }}
                      onClick={() => {
                        if (Date.now() - armedAt.current < CONFIRM_GUARD_MS) return;
                        onRun(button);
                      }}
                    >
                      {t('popup.quickConfirm')}
                    </Button>
                  </div>
                )}
                {reason && (
                  <span class="popup-quick-reason" data-testid={`popup-quick-reason-${button.strategyId}`}>
                    {reason}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
