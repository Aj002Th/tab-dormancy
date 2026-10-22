import { useEffect, useState } from 'preact/hooks';
import { parseRoute, type Route, routeHref } from './routes';
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

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
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
        <p class="sidebar-note muted">只在空闲时关闭标签页，不采集使用数据。</p>
      </aside>
      <main class="content">
        {route === 'tabs' && <TabsPage />}
        {route === 'history' && <p class="muted">关闭历史页面将在下一个任务接入。</p>}
        {route === 'strategies' && <StrategiesPage />}
        {route === 'settings' && <p class="muted">设置页面将在后续任务接入。</p>}
      </main>
    </div>
  );
}
