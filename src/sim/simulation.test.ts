import { describe, expect, it } from 'vitest';

import { StreamHash } from './core/hash';
import { createRng } from './core/rng';
import { DAY, HOUR, MINUTE, SEASON, timeOfDay, toCalendar } from './core/time';
import { WORLD_START } from './gen/world';
import type { CharacterId, LocationId, SimEvent } from './model';
import { createSimulation, type Simulation } from './simulation';

interface Run {
  readonly sim: Simulation;
  readonly events: SimEvent[];
  readonly hash: string;
}

function run(
  seed: string | number,
  days: number,
  drive?: (sim: Simulation, end: number) => void,
): Run {
  const events: SimEvent[] = [];
  const hash = new StreamHash();
  const sim = createSimulation({
    seed,
    onEvent(event) {
      events.push(event);
      hash.update(JSON.stringify(event));
    },
  });
  const end = WORLD_START + days * DAY;
  if (drive) drive(sim, end);
  else sim.advance(end);
  expect(sim.world.time).toBe(end);
  return { sim, events, hash: hash.digest() };
}

describe('determinism', () => {
  it('replays the same history from the same seed', () => {
    expect(run(42, 30).hash).toBe(run(42, 30).hash);
  });

  it('produces different histories from different seeds', () => {
    expect(run(42, 30).hash).not.toBe(run(43, 30).hash);
  });

  it('is the same whether run in one go or in tiny steps (the golden rule)', () => {
    const reference = run('golden', 7).hash;

    const secondBySecond = run('golden', 7, (sim, end) => {
      // The first hours at real-time pace, then minutes, then hours.
      while (sim.world.time < WORLD_START + 2 * HOUR) sim.advance(sim.world.time + 1);
      while (sim.world.time < WORLD_START + DAY) sim.advance(sim.world.time + MINUTE);
      while (sim.world.time < end) sim.advance(Math.min(end, sim.world.time + HOUR));
    });

    const oneJobAtATime = run('golden', 7, (sim, end) => {
      while (!sim.advance(end, { maxJobs: 1 }).reachedTarget);
    });

    const chunkRng = createRng('chunks');
    const randomChunks = run('golden', 7, (sim, end) => {
      while (sim.world.time < end) {
        const step = chunkRng.pick([1, 60, 3600, DAY, 7 * DAY]);
        sim.advance(Math.min(end, sim.world.time + step), { maxJobs: chunkRng.int(1, 50) });
      }
    });

    expect(secondBySecond.hash).toBe(reference);
    expect(oneJobAtATime.hash).toBe(reference);
    expect(randomChunks.hash).toBe(reference);
  });
});

describe('advance', () => {
  it('refuses to go back in time', () => {
    const sim = createSimulation({ seed: 1 });
    sim.advance(WORLD_START + HOUR);
    expect(() => sim.advance(WORLD_START)).toThrow(RangeError);
  });

  it('stops early when the job budget runs out, at the last job run', () => {
    const sim = createSimulation({ seed: 1 });
    const result = sim.advance(WORLD_START + DAY, { maxJobs: 3 });
    expect(result).toEqual({ jobsRun: 3, reachedTarget: false });
    expect(sim.world.time).toBeLessThan(WORLD_START + DAY);
  });
});

describe('a simulated season', () => {
  const { sim, events } = run(7, 100);

  it('numbers events sequentially and never goes back in time', () => {
    events.forEach((e, i) => {
      expect(e.id).toBe(i + 1);
      if (i > 0) expect(e.t).toBeGreaterThanOrEqual(events[i - 1]!.t);
    });
  });

  it('opens with the world and its characters', () => {
    expect(events[0]?.type).toBe('world.created');
    const founders = events.filter((e) => e.type === 'character.introduced' && !e.data.newcomer);
    expect(founders).toHaveLength(20);
    expect(founders.every((e) => e.t === WORLD_START)).toBe(true);
  });

  it('announces the new season at midnight', () => {
    const seasons = events.filter((e) => e.type === 'calendar.season');
    expect(seasons.map((e) => e.t)).toEqual([SEASON]);
    expect(seasons[0]?.data).toEqual({ year: 1, season: 1 });
  });

  it('never sets out at night', () => {
    for (const e of events.filter((e) => e.type === 'travel.depart')) {
      const t = timeOfDay(e.t);
      expect(
        t >= 6 * HOUR && t < 21 * HOUR,
        `departure at ${JSON.stringify(toCalendar(e.t))}`,
      ).toBe(true);
    }
  });

  it('keeps every journey consistent: depart, pass through, arrive where it was going', () => {
    const journeys = new Map<CharacterId, { destination: LocationId; at: LocationId | null }>();
    const position = new Map<CharacterId, LocationId>();
    for (const e of events) {
      switch (e.type) {
        case 'character.introduced':
          position.set(e.data.characterId, e.data.homeId);
          break;
        case 'travel.depart':
          expect(journeys.has(e.data.characterId)).toBe(false);
          expect(position.get(e.data.characterId)).toBe(e.data.fromId);
          journeys.set(e.data.characterId, { destination: e.data.destinationId, at: null });
          break;
        case 'travel.pass':
          expect(journeys.get(e.data.characterId)?.destination).toBe(e.data.destinationId);
          break;
        case 'travel.arrive':
          expect(journeys.get(e.data.characterId)?.destination).toBe(e.data.locationId);
          journeys.delete(e.data.characterId);
          position.set(e.data.characterId, e.data.locationId);
          break;
        case 'character.pastime':
        case 'character.rest':
        case 'character.convalesce':
        case 'delve.enter':
          expect(journeys.has(e.data.characterId)).toBe(false);
          expect(position.get(e.data.characterId)).toBe(e.data.locationId);
          break;
      }
    }
  });

  it('leaves the world state matching the events', () => {
    for (const character of sim.world.characters.values()) {
      if (character.activity.kind === 'traveling') {
        expect(character.locationId).toBeNull();
      } else {
        expect(sim.world.locations.has(character.locationId!)).toBe(true);
      }
    }
  });

  it('gets everyone on the road and visits every place', () => {
    const travelers = new Set(
      events.filter((e) => e.type === 'travel.depart').map((e) => e.actors[0]),
    );
    const founders = [...sim.world.characters.values()].filter((c) => c.arrivedAt === WORLD_START);
    for (const founder of founders) expect(travelers.has(founder.id)).toBe(true);
    const visited = new Set(
      events.filter((e) => e.type === 'travel.arrive').map((e) => e.locationId),
    );
    expect(visited.size).toBe(sim.world.locations.size);
  });
});

