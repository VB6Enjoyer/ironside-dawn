import { useEffect, useState } from 'react';

import { parseRoute, routeHash, type Route } from './route-path';

export { parseRoute, routeHash } from './route-path';
export type { MapFocus, Route } from './route-path';

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
