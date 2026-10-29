import type { PastimeId } from '../content';
import type { CharacterId, EventOfType, EventType, LocationId, SimEvent } from '../sim';
import { describeDuration, seasonName } from './calendar';
import { SPECIES_NAMES, type NameResolver } from './names';

/**
 * Turns events into prose (ARCHITECTURE.md §4.4). Each event type has a few
 * phrasings; the event's ID picks one, so an event always reads the same way.
 *
 * Output is a list of segments rather than a string, so the UI can make the
 * names of characters and places into links.
 */

export type Segment =
  | { readonly text: string }
  | {
      readonly text: string;
      readonly ref: { readonly kind: 'character'; readonly id: CharacterId };
    }
  | {
      readonly text: string;
      readonly ref: { readonly kind: 'location'; readonly id: LocationId };
    };

type Part = string | Segment;

interface Helpers {
  /** A character's name. */
  c(id: CharacterId): Segment;
  /** A place's name, with its article ("the Witherwood"). */
  l(id: LocationId): Segment;
  kindOf(id: LocationId): 'town' | 'dungeon' | 'wilderness' | undefined;
  speciesOf(id: CharacterId): string;
}

type Phrasings<T extends EventType> = readonly ((e: EventOfType<T>, h: Helpers) => Part[])[];

const PASTIME_PHRASES: Record<PastimeId, readonly ((c: Segment, l: Segment) => Part[])[]> = {
  tavern: [
    (c, l) => [c, ' spends a while in a tavern in ', l, '.'],
    (c, l) => [c, ' nurses an ale in a ', l, ' tavern.'],
    (c, l) => [c, ' trades stories over a drink in ', l, '.'],
  ],
  market: [
    (c, l) => [c, ' wanders the market stalls of ', l, '.'],
    (c, l) => [c, ' haggles with a trader in ', l, '.'],
  ],
  training: [
    (c, l) => [c, ' drills with a practice blade in ', l, '.'],
    (c, l) => [c, ' spars in the yard behind an inn in ', l, '.'],
  ],
  shrine: [
    (c, l) => [c, ' lights a candle at the shrine in ', l, '.'],
    (c, l) => [c, ' prays quietly at a wayside shrine in ', l, '.'],
  ],
  explore: [
    (c, l) => [c, ' picks carefully through the upper halls of ', l, '.'],
    (c, l) => [c, ' ventures a little way into ', l, ', torch in hand.'],
  ],
  scout: [
    (c, l) => [c, ' watches the entrance of ', l, ' from a safe distance.'],
    (c, l) => [c, ' circles the outskirts of ', l, ', looking for signs of life.'],
  ],
  forage: [
    (c, l) => [c, ' forages for herbs in ', l, '.'],
    (c, l) => [c, ' gathers berries and roots in ', l, '.'],
  ],
  hunt: [(c, l) => [c, ' goes hunting in ', l, '.'], (c, l) => [c, ' sets snares in ', l, '.']],
};

