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
import { hasUnsavedChanges, hasUnsavedStrategies } from './unsaved';

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
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [route]);

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
    const message = hasUnsavedStrategies() ? t('strategies.leaveConfirm') : t('nav.leaveConfirm');
    if (hasUnsavedChanges() && !window.confirm(message)) {
      event.preventDefault();
      return;
    }
    setRoute(next);
  }

  return (
    <div class="dashboard-shell">
      {/* biome-ignore lint/a11y/useValidAnchor: skip link targets the main content region */}
      <a
        class="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        {t('nav.skipToContent')}
      </a>
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
        <div class="sidebar-meta">
          <span data-testid="sidebar-version">v{chrome.runtime.getManifest().version}</span>
          <a
            class="sidebar-repo"
            data-testid="sidebar-repo-link"
            href="https://github.com/Aj002Th/tab-dormancy"
            target="_blank"
            rel="noreferrer"
            aria-label={t('nav.github')}
            title={t('nav.github')}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.17c-3.2.7-3.87-1.37-3.87-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.41-5.26 5.69.41.35.78 1.05.78 2.12v3.15c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
            </svg>
          </a>
        </div>
      </aside>
      <main id="main-content" class="content" tabIndex={-1}>
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
