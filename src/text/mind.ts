import { TRAIT_POLES, TRAITS, type TraitId, type Traits } from '../content';
import type { Goal, LocationId, Memory, Motive } from '../sim';
import type { NameResolver } from './names';
import { aCreature, creatureGroup } from './words';
import { spellName } from './items';

/** A reason in a few words: "restless", "hungry for glory". */
export function describeMotive(motive: Motive, names: NameResolver): string {
  switch (motive.kind) {
    case 'drive':
      switch (motive.drive) {
        case 'purpose':
          return 'restless';
        case 'glory':
          return 'hungry for glory';
        case 'wealth':
          return 'short of coin';
        case 'companionship':
          return 'craving company';
        case 'health':
          return 'needing rest';
      }
      break;
    case 'fond':
      return names.location(motive.locationId) ? 'it has paid well before' : 'it paid well before';
    case 'novelty':
      return 'curious to see it';
    case 'home':
      return 'missing home';
    case 'loot':
      return 'with loot to sell';
    case 'bounty': {
      const outlaw = names.character(motive.outlawId);
      return outlaw ? `for the bounty on ${outlaw.name}` : 'for a bounty';
    }
    case 'revenge': {
      const foe = names.character(motive.characterId);
      return foe ? `to avenge a friend on ${foe.name}` : 'for revenge';
    }
    case 'friends':
      return 'with friends';
  }
}

/** "(restless; hungry for glory)", or empty if there are no reasons. */
export function describeWhy(why: readonly Motive[], names: NameResolver): string {
  if (why.length === 0) return '';
  return `(${why.map((m) => describeMotive(m, names)).join('; ')})`;
}

const GOAL_PHRASES: Record<Goal['kind'], string> = {
  delve: 'Off to delve',
  heal: 'Recovering from wounds',
  sell: 'Selling loot',
  socialize: 'Seeking company',
  train: 'Training',
  study: 'Studying the arcane',
  pray: 'At prayer',
  browse: 'Browsing the market',
  forage: 'Living off the land',
  travel: 'Traveling',
  home: 'Heading home',
  rest: 'Sleeping',
  wait: 'Biding time',
  hunt: 'Hunting',
  lurk: 'Lying in wait for travelers',
};

/** What a character is trying to do: "Off to delve in the Dungeon of Misery". */
export function describeGoal(goal: Goal, names: NameResolver): string {
  const place = goal.locationId ? names.location(goal.locationId) : undefined;
  const where = place ? ` ${place.article ? `${place.article} ` : ''}${place.name}` : '';
  switch (goal.kind) {
    case 'delve':
      return `${GOAL_PHRASES.delve} in${where}`;
    case 'travel':
    case 'home':
      return `${GOAL_PHRASES[goal.kind]} to${where}`;
    case 'hunt': {
      const quarry = goal.targetId ? names.character(goal.targetId) : undefined;
      return quarry ? `Hunting ${quarry.name} in${where}` : `Hunting in${where}`;
    }
    default:
      return GOAL_PHRASES[goal.kind];
  }
}

/** A remembered moment in a line: "Nearly died to a warg in Gorefang Caves". */
export function describeMemory(memory: Memory, names: NameResolver): string {
  const at = (id: LocationId) => {
    const place = names.location(id);
    return place ? ` in ${place.article ? `${place.article} ` : ''}${place.name}` : '';
  };
  switch (memory.kind) {
    case 'near-death':
      return memory.creature
        ? `Nearly died to ${aCreature(memory.creature)}${at(memory.locationId)}`
        : `Nearly died${at(memory.locationId)}`;
    case 'triumph':
      return `Bested ${aCreature(memory.creature)}${at(memory.locationId)}`;
    case 'fled':
      return `Fled from ${creatureGroup(memory.creatures)}${at(memory.locationId)}`;
    case 'treasure':
      return `Found ${memory.itemName}${at(memory.locationId)}`;
    case 'backlash':
      return `Burned by a backfiring ${spellName(memory.spell)}${at(memory.locationId)}`;
    case 'level':
      return `Reached level ${memory.level}`;
    case 'grief': {
      const friend = names.character(memory.characterId);
      return friend ? `Lost a friend, ${friend.name}` : 'Lost a friend';
    }
    case 'wronged': {
      const who = names.character(memory.characterId)?.name ?? 'someone';
      return `Set upon by ${who}${at(memory.locationId)}`;
    }
  }
}

/** The word for where a trait sits: "bold", "timid", or null if ordinary. */
export function traitWord(trait: TraitId, value: number): string | null {
  const [low, high] = TRAIT_POLES[trait];
  if (value <= 0.3) return low;
  if (value >= 0.7) return high;
  return null;
}

/** The traits that stand out, strongest first: "bold, gregarious, impatient". */
export function personalitySummary(traits: Traits): string {
  const notable = TRAITS.map((t) => ({ t, distance: Math.abs(traits[t] - 0.5) }))
    .filter(({ t }) => traitWord(t, traits[t]) !== null)
    .sort((a, b) => b.distance - a.distance)
    .map(({ t }) => traitWord(t, traits[t])!);
  return notable.length > 0 ? notable.join(', ') : 'unremarkable';
}
