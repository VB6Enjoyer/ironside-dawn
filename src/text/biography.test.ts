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

  it('ends with how the dead died', () => {
    const fallen = [...sim.world.characters.values()].find((c) => c.death)!;
    expect(story(fallen).at(-1)).toMatch(new RegExp(`^${fallen.givenName} died in the`));
  });
});
