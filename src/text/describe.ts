import {
  creatureDef,
  itemBase,
  LANGUAGES,
  packOf,
  spellDef,
  type CreatureId,
  type ItemBaseId,
  type LocationKind,
  type PastimeId,
  type WeaponId,
} from '../content';
import type {
  CharacterId,
  Combatant,
  EventOfType,
  EventType,
  LocationId,
  Occupation,
  SimEvent,
} from '../sim';
import { describeDuration, seasonName } from './calendar';
import { anItem, itemName, legendTitle, SKILL_PHRASES, spellName } from './items';
import { goodsList } from './goods';
import { describeWhy } from './mind';
import { peopleName, roleTitle, type NameResolver } from './names';
import {
  aCreature,
  article,
  capitalize,
  condition,
  countWord,
  creatureGroup,
  listOf,
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
  /** An aside, such as the reasons behind a decision, shown quieter. */
  | { readonly text: string; readonly aside: true }
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
  /** Several characters: "Rufus, Edith and Hugh". */
  group(ids: readonly CharacterId[]): Part[];
  /** The other side of a fight: names and creatures, "Reynard and two wolves". */
  foes(foes: readonly Combatant[]): Part[];
  /** A town's name, for bounty notices. */
  place(id: LocationId): Segment;
  kindOf(id: LocationId): LocationKind | undefined;
  /** "a human", "an elf", "a dvergr". */
  aSpecies(id: CharacterId): string;
  /** A name with what their culture calls them: "Kenji Yamamoto, a ronin with a katana,". */
  introduce(id: CharacterId): Part[];
  /** One of the gods worshipped where a place's culture holds sway, if it has its own. */
  deityOf(id: LocationId): string | null;
  /** A local legend's name: "the kappa of the Yanagi Ford". */
  myth(place: LocationId, creature: CreatureId | null, subject: CharacterId | null): Part[];
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
  lurk: [
    (c, l) => [c, ' lies in wait by the road through ', l, '.'],
    (c, l) => [c, ' watches the road through ', l, ' for travelers with full purses.'],
  ],
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
  katana: ['cuts', 'slashes'],
  naginata: ['sweeps at', 'cleaves'],
  yumi: ['looses an arrow at', 'shoots'],
  'bearded-axe': ['hooks and hacks', 'cleaves'],
  seax: ['stabs', 'slashes'],
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
  'dire-boar': ['gores', 'tramples'],
  troll: ['pounds', 'smashes'],
  ghoul: ['claws at', 'bites'],
  wraith: ['chills', 'drains'],
  soldier: ['cuts', 'thrusts at'],
  kappa: ['grapples', 'claws at'],
  kitsune: ['bites', 'sears with foxfire'],
  tengu: ['strikes', 'buffets'],
  yurei: ['chills', 'wails at'],
  oni: ['clubs', 'batters'],
  draugr: ['batters', 'claws at'],
  jotunn: ['smashes', 'tramples'],
};

/** "a troll", "six wolves". */
function herd(creature: CreatureId, count: number): string {
  const def = creatureDef(creature);
  return count === 1 ? `${article(def.name)} ${def.name}` : `${countWord(count)} ${def.plural}`;
}

function attackVerb(h: Helpers, attacker: Combatant): string {
  if (attacker.kind === 'creature') {
    // Creatures from content packs have no verbs of their own.
    return h.pick(CREATURE_VERBS[attacker.ref.species] ?? ['strikes', 'attacks']);
  }
  const weapon = h.weaponOf(attacker.id);
  const verbs = weapon ? WEAPON_VERBS[weapon as WeaponId] : undefined;
  return verbs ? h.pick(verbs) : 'strikes';
}

const RETIRE_REASONS = {
  age: 'at last, their best years behind them,',
  wealth: 'with a fortune made',
  family: 'for the sake of their family',
  nerves: 'after one narrow escape too many',
} as const;