const PHRASINGS: { readonly [T in EventType]: Phrasings<T> } = {
  'world.created': [
    () => ['The world stirs. Year 1 begins in the season of Thaw.'],
    () => ['Dawn breaks over a new world. It is the first day of Thaw, Year 1.'],
  ],
  'calendar.season': [
    (e) =>
      e.data.season === 0
        ? [`Year ${e.data.year} begins with the first thaw.`]
        : [`The season turns: ${seasonName(e.data.season)} has come.`],
    (e) =>
      e.data.season === 0
        ? [`A new year dawns. Year ${e.data.year} has begun.`]
        : [`${seasonName(e.data.season)} settles over the land.`],
  ],
  'character.introduced': [
    (e, h) => [
      h.c(e.data.characterId),
      `, a ${h.speciesOf(e.data.characterId)} of `,
      h.l(e.data.homeId),
      ', takes up the adventuring life.',
    ],
    (e, h) => [h.c(e.data.characterId), ' of ', h.l(e.data.homeId), ' is ready for the road.'],
    (e, h) => [h.c(e.data.characterId), ' sharpens a blade in ', h.l(e.data.homeId), ', restless.'],
  ],
  'character.pastime': [
    (e, h) => {
      const variants = PASTIME_PHRASES[e.data.pastime];
      const phrase = variants[e.id % variants.length]!;
      return phrase(h.c(e.data.characterId), h.l(e.data.locationId));
    },
  ],
  'character.rest': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const l = h.l(e.data.locationId);
      switch (h.kindOf(e.data.locationId)) {
        case 'town':
          return e.id % 2 === 0
            ? [c, ' takes a room for the night in ', l, '.']
            : [c, ' turns in for the night at an inn in ', l, '.'];
        case 'dungeon':
          return [c, ' shelters for the night near ', l, '.'];
        default:
          return e.id % 2 === 0
            ? [c, ' makes camp for the night in ', l, '.']
            : [c, ' beds down under the stars in ', l, '.'];
      }
    },
  ],
  'travel.depart': [
    (e, h) => [
      h.c(e.data.characterId),
      ' sets out from ',
      h.l(e.data.fromId),
      ' toward ',
      h.l(e.data.destinationId),
      '.',
    ],
    (e, h) => [
      h.c(e.data.characterId),
      ' leaves ',
      h.l(e.data.fromId),
      ', bound for ',
      h.l(e.data.destinationId),
      '.',
    ],
    (e, h) => [
      h.c(e.data.characterId),
      ' takes the road from ',
      h.l(e.data.fromId),
      ` to `,
      h.l(e.data.destinationId),
      `, ${describeDuration(e.data.expectedDuration)} away.`,
    ],
  ],
  'travel.pass': [
    (e, h) => [
      h.c(e.data.characterId),
      ' passes through ',
      h.l(e.data.locationId),
      ' on the way to ',
      h.l(e.data.destinationId),
      '.',
    ],
    (e, h) => [
      h.c(e.data.characterId),
      ' pauses briefly in ',
      h.l(e.data.locationId),
      ', then presses on toward ',
      h.l(e.data.destinationId),
      '.',
    ],
  ],
  'travel.arrive': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const l = h.l(e.data.locationId);
      switch (h.kindOf(e.data.locationId)) {
        case 'town':
          return e.id % 2 === 0
            ? [c, ' arrives in ', l, '.']
            : [c, ' walks through the gates of ', l, '.'];
        case 'dungeon':
          return e.id % 2 === 0
            ? [c, ' reaches the mouth of ', l, '.']
            : [c, ' stands before ', l, ' at last.'];
        default:
          return e.id % 2 === 0 ? [c, ' reaches ', l, '.'] : [c, ' enters ', l, '.'];
      }
    },
  ],
};

export function describeEvent(event: SimEvent, names: NameResolver): Segment[] {
  const helpers: Helpers = {
    c(id) {
      const character = names.character(id);
      return { text: character?.name ?? 'Someone', ref: { kind: 'character', id } };
    },
    l(id) {
      const location = names.location(id);
      if (!location) return { text: 'somewhere', ref: { kind: 'location', id } };
      const text = location.article ? `${location.article} ${location.name}` : location.name;
      return { text, ref: { kind: 'location', id } };
    },
    kindOf(id) {
      return names.location(id)?.kind;
    },
    speciesOf(id) {
      const species = names.character(id)?.species;
      return species ? SPECIES_NAMES[species].singular : 'traveler';
    },
  };

  const phrasings = PHRASINGS[event.type] as Phrasings<typeof event.type>;
  const phrasing = phrasings[event.id % phrasings.length]!;
  return phrasing(event as never, helpers).map((part) =>
    typeof part === 'string' ? { text: part } : part,
  );
}

export function toPlainText(segments: readonly Segment[]): string {
  return segments.map((s) => s.text).join('');
}
