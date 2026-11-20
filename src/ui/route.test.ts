import { describe, expect, it } from 'vitest';

import { parseRoute, routeHash, type Route } from './route-path';

describe('routes', () => {
  it('round-trip through the address, map focus included', () => {
    const routes: Route[] = [
      { page: 'log' },
      { page: 'map' },
      { page: 'map', focus: { kind: 'character', id: 'c12' as never } },
      { page: 'map', focus: { kind: 'place', id: 'the-old-mill' as never } },
      { page: 'profile', id: 'c3' as never },
    ];
    for (const route of routes) expect(parseRoute(routeHash(route))).toEqual(route);
  });

  it('show the whole map for a focus it cannot read', () => {
    expect(parseRoute('#/map/somewhere')).toEqual({ page: 'map' });
    expect(parseRoute('#/map/character/')).toEqual({ page: 'map' });
  });
});
