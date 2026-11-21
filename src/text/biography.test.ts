import { describe, expect, it } from 'vitest';

import { createSimulation, DAY, type SimEvent } from '../sim';
import { biography } from './biography';
import { toPlainText } from './describe';
import { worldNames } from './names';

describe('biography', () => {
  const events: SimEvent[] = [];
  const sim = createSimulation({
    seed: 'lives',
    characterCount: 40,
    onEvent: (e) => events.push(e),
  });
  sim.advance(sim.world.time + 2 * 360 * DAY);
  const names = worldNames(sim.world);
  const story = (c: typeof sim.world.characters extends Map<unknown, infer C> ? C : never) =>
    biography(
      c,
      events.filter((e) => e.actors.includes(c.id)),
      names,
    ).map(toPlainText);

  it('tells every life in clean sentences', () => {
    for (const c of sim.world.characters.values()) {
      const paragraphs = story(c);
      expect(paragraphs.length).toBeGreaterThanOrEqual(3);
      for (const p of paragraphs) {
        expect(p, p).toMatch(/^[A-Z].*[.]$/);
        expect(p, p).not.toMatch(/undefined|NaN|null|\[object| {2}| ,|\.\./);
      }
    }
  });

  describe('dealings with justice', () => {
    const [a, b, c, d] = [...sim.world.characters.values()].filter((x) => !x.death);
    const town = a!.homeId;
    const now = sim.world.time;
    const year = 360 * DAY;
    const tell = (x: typeof a, at = now) =>
      biography(x!, [], names, new Set(), at).map(toPlainText).join(' ');

    it('tells where and for what someone was jailed, and how long is left', () => {
      a!.justice = [
        { kind: 'turned', at: now - 3 * year, reason: 'skill' },
        { kind: 'captured', at: now - 2 * year, locationId: town, byId: b!.id, how: 'trap' },
        { kind: 'delivered', at: now - 2 * year, townId: town, byId: b!.id, amount: 400 },
        {
          kind: 'sentenced',
          at: now - 2 * year,
          townId: town,
          sentence: 'prison',
          until: now + 6 * year,
          charges: { burglary: 3, holdup: 1 },
        },
      ];
      a!.activity = {
        kind: 'jailed',
        since: now - 2 * year,
        until: now + 6 * year,
        sentence: 'prison',
      };
      const story = tell(a);
      expect(story).toContain(`${b!.givenName} ${b!.familyName} took them alive`);
      expect(story).toContain('for a robbery at blade point and three burglaries');
      expect(story).toContain('eight years in prison, and have six years left to serve');
    });

    it('tells who brought a murderer in, and how they were put to death', () => {
      c!.justice = [
        { kind: 'delivered', at: now, townId: town, byId: b!.id, amount: 900 },
        {
          kind: 'sentenced',
          at: now,
          townId: town,
          sentence: 'death',
          until: now + 5 * DAY,
          charges: { murder: 2 },
          method: 'axe',
        },
      ];
      c!.death = {
        at: now + 5 * DAY,
        locationId: town,
        cause: { kind: 'executed', method: 'axe' },
      };
      const story = tell(c);
      expect(story).toContain('handed them over to the watch');
      expect(story).toContain('for two murders, they were sentenced to lose their head to the axe');
      expect(story).toContain('beheaded with an axe for murder');
    });

    it('tells who cashed in the bounty on a head', () => {
      d!.justice = [
        { kind: 'head', at: now, locationId: town, byId: b!.id },
        { kind: 'claimed', at: now, townId: town, byId: a!.id, amount: 250 },
      ];
      const story = tell(d);
      expect(story).toContain('took their head for the bounty, and');
      expect(story).toContain(`${a!.givenName} ${a!.familyName} claimed the 250-gold bounty`);
    });

    it('tells who murdered someone, with what, and what became of the body', () => {
      d!.justice = [];
      d!.death = {
        at: now,
        locationId: town,
        cause: { kind: 'character', characterId: b!.id, weapon: 'katana', murder: true },
        hidden: true,
      };
      expect(tell(d)).toMatch(
        /murdered by .+ with a katana .*never found; folk thought they had simply vanished, or left for distant lands/,
      );
      d!.death = { ...d!.death, hidden: false, pinnedAt: now };
      expect(tell(d)).toMatch(/body was found where they fell\. In .+ word got out at last/);
    });
  });

  it('ends with how the dead died', () => {
    const fallen = [...sim.world.characters.values()].find((c) => c.death)!;
    expect(story(fallen).at(-1)).toMatch(new RegExp(`^${fallen.givenName} died in the`));
  });
});
