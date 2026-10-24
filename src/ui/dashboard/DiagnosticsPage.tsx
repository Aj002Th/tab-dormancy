import { useEffect, useState } from 'preact/hooks';
import type { StateSnapshot } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Spinner } from '../components/Spinner';
import { type CapabilityViewItem, capabilityView } from './capability-view';

function renderCapabilities(items: CapabilityViewItem[]) {
  return items.map((item) => (
    <li
      key={item.key}
      class={item.available ? 'capability-item' : 'capability-item unavailable'}
      data-testid={`diagnostics-item-${item.key}`}
    >
      <span class="capability-name">{item.label}</span>
      <span class={item.available ? 'capability-pill ok' : 'capability-pill warn'}>
        {item.available ? '可用' : '不可用'}
      </span>
      <span class="capability-description">{item.description}</span>
      {!item.available && item.requirement && <span class="capability-requirement">{item.requirement}</span>}
    </li>
  ));
}

export function DiagnosticsPage() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void send<StateSnapshot>({ type: 'state.get' })
      .then((next) => {
        if (!alive) return;
        setState(next);
        setError(null);
      })
      .catch((error) => {
        if (alive) setError(messageOf(error));
      });
    return () => {
      alive = false;
    };
  }, []);

  const support = state ? capabilityView(state.capabilities) : null;

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>诊断</h2>
          <p class="muted">只读信息，用于判断规则能否在当前浏览器中执行。</p>
        </div>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {!state && !error && <Spinner />}
      {support && (
        <section class="diagnostics-card">
          <div class="settings-section-head">
            <div class="support-title">
              <h3>运行环境</h3>
              <span
                class={support.allAvailable ? 'support-status ok' : 'support-status warn'}
                data-testid="diagnostics-status"
              >
                {support.allAvailable ? '全部可用' : `${support.unavailable.length} 项不可用`}
              </span>
            </div>
            <p class="muted small">{`Tab Dormancy ${chrome.runtime.getManifest().version}`}</p>
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