describe('a year of danger', () => {
  const { sim, events } = run('danger', 365);
  const characters = [...sim.world.characters.values()];

  it('has fights, deaths, loot and newcomers', () => {
    const count = (type: SimEvent['type']) => events.filter((e) => e.type === type).length;
    expect(count('combat.start')).toBeGreaterThan(500);
    expect(count('combat.victory')).toBeGreaterThan(count('combat.escape'));
    expect(count('character.death')).toBeGreaterThan(5);
    expect(count('trade.sell')).toBeGreaterThan(100);
    expect(characters.some((c) => c.arrivedAt > WORLD_START)).toBe(true);
  });

  it('closes every fight with a victory, an escape or a death, one fight at a time', () => {
    const fighting = new Set<CharacterId>();
    for (const e of events) {
      if (e.type === 'combat.start') {
        expect(fighting.has(e.data.characterId)).toBe(false);
        fighting.add(e.data.characterId);
      }
      if (e.type === 'combat.victory' || e.type === 'combat.escape') {
        expect(fighting.delete(e.data.characterId)).toBe(true);
      }
      if (e.type === 'character.death' && e.data.cause.kind === 'creature') {
        expect(fighting.delete(e.data.characterId)).toBe(true);
      }
    }
    // Only fights still going at the end of the year remain open.
    expect(fighting.size).toBe(sim.world.encounters.size);
  });

  it('keeps the dead dead', () => {
    const deathAt = new Map<string, number>();
    for (const e of events) {
      if (e.type === 'character.death') deathAt.set(e.data.characterId, e.id);
      for (const actor of e.actors) {
        const died = deathAt.get(actor);
        if (died !== undefined) expect(e.id, `${e.type} after death`).toBe(died);
      }
    }
    for (const c of characters.filter((c) => c.death)) {
      expect(c.activity.kind).toBe('dead');
      expect(c.hp).toBe(0);
    }
  });

  it('keeps bodies and purses within bounds', () => {
    for (const c of characters) {
      expect(c.hp).toBeGreaterThanOrEqual(0);
      expect(c.hp).toBeLessThanOrEqual(c.maxHp);
      expect(c.stamina).toBeGreaterThanOrEqual(0);
      expect(c.stamina).toBeLessThanOrEqual(c.maxStamina);
      expect(c.gold).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts kills on the slayer', () => {
    const kills = new Map<string, number>();
    for (const e of events) {
      if (e.type === 'combat.kill')
        kills.set(e.data.characterId, (kills.get(e.data.characterId) ?? 0) + 1);
    }
    for (const c of characters) {
      const total = Object.values(c.kills).reduce((sum, n) => sum + n, 0);
      expect(total).toBe(kills.get(c.id) ?? 0);
    }
  });

  it('keeps dungeon populations between zero and capacity', () => {
    for (const location of sim.world.locations.values()) {
      for (const { creature, max } of location.dungeon?.def.inhabitants ?? []) {
        const count = location.dungeon!.population[creature] ?? 0;
        expect(count).toBeGreaterThanOrEqual(0);
        expect(count).toBeLessThanOrEqual(max);
      }
    }
  });

  it('replaces the fallen with newcomers, never above the target population', () => {
    let living = 0;
    for (const e of events) {
      if (e.type === 'character.introduced') living++;
      if (e.type === 'character.death') living--;
      expect(living).toBeLessThanOrEqual(20);
    }
    expect(living).toBeGreaterThanOrEqual(15);
  });
});
