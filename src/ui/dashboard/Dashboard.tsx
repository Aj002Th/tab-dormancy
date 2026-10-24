import { useEffect, useState } from 'preact/hooks';
import { STORAGE_KEYS } from '../../shared/constants';
import type { StateSnapshot } from '../../shared/types';
import { send } from '../api';
import { Banner } from '../components/Banner';
import { DiagnosticsPage } from './DiagnosticsPage';
import { HistoryPage } from './HistoryPage';
import { parseRoute, type Route, routeHref } from './routes';
import { SettingsPage } from './SettingsPage';
import { StrategiesPage } from './StrategiesPage';
import { TabsPage } from './TabsPage';

const NAV: Array<{ route: Route; label: string }> = [
  { route: 'tabs', label: '标签页' },
  { route: 'history', label: '关闭历史' },
  { route: 'strategies', label: '策略' },
  { route: 'settings', label: '设置' },
];

export function Dashboard() {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let alive = true;

    const loadWarnings = async () => {
      try {
        const next = await send<StateSnapshot>({ type: 'state.get' });
        if (alive) setWarnings(next.warnings);
      } catch {
        // Keep the previous warnings when the background is unavailable.
      }
    };

    void loadWarnings();

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      if (!changes[STORAGE_KEYS.settings] && !changes[STORAGE_KEYS.strategies]) return;
      void loadWarnings();
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return (
    <div class="dashboard-shell">
      <aside class="sidebar">
        <h1 class="brand">Tab Dormancy</h1>
        <nav class="nav">
          {NAV.map((item) => (
            <a
              key={item.route}
              href={routeHref(item.route)}
              class={item.route === route ? 'nav-link active' : 'nav-link'}
              onClick={() => setRoute(item.route)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <nav class="nav nav-secondary">
          <a
            href={routeHref('diagnostics')}
            class={route === 'diagnostics' ? 'nav-link active' : 'nav-link'}
            onClick={() => setRoute('diagnostics')}
          >
            诊断
          </a>
        </nav>
        <p class="sidebar-note muted">只在空闲时关闭标签页，不采集使用数据。</p>
      </aside>
      <main class="content">
        {warnings.map((warning) => (
          <Banner key={warning}>{warning}</Banner>
        ))}
        {route === 'tabs' && <TabsPage />}
        {route === 'history' && <HistoryPage />}
        {route === 'strategies' && <StrategiesPage />}
        {route === 'settings' && <SettingsPage />}
        {route === 'diagnostics' && <DiagnosticsPage />}
      </main>
    </div>
  );
}
