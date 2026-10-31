import type { PastimeId } from '../content';
import type { Character, Deed, LocationId, World } from '../sim';
import type { Segment } from './describe';
import { SKILL_PHRASES, spellName } from './items';
import { aCreature, article } from './words';

const PASTIME_PLACES: Record<PastimeId, string> = {
  tavern: 'At a tavern in ',
  market: 'At the market in ',
  training: 'Training in ',
  shrine: 'At a shrine in ',
  study: 'Studying the arcane in ',
  scout: 'Waiting outside ',
  forage: 'Foraging in ',
  hunt: 'Hunting in ',
  lurk: 'Lying in wait by the road in ',
};

/** What a character is doing right now, for the character card. */
export function describeActivity(character: Character, world: World): Segment[] {
  const place = (id: LocationId | null): Segment => {
    const location = id === null ? undefined : world.locations.get(id);
    if (!location) return { text: 'the wilds' };
    const text = location.article ? `${location.article} ${location.name}` : location.name;
    return { text, ref: { kind: 'location', id: location.id } };
  };
  const here = place(character.locationId);
  const activity = character.activity;

  switch (activity.kind) {
    case 'idle':
      return [{ text: 'In ' }, here];
    case 'pastime':
      return [{ text: PASTIME_PLACES[activity.pastime] }, here];
    case 'resting':
      return activity.paid
        ? [{ text: 'Asleep at an inn in ' }, here]
        : [{ text: 'Sleeping rough in ' }, here];
    case 'convalescing':
      return [{ text: 'Recovering from wounds in ' }, here];
    case 'traveling':
      return [{ text: 'On the road to ' }, place(activity.destinationId)];
    case 'delving':
      return [{ text: 'Delving in ' }, here, { text: `, chamber ${activity.room}` }];
    case 'fighting':
      return [{ text: 'Fighting for their life in ' }, here];
    case 'accompanying': {
      const leader = world.characters.get(activity.leaderId);
      const name = leader ? `${leader.givenName} ${leader.familyName}` : 'their party';
      return character.locationId
        ? [
            { text: `With ` },
            { text: name, ref: { kind: 'character', id: activity.leaderId } },
            { text: ' in ' },
            here,
          ]
        : [
            { text: 'On the road with ' },
            { text: name, ref: { kind: 'character', id: activity.leaderId } },
          ];
    }
    case 'dead': {
      const death = character.death;
      if (!death) return [{ text: 'Dead' }];
      const where = place(death.locationId);
      switch (death.cause.kind) {
        case 'trap':
          return [{ text: 'Killed by a trap in ' }, where];
        case 'magic':
          return [{ text: `Killed by a backfiring ${spellName(death.cause.spell)} in ` }, where];
        case 'character': {
          const killer = world.characters.get(death.cause.characterId);
          const name = killer ? `${killer.givenName} ${killer.familyName}` : 'someone';
          return [
            { text: 'Killed by ' },
            { text: name, ref: { kind: 'character', id: death.cause.characterId } },
            { text: ' in ' },
            where,
          ];
        }
        case 'creature':
          return [{ text: `Slain by ${aCreature(death.cause.creature)} in ` }, where];
      }
    }
  }
}

/** One line for a remembered deed: "Slew an enraged warg". */
export function describeDeed(deed: Deed): string {
  switch (deed.kind) {
    case 'level':
      return `Reached level ${deed.level}`;
    case 'legend':
      return `Found ${deed.name}`;
    case 'slay':
      return `Slew ${aCreature(deed.creature)}`;
    case 'spell':
      return `Learned ${spellName(deed.spell)}`;
    case 'rank':
      return `Became ${article(deed.rank)} ${deed.rank} ${SKILL_PHRASES[deed.skill]}`;
  }
}
