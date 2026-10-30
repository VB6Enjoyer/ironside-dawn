import { describe, expect, it } from 'vitest';

import { STARTER_MAP } from '../../content';
import { HOUR } from '../core/time';
import { createWorldState } from '../gen/world';
import type { LocationId } from '../model';
import { findPath, roadsFrom } from './roads';

const world = createWorldState('roads', STARTER_MAP);
const id = (s: string) => s as LocationId;

describe('roads', () => {
  it('lists roads in both directions', () => {
    const fromWitherwood = roadsFrom(world, id('witherwood')).map((r) => r.to);
    expect(fromWitherwood).toEqual(['concordale', 'saltmere', 'dungeon-of-misery']);
  });

  it('finds the fastest path, not the one with the fewest stops', () => {
    // Direct road: 16 hours. Through the Witherwood: 5 + 8 = 13 hours.
    expect(findPath(world, id('concordale'), id('saltmere'))).toEqual({
      stops: ['witherwood', 'saltmere'],
      duration: 13 * HOUR,
    });
  });

  it('finds multi-stop paths', () => {
    expect(findPath(world, id('dungeon-of-misery'), id('gorefang-caves'))?.stops).toEqual([
      'witherwood',
      'concordale',
      'brindlemoor',
      'gorefang-caves',
    ]);
  });

  it('returns an empty path to the same place', () => {
    expect(findPath(world, id('saltmere'), id('saltmere'))).toEqual({ stops: [], duration: 0 });
  });

  it('returns null when there is no way there', () => {
    const island = createWorldState('island', {
      locations: [
        ...STARTER_MAP.locations,
        { id: 'isle', name: 'Isle', kind: 'town', culture: 'generic' },
      ],
      routes: STARTER_MAP.routes,
    });
    expect(findPath(island, id('concordale'), id('isle'))).toBeNull();
  });
});
