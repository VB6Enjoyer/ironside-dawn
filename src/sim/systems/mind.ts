import {
  DEFAULT_TRAIT_MEAN,
  DEFAULT_TRAIT_SD,
  SPECIES,
  TRAITS,
  type SpeciesId,
  type TraitId,
  type Traits,
} from '../../content';
import type { Rng } from '../core/rng';
import { DAY } from '../core/time';
import type { Character, DelveProgress, Drives, LocationId, Memory, MemoryEvent } from '../model';

/**
 * Minds (ROADMAP.md Phase 4, ARCHITECTURE.md §4.5–4.6): personality, drives,
 * fading memories, and expectations learned from experience.
 */

const TRAIT_MIN = 0.02;
const TRAIT_MAX = 0.98;
const MAX_MEMORIES = 20;
/** Weight of the newest trip when updating what a place is expected to be like. */
const EXPECTATION_LEARNING_RATE = 0.35;

/** How fast drives build up per day, before personality. */
const GLORY_PER_DAY = 0.06;
const COMPANIONSHIP_PER_DAY = 0.3;
const PURPOSE_PER_DAY = 0.12;

/** Days for a memory to fade to half its vividness. */
const HALF_LIFE_DAYS: Record<MemoryEvent['kind'], number> = {
  'near-death': 120,
  triumph: 60,
  fled: 45,
  treasure: 180,
  backlash: 90,
  level: 60,
  grief: 180,
  wronged: 120,
};

export function rollTraits(rng: Rng, species: SpeciesId): Traits {
  const tendencies = SPECIES[species].traits as Partial<
    Record<TraitId, { readonly mean: number; readonly sd?: number }>
  >;
  return Object.fromEntries(
    TRAITS.map((trait) => {
      const { mean = DEFAULT_TRAIT_MEAN, sd = DEFAULT_TRAIT_SD } = tendencies[trait] ?? {};
      return [trait, clampTrait(rng.gaussian(mean, sd))];
    }),
  ) as Traits;
}

/** Experience shifts a trait a little (bravery after a near-death or a triumph). */
export function nudgeTrait(character: Character, trait: TraitId, delta: number): void {
  character.traits = { ...character.traits, [trait]: clampTrait(character.traits[trait] + delta) };
}

export function initialDrives(rng: Rng): Drives {
  return {
    glory: rng.next() * 0.3,
    companionship: rng.next() * 0.3,
    purpose: 0.3 + rng.next() * 0.4,
  };
}

/** Lets drives build up for the time since they were last updated. */
export function updateDrives(character: Character, now: number): void {
  const days = Math.max(0, now - character.drivesAt) / DAY;
  character.drivesAt = now;
  if (days === 0) return;
  const { bravery, curiosity, sociability, patience } = character.traits;
  const d = character.drives;
  d.glory = clamp01(d.glory + days * GLORY_PER_DAY * (0.4 + 0.6 * (bravery + curiosity)));
  d.companionship = clamp01(d.companionship + days * COMPANIONSHIP_PER_DAY * sociability);
  d.purpose = clamp01(d.purpose + days * PURPOSE_PER_DAY * (1.3 - patience));
}

export function satisfy(character: Character, drive: keyof Drives, amount: number): void {
  character.drives[drive] = clamp01(character.drives[drive] - amount);
}

/** How much the body needs rest, from 0 (fresh) to 1 (barely standing). */
export function healthNeed(character: Character): number {
  const hp = character.hp / character.maxHp;
  const stamina = character.stamina / character.maxStamina;
  return clamp01(1 - Math.min(hp, stamina));
}

/** How much a character wants money: the greedy want more, and want it more. */
export function wealthNeed(character: Character): number {
  const greed = character.traits.greed;
  const enough = 60 + 500 * greed;
  return clamp01(1 - character.gold / enough) * (0.4 + 0.6 * greed);
}

