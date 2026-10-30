import {
  creatureDef,
  type CreatureId,
  type ItemBaseId,
  type PastimeId,
  type WeaponId,
} from '../content';
import type { CharacterId, Combatant, EventOfType, EventType, LocationId, SimEvent } from '../sim';
import { describeDuration, seasonName } from './calendar';
import { anItem, itemName, legendTitle, SKILL_PHRASES, spellName } from './items';
import { SPECIES_NAMES, type NameResolver } from './names';
import {
  aCreature,
  article,
  capitalize,
  condition,
  countWord,
  creatureGroup,
  lootList,
  spoils,
  theCreature,
  TRAP_NAMES,
} from './words';

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
  /** Either side of a fight: a character's name or "the skeleton". */
  who(combatant: Combatant): Part;
  kindOf(id: LocationId): 'town' | 'dungeon' | 'wilderness' | undefined;
  /** "a human", "an elf". */
  aSpecies(id: CharacterId): string;
  weaponOf(id: CharacterId): ItemBaseId | undefined;
  /** Picks a variant by event ID. */
  pick<T>(options: readonly T[]): T;
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
  study: [
    (c, l) => [c, ' pores over old tomes in ', l, '.'],
    (c, l) => [c, ' studies with a hedge-mage in ', l, '.'],
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

const WEAPON_VERBS: Record<WeaponId, readonly string[]> = {
  longsword: ['slashes', 'cuts'],
  shortsword: ['stabs', 'slashes'],
  spear: ['skewers', 'thrusts into'],
  mace: ['batters', 'clubs'],
  axe: ['hacks into', 'cleaves'],
  warhammer: ['smashes', 'hammers'],
  leafblade: ['slices', 'carves into'],
  greatsword: ['cleaves', 'hews'],
  battleaxe: ['hacks into', 'splits'],
};

const CREATURE_VERBS: Record<CreatureId, readonly string[]> = {
  'giant-rat': ['bites', 'gnaws at'],
  wolf: ['bites', 'savages'],
  warg: ['savages', 'mauls'],
  'giant-spider': ['bites', 'lunges at'],
  'cave-bear': ['mauls', 'rakes'],
  skeleton: ['slashes', 'hacks at'],
  zombie: ['claws at', 'pummels'],
  'infernal-imp': ['claws', 'scorches'],
  hellhound: ['bites', 'sears'],
};

function attackVerb(h: Helpers, attacker: Combatant): string {
  if (attacker.kind === 'creature') return h.pick(CREATURE_VERBS[attacker.ref.species]);
  const weapon = h.weaponOf(attacker.id);
  const verbs = weapon ? WEAPON_VERBS[weapon as WeaponId] : undefined;
  return verbs ? h.pick(verbs) : 'strikes';
}

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
    (e, h) => {
      const c = h.c(e.data.characterId);
      const home = h.l(e.data.homeId);
      if (e.data.newcomer) {
        return [c, `, ${h.aSpecies(e.data.characterId)}, arrives in `, home, ' seeking fortune.'];
      }
      return h.pick<Part[]>([
        [c, `, ${h.aSpecies(e.data.characterId)} of `, home, ', takes up the adventuring life.'],
        [c, ' of ', home, ' is ready for the road.'],
        [c, ' sharpens a blade in ', home, ', restless.'],
      ]);
    },
  ],
  'character.pastime': [
    (e, h) =>
      h.pick(PASTIME_PHRASES[e.data.pastime])(h.c(e.data.characterId), h.l(e.data.locationId)),
  ],
  'character.rest': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const l = h.l(e.data.locationId);
      switch (h.kindOf(e.data.locationId)) {
        case 'town':
          if (!e.data.paid) return [c, " can't afford an inn and sleeps in a stable in ", l, '.'];
          return h.pick<Part[]>([
            [c, ' takes a room for the night in ', l, '.'],
            [c, ' turns in for the night at an inn in ', l, '.'],
          ]);
        case 'dungeon':
          return [c, ' makes camp for the night outside ', l, '.'];
        default:
          return h.pick<Part[]>([
            [c, ' makes camp for the night in ', l, '.'],
            [c, ' beds down under the stars in ', l, '.'],
          ]);
      }
    },
  ],
  'character.convalesce': [
    (e, h) => [
      h.c(e.data.characterId),
      ' rests in ',
      h.l(e.data.locationId),
      ' to tend to wounds.',
    ],
    (e, h) => [
      h.c(e.data.characterId),
      ' spends the day abed in ',
      h.l(e.data.locationId),
      ', recovering.',
    ],
  ],
  'character.death': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const l = h.l(e.data.locationId);
      const legacy =
        e.data.kills > 0
          ? `, having felled ${e.data.kills === 1 ? 'one foe' : `${countWord(e.data.kills)} foes`}`
          : '';
      const cause = e.data.cause;
      if (cause.kind === 'trap') {
        return [
          c,
          ` dies in ${article(TRAP_NAMES[cause.trap])} ${TRAP_NAMES[cause.trap]} in `,
          l,
          `${legacy}.`,
        ];
      }
      if (cause.kind === 'magic') {
        return [c, ` is consumed by a backfiring ${spellName(cause.spell)} in `, l, `${legacy}.`];
      }
      return h.pick<Part[]>([
        [c, ` is slain by ${aCreature(cause.creature)} in `, l, `${legacy}.`],
        [c, ` falls to ${aCreature(cause.creature)} in `, l, `${legacy}.`],
      ]);
    },
  ],

  'travel.depart': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const from = h.l(e.data.fromId);
      const to = h.l(e.data.destinationId);
      switch (e.data.reason) {
        case 'heal':
          return [c, ' limps out of ', from, ', heading for ', to, ' to recover.'];
        case 'home':
          return [c, ' heads for ', to, ' with a heavy pack.'];
        case 'delve':
          return h.pick<Part[]>([
            [c, ' sets out from ', from, ' toward ', to, '.'],
            [c, ' leaves ', from, ', bound for ', to, ', eager for plunder.'],
            [
              c,
              ' takes the road from ',
              from,
              ' to ',
              to,
              `, ${describeDuration(e.data.expectedDuration)} away.`,
            ],
          ]);
        case 'wander':
          return h.pick<Part[]>([
            [c, ' sets out from ', from, ' toward ', to, '.'],
            [c, ' leaves ', from, ', bound for ', to, '.'],
            [
              c,
              ' takes the road from ',
              from,
              ' to ',
              to,
              `, ${describeDuration(e.data.expectedDuration)} away.`,
            ],
          ]);
      }
    },
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
          return h.pick<Part[]>([
            [c, ' arrives in ', l, '.'],
            [c, ' walks through the gates of ', l, '.'],
          ]);
        case 'dungeon':
          return h.pick<Part[]>([
            [c, ' reaches the mouth of ', l, '.'],
            [c, ' stands before ', l, ' at last.'],
          ]);
        default:
          return h.pick<Part[]>([
            [c, ' reaches ', l, '.'],
            [c, ' enters ', l, '.'],
          ]);
      }
    },
  ],

  'delve.enter': [
    (e, h) => [h.c(e.data.characterId), ' enters ', h.l(e.data.locationId), '.'],
    (e, h) => [
      h.c(e.data.characterId),
      ' lights a torch and descends into ',
      h.l(e.data.locationId),
      '.',
    ],
    (e, h) => [h.c(e.data.characterId), ' slips quietly into ', h.l(e.data.locationId), '.'],
  ],
  'delve.quiet': [
    (e, h) => [h.c(e.data.characterId), ' finds nothing but dust and bones in the next chamber.'],
    (e, h) => [h.c(e.data.characterId), ' picks through an empty chamber.'],
    (e, h) => [h.c(e.data.characterId), ' presses deeper into ', h.l(e.data.locationId), '.'],
  ],
  'delve.treasure': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const found = spoils(e.data.gold, e.data.items);
      switch (e.data.lock) {
        case 'picked':
          return [c, ` picks the lock of an old chest and finds ${found}.`];
        case 'forced':
          return [c, ` smashes open a locked chest, spoiling much of what was inside: ${found}.`];
        case 'none':
          return h.pick<Part[]>([
            [c, ` finds ${found} in a hidden alcove.`],
            [c, ` pries open an old chest: ${found}.`],
          ]);
      }
    },
  ],
  'delve.trap': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const trap = TRAP_NAMES[e.data.trap];
      if (e.data.avoided) return [c, ` spots ${article(trap)} ${trap} and steps around it.`];
      const dizzy = e.data.dizzy ? ', and reels, dizzy' : '';
      return [c, ` triggers ${article(trap)} ${trap}, taking ${e.data.damage} damage${dizzy}.`];
    },
  ],
  'delve.avoid': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const foes = creatureGroup(e.data.foes);
      return e.data.success
        ? [c, ` spots ${foes} and slips away unseen.`]
        : [c, ` tries to slip past ${foes}, but is spotted.`];
    },
  ],
  'delve.exit': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const l = h.l(e.data.locationId);
      if (e.data.fled) return [c, ' stumbles out of ', l, ', fleeing for dear life.'];
      const chambers = `${countWord(e.data.rooms)} chamber${e.data.rooms === 1 ? '' : 's'}`;
      const found = [
        e.data.gold > 0 ? `${e.data.gold} gold` : '',
        e.data.items === 1
          ? 'one trophy'
          : e.data.items > 1
            ? `${countWord(e.data.items)} trophies`
            : '',
      ].filter(Boolean);
      if (found.length === 0) return [c, ' leaves ', l, ` empty-handed after ${chambers}.`];
      return [c, ' emerges from ', l, ` after ${chambers}, carrying ${found.join(' and ')}.`];
    },
  ],

  'combat.start': [
    (e, h) => [h.c(e.data.characterId), ` is attacked by ${creatureGroup(e.data.foes)}.`],
    (e, h) => [h.c(e.data.characterId), ` engages ${creatureGroup(e.data.foes)} in battle.`],
    (e, h) => [h.c(e.data.characterId), ` comes face to face with ${creatureGroup(e.data.foes)}.`],
  ],
  'combat.attack': [
    (e, h) => {
      const { attacker, target } = e.data;
      if (!e.data.hit) {
        return h.pick<Part[]>([
          [h.who(attacker), ' swings at ', h.who(target), ' and misses.'],
          [h.who(target), ' evades ', h.who(attacker), '.'],
        ]);
      }
      const absorbed = e.data.absorbed > 0 ? `, ${e.data.absorbed} soaked up by a ward` : '';
      const damage = `${e.data.damage} damage${absorbed}`;
      const status =
        target.kind === 'character' && e.data.targetHp > 0
          ? ` (${Math.ceil(e.data.targetHp)}/${e.data.targetMaxHp})`
          : '';
      if (e.data.critical) {
        return [
          h.who(attacker),
          ' lands a crushing blow on ',
          h.who(target),
          ` for ${damage}${status}.`,
        ];
      }
      return [
        h.who(attacker),
        ` ${attackVerb(h, attacker)} `,
        h.who(target),
        ` for ${damage}${status}.`,
      ];
    },
  ],
  'combat.kill': [
    (e, h) => [h.c(e.data.characterId), ` slays ${theCreature(e.data.foe)}.`],
    (e, h) => [h.c(e.data.characterId), ` cuts down ${theCreature(e.data.foe)}.`],
    (e, h) => [`${theCreature(e.data.foe)} falls before `, h.c(e.data.characterId), '.'],
  ],
  'combat.flee': [
    (e, h) => {
      const who = e.data.who;
      if (who.kind === 'character') {
        return e.data.success
          ? [h.who(who), ' breaks away and runs.']
          : [h.who(who), ' tries to flee, but is cut off.'];
      }
      const family = creatureDef(who.ref.species).family;
      if (!e.data.success) return [h.who(who), ' tries to escape, but is cornered.'];
      return [h.who(who), family === 'beast' ? ' flees, whimpering.' : ' flees into the dark.'];
    },
  ],
  'combat.victory': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const state = condition(e.data.hp, e.data.maxHp);
      const loot = spoils(e.data.gold, e.data.items);
      const tail = loot ? `, and loots ${loot}.` : '.';
      return h.pick<Part[]>([
        [c, ` defeats ${creatureGroup(e.data.foes)}, ${state}${tail}`],
        [c, ` stands victorious over ${creatureGroup(e.data.foes)}, ${state}${tail}`],
      ]);
    },
  ],
  'combat.escape': [
    (e, h) => [h.c(e.data.characterId), ` escapes, ${condition(e.data.hp, e.data.maxHp)}.`],
    (e, h) => [h.c(e.data.characterId), ` gets away, ${condition(e.data.hp, e.data.maxHp)}.`],
  ],

  'character.levelup': [
    (e, h) => [h.c(e.data.characterId), ` reaches level ${e.data.level}.`],
    (e, h) => [h.c(e.data.characterId), ` grows stronger, reaching level ${e.data.level}.`],
  ],
  'character.skill': [
    (e, h) => [
      h.c(e.data.characterId),
      ` is now ${article(e.data.rank)} ${e.data.rank} ${SKILL_PHRASES[e.data.skill]}.`,
    ],
  ],
  'item.equip': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const item = anItem(e.data.item);
      const old = e.data.replaced ? `, setting aside ${anItem(e.data.replaced)}` : '';
      switch (e.data.item.base) {
        case 'padded':
        case 'leather':
        case 'scale':
        case 'chain':
        case 'plate':
          return [c, ` dons ${item}${old}.`];
        case 'ring':
        case 'amulet':
        case 'charm':
          return [c, ` puts on ${item}${old}.`];
        default:
          return [c, ` takes up ${item}${old}.`];
      }
    },
  ],
  'item.legend': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const l = h.l(e.data.locationId);
      if (e.data.previousOwner) {
        return [
          c,
          ` finds ${itemName(e.data.item)} in `,
          l,
          ', where ',
          h.c(e.data.previousOwner),
          ' fell.',
        ];
      }
      return [c, ` finds ${legendTitle(e.data.item)}, in `, l, '.'];
    },
  ],
  'magic.learn': [
    (e, h) => [h.c(e.data.characterId), ` learns to cast ${spellName(e.data.spell)}.`],
    (e, h) => [h.c(e.data.characterId), ` masters the ${spellName(e.data.spell)}.`],
  ],
  'magic.cast': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const spell = spellName(e.data.spell);
      const target = e.data.target ? theCreature(e.data.target) : 'the foe';
      const { outcome, amount, paid } = e.data;
      if (outcome === 'failure') return [c, `'s ${spell} fizzles out.`];
      if (outcome === 'backlash') {
        return [`The ${spell} backlashes on `, c, `, who loses ${paid.health} health and reels.`];
      }
      const weak = outcome === 'partial';
      switch (e.data.spell) {
        case 'ember-bolt':
          return weak
            ? [c, `'s Ember Bolt sputters, singeing ${target} for ${amount} damage.`]
            : [c, ` hurls an Ember Bolt at ${target} for ${amount} damage.`];
        case 'mend-flesh':
          return [c, ` casts Mend Flesh, paying in blood, and heals ${amount}.`];
        case 'quickening':
          return weak
            ? [c, ' casts Quickening, and moves a little faster.']
            : [c, ' casts Quickening and moves like the wind.'];
        case 'ward-of-ash':
          return [c, ` raises a Ward of Ash${weak ? ', thin and flickering' : ''} (${amount}).`];
      }
    },
  ],
  'trade.sell': [
    (e, h) => [
      h.c(e.data.characterId),
      ` sells ${lootList(e.data.items)} in `,
      h.l(e.data.locationId),
      ` for ${e.data.gold} gold.`,
    ],
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
    who(combatant) {
      return combatant.kind === 'character' ? helpers.c(combatant.id) : theCreature(combatant.ref);
    },
    kindOf(id) {
      return names.location(id)?.kind;
    },
    aSpecies(id) {
      const species = names.character(id)?.species;
      const name = species ? SPECIES_NAMES[species].singular : 'traveler';
      return `${article(name)} ${name}`;
    },
    weaponOf(id) {
      return names.character(id)?.weapon;
    },
    pick(options) {
      return options[event.id % options.length]!;
    },
  };

  const phrasings = PHRASINGS[event.type] as Phrasings<typeof event.type>;
  const phrasing = helpers.pick(phrasings);
  const segments = phrasing(event as never, helpers).map((part) =>
    typeof part === 'string' ? { text: part } : part,
  );
  // Sentences may open with "the skeleton"; capitalize whatever comes first.
  const [first, ...rest] = segments;
  return first ? [{ ...first, text: capitalize(first.text) }, ...rest] : [];
}

export function toPlainText(segments: readonly Segment[]): string {
  return segments.map((s) => s.text).join('');
}
