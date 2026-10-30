import type { PastimeId } from '../content';
import type { Character, LocationId, World } from '../sim';
import type { Segment } from './describe';
import { aCreature } from './words';

const PASTIME_PLACES: Record<PastimeId, string> = {
  tavern: 'At a tavern in ',
  market: 'At the market in ',
  training: 'Training in ',
  shrine: 'At a shrine in ',
  scout: 'Waiting outside ',
  forage: 'Foraging in ',
  hunt: 'Hunting in ',
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
    case 'dead': {
      const death = character.death;
      if (!death) return [{ text: 'Dead' }];
      const where = place(death.locationId);
      if (death.cause.kind === 'trap') return [{ text: 'Killed by a trap in ' }, where];
      return [{ text: `Slain by ${aCreature(death.cause.creature)} in ` }, where];
    }
  }
}

/** A word for a bravery score from 0 to 1. */
export function braveryWord(bravery: number): string {
  if (bravery < 0.3) return 'timid';
  if (bravery < 0.45) return 'cautious';
  if (bravery < 0.65) return 'steady';
  if (bravery < 0.85) return 'bold';
  return 'fearless';
}
