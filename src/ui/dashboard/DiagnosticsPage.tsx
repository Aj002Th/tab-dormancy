import { useEffect, useState } from 'preact/hooks';
import { t } from '../../shared/i18n';
import type { StateSnapshot } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { useLocale } from '../i18n';
import { type CapabilityViewItem, capabilityView } from './capability-view';

function StatusMark({ available }: { available: boolean }) {
  return (
    <svg
      class="status-mark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      {available ? (
        <path d="m8.5 12 2.5 2.5 4.5-5" stroke-linecap="round" stroke-linejoin="round" />
      ) : (
        <>
          <path d="M12 8v5" stroke-linecap="round" />
          <path d="M12 16h.01" stroke-linecap="round" />
        </>
      )}
    </svg>
  );
}

function renderCapabilities(items: CapabilityViewItem[]) {
  return items.map((item) => (
    <li
      key={item.key}
      class={item.available ? 'capability-item' : 'capability-item unavailable'}
      data-testid={`diagnostics-item-${item.key}`}
    >
      <span class="capability-name">{item.label}</span>
      <span class={item.available ? 'capability-pill ok' : 'capability-pill warn'}>
        <StatusMark available={item.available} />
        {item.available ? t('diagnostics.available') : t('diagnostics.unavailable')}
      </span>
      <span class="capability-description">{item.description}</span>
      {!item.available && item.requirement && <span class="capability-requirement">{item.requirement}</span>}
    </li>
  ));
}

export function DiagnosticsPage() {
  const locale = useLocale();
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    void send<StateSnapshot>({ type: 'state.get' })
      .then((next) => {
        if (!alive) return;
        setState(next);
      })
      .catch((error) => {
        if (alive) setError(messageOf(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshToken]);

  const support = state ? capabilityView(state.capabilities, locale) : null;
  const refresh = () => setRefreshToken((value) => value + 1);

  return (
    <section class="page diagnostics-page" aria-busy={loading}>
      <header class="page-head">
        <div>
          <h2>{t('diagnostics.title')}</h2>
          <p class="muted">{t('diagnostics.subtitle')}</p>
        </div>
        <Button onClick={refresh} disabled={loading} data-testid="diagnostics-refresh">
          {loading ? t('diagnostics.refreshing') : t('diagnostics.refresh')}
        </Button>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {!state && !error && <Spinner />}
      {!state && error && (
        <div class="diagnostics-error-actions">
          <Button onClick={refresh} data-testid="diagnostics-retry">
            {t('app.retry')}
          </Button>
        </div>
      )}

      {support && (
        <section class="diagnostics-card">
          <div class="diagnostics-card-head">
            <div class="support-title">
              <h3>{t('diagnostics.environment')}</h3>
              <output
                class={support.allAvailable ? 'support-status ok' : 'support-status warn'}
                aria-live="polite"
                data-testid="diagnostics-status"
              >
                <StatusMark available={support.allAvailable} />
                {support.allAvailable
                  ? t('diagnostics.allAvailable')
                  : t('diagnostics.unavailableCount', { count: support.unavailable.length })}
              </output>
            </div>
            <p class="muted small support-product">{`Tab Dormancy ${chrome.runtime.getManifest().version}`}</p>
          </div>

          <div class="support-overview">
            <span class="support-version" data-testid="diagnostics-version">
              {support.versionLabel}
            </span>
            <p class="support-summary" data-testid="diagnostics-summary">
              {support.summary}
            </p>
          </div>

          <ul class="capability-list">{renderCapabilities(support.items)}</ul>
        </section>
      )}
    </section>
  );
}
