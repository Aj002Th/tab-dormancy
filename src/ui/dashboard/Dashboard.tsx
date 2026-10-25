import { useEffect, useState } from 'preact/hooks';
import { STORAGE_KEYS } from '../../shared/constants';
import { t } from '../../shared/i18n';
import type { StateSnapshot } from '../../shared/types';
import { send } from '../api';
import { Banner } from '../components/Banner';
import { useLocale } from '../i18n';
import { DiagnosticsPage } from './DiagnosticsPage';
import { HistoryPage } from './HistoryPage';
import { parseRoute, type Route, routeHref } from './routes';
import { SettingsPage } from './SettingsPage';
import { StrategiesPage } from './StrategiesPage';
import { TabsPage } from './TabsPage';
import { hasUnsavedSettings } from './unsaved';

export function Dashboard() {
  const locale = useLocale();
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    document.title = t('app.dashboardTitle');
  }, [locale]);

  const NAV: Array<{ route: Route; label: string }> = [
    { route: 'tabs', label: t('nav.tabs') },
    { route: 'history', label: t('nav.history') },
    { route: 'strategies', label: t('nav.strategies') },
    { route: 'settings', label: t('nav.settings') },
  ];

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

  function navigate(event: MouseEvent, next: Route) {
    if (next === route) return;
    if (hasUnsavedSettings() && !window.confirm(t('nav.leaveConfirm'))) {
      event.preventDefault();
      return;
    }
    setRoute(next);
  }

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
              onClick={(event) => navigate(event, item.route)}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <nav class="nav nav-secondary">
          <a
            href={routeHref('diagnostics')}
            class={route === 'diagnostics' ? 'nav-link active' : 'nav-link'}
            onClick={(event) => navigate(event, 'diagnostics')}
          >
            {t('nav.diagnostics')}
          </a>
        </nav>
        <p class="sidebar-note muted">{t('nav.note')}</p>
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