export const OCCUPATION_NAMES: Record<Occupation, string> = {
  innkeeper: 'an innkeeper',
  smith: 'a smith',
  trainer: 'a weapons master',
  farmer: 'a farmer',
  clerk: 'a clerk of the trading house',
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
    (e, h) => {
      // At a shrine in a culture's lands, prayers go to its gods.
      const god = e.data.pastime === 'shrine' ? h.deityOf(e.data.locationId) : null;
      if (god)
        return [
          h.c(e.data.characterId),
          ` prays to ${god} at the shrine in `,
          h.l(e.data.locationId),
          '.',
        ];
      return h.pick(PASTIME_PHRASES[e.data.pastime])(
        h.c(e.data.characterId),
        h.l(e.data.locationId),
      );
    },
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
      if (cause.kind === 'character') {
        return h.pick<Part[]>([
          [c, ' is cut down by ', h.c(cause.characterId), ' in ', l, `${legacy}.`],
          [c, ' dies at the hands of ', h.c(cause.characterId), ' in ', l, `${legacy}.`],
        ]);
      }
      if (cause.kind === 'departed') {
        return h.pick<Part[]>([
          [c, ' leaves ', l, ' for distant lands.'],
          [c, ' sells up and leaves ', l, ', never to return.'],
        ]);
      }
      if (cause.kind === 'age') {
        return h.pick<Part[]>([
          [c, ` dies of old age in `, l, `, ${cause.age} years old.`],
          [c, ` passes away peacefully in `, l, ` at the age of ${cause.age}.`],
        ]);
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
      const quarry = e.data.why.find((m) => m.kind === 'bounty' || m.kind === 'revenge');
      if (e.data.companions.length > 0) {
        const party = h.group([e.data.characterId, ...e.data.companions]);
        if (e.data.reason === 'hunt' && quarry) {
          const id = quarry.kind === 'bounty' ? quarry.outlawId : quarry.characterId;
          return [...party, ' set out from ', from, ' to hunt down ', h.c(id), '.'];
        }
        return h.pick<Part[]>([
          [...party, ' set out together from ', from, ' toward ', to, '.'],
          [...party, ' leave ', from, ' together, bound for ', to, '.'],
        ]);
      }
      switch (e.data.reason) {
        case 'hunt': {
          if (!quarry) return [c, ' sets out from ', from, ' toward ', to, '.'];
          const id = quarry.kind === 'bounty' ? quarry.outlawId : quarry.characterId;
          return [c, ' sets out from ', from, ' to hunt down ', h.c(id), '.'];
        }
        case 'heal':
          return [c, ' limps out of ', from, ', heading for ', to, ' to recover.'];
        case 'home':
          return [c, ' heads for ', to, ' with a heavy pack.'];
        case 'trade':
          return h.pick<Part[]>([
            [c, ' drives a wagon out of ', from, ', bound for ', to, '.'],
            [c, ' takes the road from ', from, ' to ', to, ' with a wagonload of goods.'],
          ]);
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
    (e, h) =>
      e.data.companions.length > 0
        ? [
            ...h.group([e.data.characterId, ...e.data.companions]),
            ' descend into ',
            h.l(e.data.locationId),
            ' together.',
          ]
        : [h.c(e.data.characterId), ' enters ', h.l(e.data.locationId), '.'],
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
    (e, h) => {
      const party = e.data.characterIds;
      const us = party.length === 1 ? h.introduce(party[0]!) : h.group(party);
      const them = h.foes(e.data.foes);
      const many = party.length > 1;
      switch (e.data.kind) {
        case 'ambush':
          return [...us, many ? ' fight back against ' : ' fights back against ', ...them, '.'];
        case 'hunt':
          return [
            ...us,
            many ? ' corner ' : ' corners ',
            ...them,
            ' in ',
            h.l(e.data.locationId),
            '.',
          ];
        case 'waylay':
          return [
            ...us,
            many ? ' are set upon by ' : ' is set upon by ',
            ...them,
            ' roaming ',
            h.l(e.data.locationId),
            '.',
          ];
        case 'raid':
          return [
            ...them,
            ' fall upon ',
            h.l(e.data.locationId),
            '! ',
            ...us,
            many ? ' stand to defend it.' : ' stands to defend it.',
          ];
        case 'patrol':
          return [
            ...us,
            many ? ' are run to ground by ' : ' is run to ground by ',
            ...them,
            ' in ',
            h.l(e.data.locationId),
            '.',
          ];
        case 'delve':
          return h.pick<Part[]>([
            [...us, many ? ' are attacked by ' : ' is attacked by ', ...them, '.'],
            [...us, many ? ' engage ' : ' engages ', ...them, ' in battle.'],
            [...us, many ? ' come face to face with ' : ' comes face to face with ', ...them, '.'],
          ]);
      }
    },
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
      const us = h.group(e.data.characterIds);
      const many = e.data.characterIds.length > 1;
      const them = h.foes(e.data.foes);
      const loot = spoils(e.data.gold, e.data.items);
      // Condition is the leader's; for a party it would mislead.
      const state = many ? '' : `, ${condition(e.data.hp, e.data.maxHp)}`;
      const tail = loot ? `, and ${many ? 'loot' : 'loots'} ${loot}.` : '.';
      return h.pick<Part[]>([
        [...us, many ? ' defeat ' : ' defeats ', ...them, `${state}${tail}`],
        [
          ...us,
          many ? ' stand victorious over ' : ' stands victorious over ',
          ...them,
          `${state}${tail}`,
        ],
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
      const target: Part = e.data.target ? h.who(e.data.target) : 'the foe';
      const { outcome, amount, paid } = e.data;
      if (outcome === 'failure') return [c, `'s ${spell} fizzles out.`];
      if (outcome === 'backlash') {
        return [`The ${spell} backlashes on `, c, `, who loses ${paid.health} health and reels.`];
      }
      const weak = outcome === 'partial';
      switch (e.data.spell) {
        case 'ember-bolt':
          return weak
            ? [c, "'s Ember Bolt sputters, singeing ", target, ` for ${amount} damage.`]
            : [c, ' hurls an Ember Bolt at ', target, ` for ${amount} damage.`];
        case 'mend-flesh':
          return [c, ` casts Mend Flesh, paying in blood, and heals ${amount}.`];
        case 'quickening':
          return weak
            ? [c, ' casts Quickening, and moves a little faster.']
            : [c, ' casts Quickening and moves like the wind.'];
        case 'ward-of-ash':
          return [c, ` raises a Ward of Ash${weak ? ', thin and flickering' : ''} (${amount}).`];
        case 'foxfire':
          return weak
            ? [c, ' calls up a few wisps of Foxfire against ', target, ` for ${amount} damage.`]
            : [c, ' sends Foxfire streaming at ', target, ` for ${amount} damage.`];
        case 'thunder-rune':
          return weak
            ? [c, ' carves a Thunder Rune that only rumbles, jolting ', target, ` for ${amount}.`]
            : [
                c,
                ' carves a Thunder Rune, and lightning strikes ',
                target,
                ` for ${amount} damage.`,
              ];
        case 'ofuda-ward':
          return [
            c,
            ` presses an Ofuda Ward to their armor${weak ? ', its ink smudged' : ''} (${amount}).`,
          ];
        case 'rune-of-warding':
          return [c, ` carves a Rune of Warding${weak ? ', crooked and faint' : ''} (${amount}).`];
      }
      // Spells from content packs, by what they do.
      switch (spellDef(e.data.spell).effect.kind) {
        case 'damage':
          return [c, ` casts ${spell} at `, target, ` for ${amount} damage.`];
        case 'heal':
          return [c, ` casts ${spell} and heals ${amount}.`];
        case 'ward':
          return [c, ` casts ${spell}${weak ? ', weakly' : ''} (${amount}).`];
        default:
          return [c, ` casts ${spell}.`];
      }
    },
  ],
  'social.meet': [
    (e, h) =>
      e.data.understood
        ? h.pick<Part[]>([
            [
              h.c(e.data.characterId),
              ' shares a table with ',
              h.c(e.data.otherId),
              ' in ',
              h.l(e.data.locationId),
              '.',
            ],
            [h.c(e.data.characterId), ' strikes up a conversation with ', h.c(e.data.otherId), '.'],
          ])
        : [
            h.c(e.data.characterId),
            ' and ',
            h.c(e.data.otherId),
            ' share a table in ',
            h.l(e.data.locationId),
            ", though neither speaks the other's tongue.",
          ],
  ],
  'social.friend': [
    (e, h) => [h.c(e.data.characterId), ' and ', h.c(e.data.otherId), ' have become friends.'],
    (e, h) => [h.c(e.data.characterId), ' and ', h.c(e.data.otherId), ' are fast friends now.'],
  ],
  'social.rival': [
    (e, h) => [h.c(e.data.characterId), ' has come to despise ', h.c(e.data.otherId), '.'],
    (e, h) => [h.c(e.data.characterId), ' now counts ', h.c(e.data.otherId), ' an enemy.'],
  ],
  'social.quarrel': [
    (e, h) => [
      h.c(e.data.characterId),
      ' and ',
      h.c(e.data.otherId),
      ' quarrel bitterly in ',
      h.l(e.data.locationId),
      '.',
    ],
    (e, h) => [
      h.c(e.data.characterId),
      ' and ',
      h.c(e.data.otherId),
      ' come to blows over a game of dice.',
    ],
  ],
  'social.mourn': [
    (e, h) => [h.c(e.data.characterId), ' mourns ', h.c(e.data.deceasedId), '.'],
    (e, h) => [h.c(e.data.characterId), ' drinks to the memory of ', h.c(e.data.deceasedId), '.'],
  ],
  'social.rumor': [
    (e, h) =>
      e.data.warning
        ? [
            h.c(e.data.otherId),
            ' warns ',
            h.c(e.data.characterId),
            ' to beware ',
            h.l(e.data.aboutId),
            '.',
          ]
        : [
            h.c(e.data.otherId),
            ' tells ',
            h.c(e.data.characterId),
            ' about ',
            h.l(e.data.aboutId),
            '.',
          ],
  ],
  'character.language': [
    (e, h) =>
      e.data.level === 'fluent'
        ? [h.c(e.data.characterId), ` now speaks ${LANGUAGES[e.data.language].name} fluently.`]
        : [h.c(e.data.characterId), ` can now get by in ${LANGUAGES[e.data.language].name}.`],
  ],
  'party.form': [
    (e, h) => [...h.group(e.data.memberIds), ' band together as an adventuring party.'],
    (e, h) => [...h.group(e.data.memberIds), ' agree to adventure together.'],
  ],
  'party.join': [(e, h) => [h.c(e.data.characterId), ' joins ', h.c(e.data.leaderId), "'s party."]],
  'party.leave': [
    (e, h) =>
      e.data.reason === 'outlaw'
        ? [
            h.c(e.data.characterId),
            ' abandons ',
            h.c(e.data.leaderId),
            "'s party for a life of crime.",
          ]
        : e.data.reason === 'retire'
          ? [h.c(e.data.characterId), ' leaves ', h.c(e.data.leaderId), "'s party to settle down."]
          : [h.c(e.data.characterId), ' leaves ', h.c(e.data.leaderId), "'s party in disgust."],
  ],
  'party.disband': [
    (e, h) => {
      switch (e.data.reason) {
        case 'death':
          return [h.c(e.data.characterId), "'s party breaks up after the loss of a companion."];
        case 'quarrel':
          return [h.c(e.data.characterId), "'s party falls apart in bitterness."];
        case 'outlaw':
          return [h.c(e.data.characterId), "'s party breaks up."];
        case 'retire':
          return [h.c(e.data.characterId), "'s companions go their separate ways."];
      }
    },
  ],
  'party.share': [
    (e, h) =>
      e.data.fair
        ? [h.c(e.data.characterId), ` shares out ${e.data.gold} gold fairly among the party.`]
        : [
            h.c(e.data.characterId),
            ` keeps the lion's share of ${e.data.gold} gold, and the party grumbles.`,
          ],
  ],
  'outlaw.turn': [
    (e, h) => [h.c(e.data.characterId), ', broke and bitter, turns to banditry.'],
    (e, h) => [h.c(e.data.characterId), ' takes to the roads as an outlaw.'],
  ],
  'outlaw.ambush': [
    (e, h) => {
      const outlaws = h.group(e.data.outlawIds);
      const victims = h.group(e.data.victimIds);
      const many = e.data.outlawIds.length > 1;
      const lead = [
        ...outlaws,
        many ? ' waylay ' : ' waylays ',
        ...victims,
        ' in ',
        h.l(e.data.locationId),
      ];
      switch (e.data.parley) {
        case 'surrendered':
          return [...lead, ' and demand their gold.'];
        case 'refused':
          return [...lead, ', but they refuse to pay.'];
        case 'misunderstood':
          return [...lead, ', but neither side understands the other.'];
      }
    },
  ],
  'crime.robbery': [
    (e, h) => [
      h.c(e.data.characterId),
      ' robs ',
      h.c(e.data.victimId),
      e.data.goods && Object.keys(e.data.goods).length > 0
        ? ` of ${e.data.gold} gold and ${goodsList(e.data.goods)}.`
        : ` of ${e.data.gold} gold.`,
    ],
  ],
  'bounty.post': [
    (e, h) => [
      h.place(e.data.locationId),
      ` posts a bounty of ${e.data.amount} gold on `,
      h.c(e.data.characterId),
      '.',
    ],
  ],
  'bounty.claim': [
    (e, h) => [
      h.c(e.data.characterId),
      ` claims the ${e.data.amount}-gold bounty on `,
      h.c(e.data.outlawId),
      '.',
    ],
  ],
  'outlaw.reform': [
    (e, h) => [h.c(e.data.characterId), ' pays restitution and gives up the outlaw life.'],
  ],
  'trade.sell': [
    (e, h) => [
      h.c(e.data.characterId),
      ` sells ${lootList(e.data.items)} in `,
      h.l(e.data.locationId),
      ` for ${e.data.gold} gold.`,
    ],
  ],
  'trade.shop': [
    (e, h) => {
      const bought = [
        ...(e.data.potions > 0
          ? [
              e.data.potions === 1
                ? 'a healing draught'
                : `${countWord(e.data.potions)} healing draughts`,
            ]
          : []),
        ...(e.data.item ? [anItem(e.data.item)] : []),
      ];
      return [
        h.c(e.data.characterId),
        ` buys ${listOf(bought)} in `,
        h.l(e.data.locationId),
        ` for ${e.data.gold} gold.`,
      ];
    },
  ],
  'trade.load': [
    (e, h) => [
      h.c(e.data.characterId),
      ` loads ${goodsList(e.data.goods)} in `,
      h.l(e.data.locationId),
      ` for ${e.data.gold} gold, bound for `,
      h.l(e.data.destinationId),
      '.',
    ],
    (e, h) => [
      h.c(e.data.characterId),
      ` buys up ${goodsList(e.data.goods)} in `,
      h.l(e.data.locationId),
      ' to sell in ',
      h.l(e.data.destinationId),
      ` (${e.data.gold} gold).`,
    ],
  ],
  'trade.unload': [
    (e, h) => [
      h.c(e.data.characterId),
      ` sells ${goodsList(e.data.goods)} in `,
      h.l(e.data.locationId),
      ` for ${e.data.gold} gold`,
      e.data.profit === null
        ? '.'
        : e.data.profit >= 0
          ? `, a profit of ${e.data.profit}.`
          : `, at a loss of ${-e.data.profit}.`,
    ],
  ],
  'item.potion': [
    (e, h) => [h.c(e.data.characterId), ' gulps down a healing draught.'],
    (e, h) => [h.c(e.data.characterId), ' drinks a healing draught mid-fight.'],
  ],
  'character.elder': [
    (e, h) => [
      h.c(e.data.characterId),
      `'s hair is grey now; at ${e.data.age}, the years begin to tell.`,
    ],
    (e, h) => [
      h.c(e.data.characterId),
      ` turns ${e.data.age}, and is slower to rise in the mornings.`,
    ],
  ],
  'character.retire': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      const town = h.l(e.data.locationId);
      const why = RETIRE_REASONS[e.data.reason];
      if (e.data.merchant)
        return [c, ` hangs up their sword ${why} and takes up the merchant's trade in `, town, '.'];
      return [
        c,
        ` hangs up their sword ${why} and settles in `,
        town,
        e.data.occupation ? ` as ${OCCUPATION_NAMES[e.data.occupation]}.` : '.',
      ];
    },
  ],
  'family.marry': [
    (e, h) => [
      h.c(e.data.characterId),
      ' and ',
      h.c(e.data.otherId),
      ' are married in ',
      h.l(e.data.locationId),
      '.',
    ],
    (e, h) => [
      h.c(e.data.characterId),
      ' weds ',
      h.c(e.data.otherId),
      ' in ',
      h.l(e.data.locationId),
      '.',
    ],
  ],
  'family.birth': [
    (e, h) => [
      h.c(e.data.characterId),
      ' is born in ',
      h.l(e.data.locationId),
      ' to ',
      ...h.group(e.data.parentIds),
      '.',
    ],
  ],
  'family.comeOfAge': [
    (e, h) => {
      const c = h.c(e.data.characterId);
      if (e.data.calling === 'adventurer') {
        const weapon = h.weaponOf(e.data.characterId);
        return [
          c,
          ' comes of age in ',
          h.l(e.data.locationId),
          weapon ? ` and takes up the ${itemBase(weapon).name}.` : ' and sets out to adventure.',
        ];
      }
      return [
        c,
        ' comes of age in ',
        h.l(e.data.locationId),
        e.data.occupation ? ` and goes to work as ${OCCUPATION_NAMES[e.data.occupation]}.` : '.',
      ];
    },
  ],
  'family.inherit': [
    (e, h) => {
      const gifts = [
        ...(e.data.gold > 0 ? [`${e.data.gold} gold`] : []),
        ...e.data.items.map((item) => anItem(item)),
      ];
      return [h.c(e.data.characterId), ` inherits ${listOf(gifts)} from `, h.c(e.data.fromId), '.'];
    },
  ],
  'legend.hero': [
    (e, h) => ['The bards begin to sing of ', h.c(e.data.characterId), '.'],
    (e, h) => ['The deeds of ', h.c(e.data.characterId), ' pass into legend.'],
  ],
  'social.tale': [
    (e, h) => [
      h.c(e.data.characterId),
      ' tells ',
      h.c(e.data.otherId),
      ' of the deeds of ',
      h.c(e.data.heroId),
      '.',
    ],
    (e, h) => [
      h.c(e.data.characterId),
      ' and ',
      h.c(e.data.otherId),
      ' drink to the memory of ',
      h.c(e.data.heroId),
      '.',
    ],
  ],
  'character.avenger': [
    (e, h) => [
      h.c(e.data.characterId),
      ' takes up the sword in ',
      h.l(e.data.locationId),
      ' to avenge ',
      h.c(e.data.forId),
      ' on ',
      h.c(e.data.againstId),
      '.',
    ],
  ],
  'weather.turn': [
    (e) => {
      const region = e.data.region;
      switch (e.data.weather) {
        case 'snow':
          return ['Snow falls across ', region, '; the roads grow slow and cold.'];
        case 'storm':
          return ['Storms lash ', region, '.'];
        case 'heat':
          return ['A scorching heat settles over ', region, '.'];
        case 'rain':
          return ['Rain sweeps over ', region, '.'];
        case 'fair':
          return ['The skies clear over ', region, '.'];
      }
    },
  ],
  'creature.migrate': [
    (e, h) => {
      const band = herd(e.data.creature, e.data.count);
      return e.data.roaming
        ? [
            capitalize(band),
            ' spill out of ',
            h.l(e.data.locationId),
            ' and roam ',
            h.l(e.data.toId),
            '.',
          ]
        : [
            capitalize(band),
            ' leave the crowded ',
            h.l(e.data.locationId),
            ' for ',
            h.l(e.data.toId),
            '.',
          ];
    },
  ],
  'raid.sack': [
    (e, h) => {
      const toll = e.data.lost > 0 ? `; ${e.data.lost} of its folk are lost` : '';
      const raiders =
        e.data.creature && e.data.count > 0 ? herd(e.data.creature, e.data.count) : 'raiders';
      if (e.data.count === 0 && e.data.leaderId) {
        return [
          h.c(e.data.leaderId),
          ' falls on ',
          h.l(e.data.locationId),
          ` alone and plunders its stores${toll}.`,
        ];
      }
      const led: Part[] = e.data.leaderId ? [', led by ', h.c(e.data.leaderId), ','] : [];
      return [
        capitalize(raiders),
        ...led,
        e.data.count === 1 ? ' overruns ' : ' overrun ',
        h.l(e.data.locationId),
        e.data.count === 1 ? ` and plunders its stores${toll}.` : ` and plunder its stores${toll}.`,
      ];
    },
  ],
  'raid.repelled': [
    (e, h) => {
      const many = e.data.characterIds.length > 1;
      return [
        ...h.group(e.data.characterIds),
        many ? ' drive the raiders from ' : ' drives the raiders from ',
        h.l(e.data.locationId),
        ...(e.data.leaderId ? [' and send ', h.c(e.data.leaderId), ' back to its lair'] : []),
        '.',
      ];
    },
  ],
  'patrol.clear': [
    (e, h) => [
      'Soldiers from ',
      h.l(e.data.fortressId),
      ' cut down ',
      herd(e.data.creature, e.data.count),
      ' roaming ',
      h.l(e.data.locationId),
      '.',
    ],
  ],
  'lord.seat': [
    (e, h) => {
      const who = h.c(e.data.characterId);
      const where = h.l(e.data.locationId);
      switch (e.data.how) {
        case 'founded':
          return [who, ' holds ', where, ' and the lands around it.'];
        case 'inherited':
          return [who, ' inherits the seat of ', where, '.'];
        case 'claimed':
          return [who, ' lays down the sword and takes up the lordship of ', where, '.'];
        case 'appointed':
          return [who, ' is raised to the empty seat of ', where, '.'];
      }
    },
  ],
  'dread.rise': [
    (e, h) => [
      h.c(e.data.characterId),
      ', ',
      h.aSpecies(e.data.characterId),
      ', makes its lair in ',
      h.l(e.data.locationId),
      '.',
    ],
    (e, h) => [
      'Something stirs in the deeps of ',
      h.l(e.data.locationId),
      ': ',
      h.c(e.data.characterId),
      ', ',
      h.aSpecies(e.data.characterId),
      ', has come.',
    ],
  ],
  'dread.fall': [
    (e, h) => [
      ...h.group(e.data.slayerIds),
      e.data.slayerIds.length > 1 ? ' destroy ' : ' destroys ',
      h.c(e.data.characterId),
      ' in ',
      h.l(e.data.locationId),
      e.data.slain > 0 ? `, ending a terror that claimed ${countWord(e.data.slain)} lives.` : '.',
    ],
  ],
  'myth.born': [
    (e, h) => {
      const deaths = countWord(e.data.deaths);
      if (e.data.characterId) {
        return [
          h.c(e.data.characterId),
          ` has claimed ${deaths} lives; around `,
          h.l(e.data.locationId),
          ', folk now tell of it in hushed voices.',
        ];
      }
      return [
        'Folk begin to tell of ',
        ...h.myth(e.data.locationId, e.data.creature, null),
        `, which has taken ${deaths} lives.`,
      ];
    },
  ],
  'myth.end': [
    (e, h) => [
      'With ',
      h.c(e.data.characterId),
      ' destroyed, the tales told of ',
      h.l(e.data.locationId),
      ' have their ending.',
    ],
  ],
  'social.myth': [
    (e, h) => [
      h.c(e.data.characterId),
      ' tells ',
      h.c(e.data.otherId),
      ' the tale of ',
      ...h.myth(e.data.placeId, e.data.creature, e.data.subjectId),
      '.',
    ],
  ],
  'market.shock': [
    (e, h) => {
      const town = h.l(e.data.locationId);
      switch (e.data.shock) {
        case 'failed-harvest':
          return ['The harvest fails around ', town, '; bread will be dear.'];
        case 'mine-collapse':
          return ['A gallery collapses in the mines of ', town, '.'];
        case 'rich-vein':
          return ['Miners in ', town, ' strike a rich vein of iron.'];
        case 'blight':
          return ['A blight withers the herb gardens of ', town, '.'];
        case 'blockade':
          return [
            'A pack of wargs holds the road between ',
            town,
            ' and ',
            e.data.otherId ? h.l(e.data.otherId) : 'the wilds',
            '.',
          ];
      }
    },
  ],
  'market.recover': [
    (e, h) => {
      const town = h.l(e.data.locationId);
      switch (e.data.shock) {
        case 'failed-harvest':
          return ['The granaries of ', town, ' fill again.'];
        case 'mine-collapse':
          return ['The mines of ', town, ' are dug out and working again.'];
        case 'rich-vein':
          return ['The rich vein in the mines of ', town, ' runs out.'];
        case 'blight':
          return ['The herb gardens of ', town, ' recover from the blight.'];
        case 'blockade':
          return [
            'The road between ',
            town,
            ' and ',
            e.data.otherId ? h.l(e.data.otherId) : 'the wilds',
            ' is clear again.',
          ];
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
    who(combatant) {
      return combatant.kind === 'character' ? helpers.c(combatant.id) : theCreature(combatant.ref);
    },
    group(ids) {
      return joinParts(ids.map((id) => [helpers.c(id)]));
    },
    foes(foes) {
      const people = foes.flatMap((f) =>
        f.kind === 'character' ? [[helpers.c(f.id)] as Part[]] : [],
      );
      const creatures = foes.flatMap((f) => (f.kind === 'creature' ? [f.ref] : []));
      return joinParts([...people, ...(creatures.length > 0 ? [[creatureGroup(creatures)]] : [])]);
    },
    place(id) {
      return helpers.l(id);
    },
    kindOf(id) {
      return names.location(id)?.kind;
    },
    aSpecies(id) {
      const who = names.character(id);
      const name = who ? peopleName(who.species, who.culture).singular : 'traveler';
      return `${article(name)} ${name}`;
    },
    introduce(id) {
      const who = names.character(id);
      const title = roleTitle(who?.culture, who?.role);
      if (!who || !title) return [helpers.c(id)];
      const weapon = itemBase(who.weapon).name;
      const people = peopleName(who.species, who.culture).singular;
      // Humans go without saying in their own lands; other peoples don't.
      const kind = who.species === 'human' ? title : `${people} ${title}`;
      return [helpers.c(id), `, ${article(kind)} ${kind} with ${article(weapon)} ${weapon},`];
    },
    deityOf(id) {
      const culture = names.location(id)?.culture;
      const gods = culture ? packOf(culture)?.deities : undefined;
      return gods && gods.length > 0 ? helpers.pick(gods).name : null;
    },
    myth(place, creature, subject) {
      if (subject) return [helpers.c(subject), ' of ', helpers.l(place)];
      return [`the ${creature ? creatureDef(creature).name : 'terror'} of `, helpers.l(place)];
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
  // Decisions explain themselves: "… toward Brindlemoor (restless; hungry for glory)."
  const why = 'why' in event.data ? describeWhy(event.data.why, names) : '';
  const last = segments.at(-1);
  if (why && last && last.text.endsWith('.') && !('ref' in last)) {
    segments.splice(
      -1,
      1,
      { text: last.text.slice(0, -1) },
      { text: ` ${why}`, aside: true },
      { text: '.' },
    );
  }
  // Sentences may open with "the skeleton"; capitalize whatever comes first.
  const [first, ...rest] = segments;
  return first ? [{ ...first, text: capitalize(first.text) }, ...rest] : [];
}

/** Joins phrases as "a, b and c". */
function joinParts(parts: readonly (readonly Part[])[]): Part[] {
  return parts.flatMap((part, i) => [
    ...(i === 0 ? [] : i === parts.length - 1 ? [' and '] : [', ']),
    ...part,
  ]);
}

export function toPlainText(segments: readonly Segment[]): string {
  return segments.map((s) => s.text).join('');
}
