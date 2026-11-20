import type { CharacterId, LocationId } from '../sim';

/** Someone or somewhere the map is asked to show. */
export type MapFocus =
  | { readonly kind: 'character'; readonly id: CharacterId }
  | { readonly kind: 'place'; readonly id: LocationId };

/** Which page is showing, kept in the URL's hash so Back works and pages can be linked. */
export type Route =
  | { readonly page: 'log' }
  | { readonly page: 'chronicle' }
  | { readonly page: 'places' }
  | { readonly page: 'trade' }
  | { readonly page: 'stats' }
  | { readonly page: 'halls' }
  | { readonly page: 'map'; readonly focus?: MapFocus }
  | { readonly page: 'profile'; readonly id: CharacterId }
  | { readonly page: 'place'; readonly id: LocationId }
  | { readonly page: 'region'; readonly id: string };

export function parseRoute(hash: string): Route {
  const [page, id, rest] = hash.replace(/^#\/?/, '').split('/');
  switch (page) {
    case 'map': {
      // #/map/character/c12 or #/map/place/skyrun
      const target = rest ? decodeURIComponent(rest) : null;
      if (id === 'character' && target) {
        return { page, focus: { kind: 'character', id: target as CharacterId } };
      }
      if (id === 'place' && target) {
        return { page, focus: { kind: 'place', id: target as LocationId } };
      }
      return { page };
    }
    case 'chronicle':
    case 'places':
    case 'trade':
    case 'stats':
    case 'halls':
      return { page };
    case 'profile':
      return id ? { page, id: decodeURIComponent(id) as CharacterId } : { page: 'log' };
    case 'place':
      return id ? { page, id: decodeURIComponent(id) as LocationId } : { page: 'places' };
    case 'region':
      return id ? { page, id: decodeURIComponent(id) } : { page: 'places' };
    default:
      return { page: 'log' };
  }
}

export function routeHash(route: Route): string {
  if (route.page === 'map' && route.focus) {
    return `#/map/${route.focus.kind}/${encodeURIComponent(route.focus.id)}`;
  }
  return 'id' in route ? `#/${route.page}/${encodeURIComponent(route.id)}` : `#/${route.page}`;
}
