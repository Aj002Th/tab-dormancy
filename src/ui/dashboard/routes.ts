export type Route = 'tabs' | 'history' | 'strategies' | 'settings' | 'diagnostics';

const ROUTES: Route[] = ['tabs', 'history', 'strategies', 'settings', 'diagnostics'];

export function parseRoute(hash: string): Route {
  const value = hash.replace(/^#\/?/, '');
  return ROUTES.includes(value as Route) ? (value as Route) : 'tabs';
}

export function routeHref(route: Route): string {
  return `#/${route}`;
}