export function remember(
  character: Character,
  now: number,
  event: MemoryEvent,
  salience: number,
): void {
  character.memories.push({ ...event, at: now, salience } as Memory);
  if (character.memories.length <= MAX_MEMORIES) return;
  // Forget whatever has faded most.
  let faintest = 0;
  for (let i = 1; i < character.memories.length; i++) {
    const m = character.memories[i]!;
    if (vividness(m, now) < vividness(character.memories[faintest]!, now)) faintest = i;
  }
  character.memories.splice(faintest, 1);
}

/** How vivid a memory is now: its salience, halved every half-life. */
export function vividness(memory: Memory, now: number): number {
  const days = (now - memory.at) / DAY;
  return memory.salience * 0.5 ** (days / HALF_LIFE_DAYS[memory.kind]);
}

/** Memories, most vivid first. */
export function vividMemories(character: Character, now: number, count: number): Memory[] {
  return [...character.memories]
    .sort((a, b) => vividness(b, now) - vividness(a, now))
    .slice(0, count);
}

/** Learns from a finished delve: what the place gave, and what it cost. */
export function learnFromDelve(
  character: Character,
  progress: DelveProgress,
  fled: boolean,
  now: number,
): void {
  const reward = progress.goldFound + progress.valueFound;
  const danger = clamp01(1 - progress.lowestHp + (fled ? 0.2 : 0));
  const previous = character.expectations[progress.locationId];
  if (!previous) {
    character.expectations[progress.locationId] = { trips: 1, reward, danger, lastAt: now };
    return;
  }
  const rate = EXPECTATION_LEARNING_RATE;
  previous.trips++;
  previous.reward += (reward - previous.reward) * rate;
  previous.danger += (danger - previous.danger) * rate;
  previous.lastAt = now;
}

/**
 * How frightening a place is to this character: what it has usually cost
 * them, plus vivid memories of nearly dying or fleeing there.
 */
export function fearOf(character: Character, locationId: LocationId, now: number): number {
  const remembered = fearsRemembered(character, now).get(locationId) ?? 0;
  return Math.min(1.5, (character.expectations[locationId]?.danger ?? 0) + remembered);
}

/**
 * What a character's memories make them fear, place by place, worked out once
 * per moment: a decision asks about every dungeon in reach, and the memories
 * are the same for each.
 */
const fearCache = new WeakMap<
  Character,
  {
    now: number;
    memories: readonly Memory[];
    length: number;
    last: Memory | undefined;
    fears: Map<LocationId, number>;
  }
>();

function fearsRemembered(character: Character, now: number): Map<LocationId, number> {
  const memories = character.memories;
  const cached = fearCache.get(character);
  if (
    cached &&
    cached.now === now &&
    cached.memories === memories &&
    cached.length === memories.length &&
    cached.last === memories[memories.length - 1]
  ) {
    return cached.fears;
  }
  const fears = new Map<LocationId, number>();
  for (const memory of memories) {
    if (memory.kind !== 'near-death' && memory.kind !== 'fled' && memory.kind !== 'wronged') {
      continue;
    }
    const weight = memory.kind === 'near-death' ? 0.6 : memory.kind === 'fled' ? 0.3 : 0.4;
    fears.set(
      memory.locationId,
      (fears.get(memory.locationId) ?? 0) + vividness(memory, now) * weight,
    );
  }
  fearCache.set(character, {
    now,
    memories,
    length: memories.length,
    last: memories[memories.length - 1],
    fears,
  });
  return fears;
}

export function hasVisited(character: Character, locationId: LocationId): boolean {
  // The list only grows, so a set of it is good until it does.
  const visited = character.visited;
  let known = visitedSets.get(visited);
  if (!known || known.size !== visited.length) {
    known = new Set(visited);
    visitedSets.set(visited, known);
  }
  return known.has(locationId);
}

const visitedSets = new WeakMap<readonly LocationId[], Set<LocationId>>();

export function markVisited(character: Character, locationId: LocationId): void {
  if (!character.visited.includes(locationId)) character.visited.push(locationId);
}

function clampTrait(value: number): number {
  return Math.min(TRAIT_MAX, Math.max(TRAIT_MIN, value));
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
