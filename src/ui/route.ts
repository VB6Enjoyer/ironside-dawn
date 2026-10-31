import { useEffect, useState } from 'react';

import type { CharacterId, LocationId } from '../sim';

/** Which page is showing, kept in the URL's hash so Back works and pages can be linked. */
export type Route =
  | { readonly page: 'log' }
  | { readonly page: 'chronicle' }
  | { readonly page: 'places' }
  | { readonly page: 'stats' }
  | { readonly page: 'halls' }
  | { readonly page: 'profile'; readonly id: CharacterId }
  | { readonly page: 'place'; readonly id: LocationId };

export function parseRoute(hash: string): Route {
  const [page, id] = hash.replace(/^#\/?/, '').split('/');
  switch (page) {
    case 'chronicle':
    case 'places':
    case 'stats':
    case 'halls':
      return { page };
    case 'profile':
      return id ? { page, id: decodeURIComponent(id) as CharacterId } : { page: 'log' };
    case 'place':
      return id ? { page, id: decodeURIComponent(id) as LocationId } : { page: 'places' };
    default:
      return { page: 'log' };
  }
}

export function routeHash(route: Route): string {
  return 'id' in route ? `#/${route.page}/${encodeURIComponent(route.id)}` : `#/${route.page}`;
}

export function useRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = (next: Route) => {
    window.location.hash = routeHash(next);
  };
  return [route, go];
}
