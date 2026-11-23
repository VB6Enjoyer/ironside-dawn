import type { SimContext } from '../context';
import type { Character, Location } from '../model';
import { seekPriest } from './curses';
import { grant } from './effects';
import { hasFaith, priestsIn, shiftFaith } from './faith-core';
import { payHouse } from './market';

/**
 * Prayer and priests (0.4.0, ROADMAP.md "Body and Soul", step 4). Praying at
 * a shrine to the gods of one's culture strengthens faith and leaves a
 * blessing, stronger for the faithful. A priest, for a fee, gives back what
 * crimes took, though never to an outlaw still on the run.
 */

/** What prayer adds, the less the more devout they are already. */
const PRAYER = 0.006;
/** What a priest gives back of `sins` at one visit, and asks for it. */
const ABSOLUTION = 0.05;
const PRIEST_FEE = 10;

export function pray(ctx: SimContext, character: Character, town: Location): void {
  if (!hasFaith(character)) return;
  character.lastPrayer = ctx.world.time;
  shiftFaith(character, PRAYER * (1 - character.faith));
  // Those who have strayed, and stopped straying, may make their peace (not outlaws on the run).
  const market = ctx.world.markets.get(town.id);
  if (
    character.sins > 0 &&
    !character.outlaw &&
    market &&
    priestsIn(ctx.world, town.id) > 0 &&
    character.gold >= PRIEST_FEE * 3
  ) {
    payHouse(market, character, PRIEST_FEE);
    const given = Math.min(character.sins, ABSOLUTION);
    character.sins -= given;
    shiftFaith(character, given);
  }
  // A priest may lift a curse they know of (0.4.0, step 8).
  seekPriest(ctx, character, town.id);
  // A blessing, as strong as their faith, and as often: seldom and slight for the doubter.
  if (ctx.rng.behavior.chance(character.faith)) {
    grant(ctx, character, 'blessed', 'shrine', town.id, 0.3 + character.faith);
  }
}
