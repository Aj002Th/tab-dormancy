export type Route = 'tabs' | 'history' | 'strategies' | 'settings';

const ROUTES: Route[] = ['tabs', 'history', 'strategies', 'settings'];

export function parseRoute(hash: string): Route {
  const value = hash.replace(/^#\/?/, '');
  return ROUTES.includes(value as Route) ? (value as Route) : 'tabs';
}

export function routeHref(route: Route): string {
  return `#/${route}`;
}
