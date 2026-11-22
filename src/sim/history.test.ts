import { describe, expect, it } from 'vitest';

import { SAME_HISTORY_SINCE } from '../host/version';
import { StreamHash } from './core/hash';
import { DAY } from './core/time';
import { createSimulation } from './simulation';

/**
 * What a fixed world does in its first month, as a hash of its events, and
 * the release it has done so since. Links stamped with that release or a later
 * one are told they replay the same world (`replaysHere`), so this must change
 * only together with `SAME_HISTORY_SINCE`.
 */
const HISTORY = { since: '0.4.0', hash: '088ab68d0bf9ba' };

function monthOfHistory(): string {
  const hash = new StreamHash();
  const sim = createSimulation({
    seed: 'history',
    characterCount: 20,
    settings: { size: 'small' },
    onEvent: (event) => hash.update(JSON.stringify(event)),
  });
  sim.advance(sim.world.time + 30 * DAY);
  return hash.digest();
}

describe('the history a seed gives', () => {
  it('is the one recorded for the release it has been the same since', () => {
    const changed =
      'How worlds turn out has changed: set SAME_HISTORY_SINCE (src/host/version.ts) and ' +
      'HISTORY.since to the coming version, and HISTORY.hash to the new hash.';
    expect(HISTORY.since, changed).toBe(SAME_HISTORY_SINCE);
    expect(monthOfHistory(), changed).toBe(HISTORY.hash);
  });
});
