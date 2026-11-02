/**
 * Headless simulation runner (ARCHITECTURE.md §7).
 *
 *   npm run sim -- --seed 42 --days 7
 *   npm run sim -- --seed 42 --days 365 --quiet     (just the world report)
 *   npm run sim -- --seed 42 --danger deadly --pack packs/slavic.json
 */
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import {
  checkPack,
  creatureDef,
  PEOPLES,
  type ContentPack,
  type CreatureId,
  type PeopleId,
  type TraitId,
} from '../src/content';
import { roleOf } from '../src/sim/systems/progress';
import {
  createSimulation,
  DAY,
  goingPrice,
  Importance,
  moneyHeld,
  priceIndex,
  renownOf,
  StreamHash,
  WORLD_START,
  type Character,
  type CharacterId,
  type SimEvent,
  type World,
  type WorldSettings,
} from '../src/sim';
import {
  anItem,
  describeEvent,
  formatDate,
  formatTimestamp,
  toPlainText,
  spellName,
  TRAP_NAMES,
  worldNames,
  type NameResolver,
} from '../src/text';

const IMPORTANCE_BY_NAME: Record<string, Importance> = {
  trivial: Importance.Trivial,
  normal: Importance.Normal,
  notable: Importance.Notable,
  legendary: Importance.Legendary,
};

const USAGE = `Usage: npm run sim -- [options]

Options:
  --seed <seed>            World seed (any text or number). Random if omitted.
  --days <n>               In-game days to simulate. Default: 3.
  --characters <n>         Number of adventurers. Default: 20.
  --importance <level>     Lowest importance to print: trivial, normal, notable,
                           legendary. Default: trivial.
  --size <size>            World size: small, medium or large. Default: to suit
                           the adventurers.
  --danger <level>         gentle, normal or deadly. Default: normal.
  --magic <level>          rare, normal or common. Default: normal.
  --peoples <list>         Peoples included, comma-separated (humans always are).
  --cap <n>                Most people alive at once. Default: no limit.
  --pack <file.json>       Add a content pack. Can be given more than once.
  --quiet                  Print only the summary, not the log.
  --help                   Show this message.`;

/** World settings from the options, or what is wrong with them. */
function settingsFrom(values: {
  size?: string | undefined;
  danger?: string | undefined;
  magic?: string | undefined;
  peoples?: string | undefined;
  cap?: string | undefined;
}): Partial<WorldSettings> | string {
  const settings: { -readonly [K in keyof WorldSettings]?: WorldSettings[K] } = {};
  const pick = <T extends string>(name: string, value: string | undefined, allowed: T[]) => {
    if (value === undefined) return undefined;
    if (!allowed.includes(value as T)) throw `--${name} must be one of ${allowed.join(', ')}`;
    return value as T;
  };
  try {
    const size = pick('size', values.size, ['small', 'medium', 'large']);
    const danger = pick('danger', values.danger, ['gentle', 'normal', 'deadly']);
    const magic = pick('magic', values.magic, ['rare', 'normal', 'common']);
    if (size) settings.size = size;
    if (danger) settings.danger = danger;
    if (magic) settings.magic = magic;
  } catch (message) {
    return String(message);
  }
  if (values.peoples !== undefined) {
    const listed = values.peoples.split(',').map((p) => p.trim());
    const unknown = listed.filter((p) => !(PEOPLES as readonly string[]).includes(p));
    if (unknown.length > 0) return `Unknown peoples: ${unknown.join(', ')}`;
    settings.peoples = PEOPLES.filter((p: PeopleId) => p === 'human' || listed.includes(p));
  }
  if (values.cap !== undefined) {
    const cap = Number(values.cap);
    if (!Number.isSafeInteger(cap) || cap < 1) return '--cap must be a positive integer';
    settings.populationCap = cap;
  }
  return settings;
}

function main(): number {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        seed: { type: 'string' },
        days: { type: 'string', default: '3' },
        characters: { type: 'string', default: '20' },
        importance: { type: 'string', default: 'trivial' },
        size: { type: 'string' },
        danger: { type: 'string' },
        magic: { type: 'string' },
        peoples: { type: 'string' },
        cap: { type: 'string' },
        pack: { type: 'string', multiple: true },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const seed = values.seed ?? String(randomInt(1, 1_000_000));
  const days = Number(values.days);
  const characterCount = Number(values.characters);
  const floor = IMPORTANCE_BY_NAME[values.importance];
  if (seed.length === 0) return fail('--seed must not be empty');
  if (!(days > 0)) return fail('--days must be a positive number');
  if (!Number.isSafeInteger(characterCount) || characterCount < 1) {
    return fail('--characters must be a positive integer');
  }
  if (floor === undefined) return fail(`Unknown importance "${values.importance}"`);
  const settings = settingsFrom(values);
  if (typeof settings === 'string') return fail(settings);
  const packs: ContentPack[] = [];
  for (const file of values.pack ?? []) {
    try {
      packs.push(checkPack(JSON.parse(readFileSync(file, 'utf8'))));
    } catch (error) {
      return fail(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const hash = new StreamHash();
  const counts = new Map<string, number>();
  const castOutcomes = new Map<string, number>();
  const habits: Habits = { delves: new Map(), taverns: new Map() };
  let printed = 0;

  const started = performance.now();
  // Events emitted while the world is being created arrive before `sim`
  // exists, so they wait in `pending` until names can be resolved.
  let live = false;
  const pending: SimEvent[] = [];
  const print = (event: SimEvent, names: NameResolver) => {
    if (values.quiet || event.importance < floor) return;
    printed++;
    console.log(`[${formatTimestamp(event.t)}]  ${toPlainText(describeEvent(event, names))}`);
  };

  const sim = createSimulation({
    seed,
    characterCount,
    settings,
    packs,
    retention: 1,
    onEvent(event) {
      hash.update(JSON.stringify(event));
      counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
      if (event.type === 'delve.enter') bump(habits.delves, event.data.characterId);
      if (event.type === 'character.pastime' && event.data.pastime === 'tavern') {
        bump(habits.taverns, event.data.characterId);
      }
      if (event.type === 'magic.cast') {
        castOutcomes.set(event.data.outcome, (castOutcomes.get(event.data.outcome) ?? 0) + 1);
      }
      if (live) print(event, names);
      else pending.push(event);
    },
  });
  const names = worldNames(sim.world);
  live = true;
  for (const event of pending) print(event, names);

  const { jobsRun } = sim.advance(WORLD_START + Math.round(days * DAY));
  const seconds = (performance.now() - started) / 1000;

  const total = sim.world.nextEventId - 1;
  console.log(
    [
      '',
      `Seed:        ${seed}${values.seed === undefined ? ` (pass --seed ${seed} to reproduce)` : ''}`,
      `Simulated:   ${days} days with ${characterCount} characters, to ${formatDate(sim.world.time)}`,
      `Events:      ${total}${values.quiet ? '' : ` (${printed} printed)`}`,
      `Jobs run:    ${jobsRun}`,
      `Wall time:   ${seconds.toFixed(2)}s (${Math.round(days / seconds)} days/s)`,
      `Event hash:  ${hash.digest()}`,
      '',
      ...worldReport(sim.world, counts, castOutcomes, habits),
    ].join('\n'),
  );
  return 0;
}

/** World health at a glance (ARCHITECTURE.md §7): who lives, who died, what's left. */
function worldReport(
  world: World,
  counts: ReadonlyMap<string, number>,
  castOutcomes: ReadonlyMap<string, number>,
  habits: Habits,
): string[] {
  const characters = [...world.characters.values()];
  const living = characters.filter((c) => c.death === null);
  const fallen = characters.filter((c) => c.death !== null);

  const tally = (keys: readonly string[]) => {
    const totals = new Map<string, number>();
    for (const key of keys) totals.set(key, (totals.get(key) ?? 0) + 1);
    return [...totals].sort((a, b) => b[1] - a[1]);
  };
  const deathCauses = tally(
    fallen.map(({ death }) => {
      const cause = death!.cause;
      switch (cause.kind) {
        case 'creature':
          return creatureDef(cause.creature.species).plural;
        case 'trap':
          return `${TRAP_NAMES[cause.trap]}s`;
        case 'magic':
          return `their own ${spellName(cause.spell)}`;
        case 'character':
          return 'other people';
        case 'age':
          return 'old age';
        case 'departed':
          return 'moving on (not deaths)';
      }
    }),
  );
  const kills = new Map<CreatureId, number>();
  for (const c of characters) {
    for (const [species, n] of Object.entries(c.kills) as [CreatureId, number][]) {
      kills.set(species, (kills.get(species) ?? 0) + n);
    }
  }
  const richest = [...living].sort((a, b) => b.gold - a.gold).slice(0, 5);
  const veterans = [...living].sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, 5);
  const levels = tally(living.map((c) => `level ${c.level}`)).sort(
    (a, b) => Number(a[0].slice(6)) - Number(b[0].slice(6)),
  );
  const casters = living.filter((c) => c.spells.length > 0);
  const name = (id: string | null) => {
    const c = id ? world.characters.get(id as CharacterId) : undefined;
    return c ? `${c.givenName} ${c.familyName}` : 'nobody';
  };
  const earned = characters.reduce((sum, c) => sum + c.goldEarned, 0);
  const row = (label: string, value: string | number) => `  ${label.padEnd(22)} ${value}`;

  return [
    'People',
    row('Alive', `${living.length} (of ${characters.length} who ever lived)`),
    row('Died', fallen.length),
    ...deathCauses.map(([cause, n]) => row(`  to ${cause}`, n)),
    row('Gold earned, all time', earned),
    row('Richest alive', ''),
    ...richest.map((c) => row(`  ${c.givenName} ${c.familyName}`, `${c.gold} gold`)),
    '',
    'Growth',
    ...levels.map(([level, n]) => row(level, n)),
    row('Veterans', ''),
    ...veterans.map((c) =>
      row(
        `  ${c.givenName} ${c.familyName}`,
        `level ${c.level} ${roleOf(c)}, wielding ${anItem(c.equipment.weapon)}`,
      ),
    ),
    '',
    'Personality and behavior (per adventurer-month, lowest third vs highest third)',
    ...habitRows(world, habits, row),
    '',
    'Bonds and crime',
    ...bondRows(world, counts, row),
    '',
    'Living world',
    ...worldRows(world, counts, row),
    '',
    'Generations',
    ...generationRows(world, counts, row),
    '',
    'Economy',
    ...economyRows(world, counts, row),
    '',
    'Magic',
    row('Casters alive', `${casters.length} (${living.filter((c) => c.gifted).length} gifted)`),
    ...[...castOutcomes].sort((a, b) => b[1] - a[1]).map(([outcome, n]) => row(`  ${outcome}`, n)),
    '',
    'Legendary items',
    ...(world.legends.size === 0 ? ['  none yet'] : []),
    ...[...world.legends.values()].map((legend) =>
      row(
        `  ${legend.item.uniqueName}`,
        legend.holder
          ? `held by ${name(legend.holder)}`
          : legend.lostAt
            ? `lost in ${world.locations.get(legend.lostAt)?.name}`
            : 'whereabouts unknown',
      ),
    ),
    '',
    'Kills by species',
    ...[...kills]
      .sort((a, b) => b[1] - a[1])
      .map(([species, n]) => row(creatureDef(species).plural, n)),
    '',
    'Dungeon populations',
    ...[...world.locations.values()]
      .filter((l) => l.dungeon)
      .flatMap((l) => [
        `  ${l.name}`,
        ...l.dungeon!.def.inhabitants.map(({ creature, max }) =>
          row(
            `  ${creatureDef(creature).plural}`,
            `${l.dungeon!.population[creature] ?? 0} / ${max}`,
          ),
        ),
      ]),
    '',
    'Events by type',
    ...[...counts].sort((a, b) => b[1] - a[1]).map(([type, n]) => row(type, n)),
  ];
}

function fail(message: string): number {
  console.error(message);
  console.error(USAGE);
  return 1;
}

process.exitCode = main();

interface Habits {
  readonly delves: Map<CharacterId, number>;
  readonly taverns: Map<CharacterId, number>;
}

function bump(counts: Map<CharacterId, number>, id: CharacterId): void {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

/** How traits show in behavior: the lowest third against the highest third of each trait. */
function habitRows(
  world: World,
  habits: Habits,
  row: (label: string, value: string | number) => string,
): string[] {
  const MONTH = 30 * DAY;
  const lives = [...world.characters.values()]
    .map((c) => ({ c, months: ((c.death?.at ?? world.time) - c.arrivedAt) / MONTH }))
    .filter(({ months }) => months >= 1);
  if (lives.length < 6) return ['  too few adventurers lived a month or more'];
  const compare = (trait: TraitId, counts: Map<CharacterId, number>) => {
    const sorted = [...lives].sort((a, b) => a.c.traits[trait] - b.c.traits[trait]);
    const third = Math.floor(sorted.length / 3);
    const rate = (group: typeof sorted) =>
      group.reduce((sum, { c }) => sum + (counts.get(c.id) ?? 0), 0) /
      group.reduce((sum, { months }) => sum + months, 0);
    return `${rate(sorted.slice(0, third)).toFixed(1)} vs ${rate(sorted.slice(-third)).toFixed(1)}`;
  };
  return [
    row('Delves by bravery', compare('bravery', habits.delves)),
    row('Delves by patience', compare('patience', habits.delves)),
    row('Taverns by sociability', compare('sociability', habits.taverns)),
  ];
}

/** The land, its weather and creatures, its lords, and the dread (ROADMAP.md Phase 9). */
function worldRows(
  world: World,
  counts: ReadonlyMap<string, number>,
  row: (label: string, value: string | number) => string,
): string[] {
  const kinds = new Map<string, number>();
  for (const l of world.locations.values()) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1);
  const name = (id: CharacterId | null) => {
    const c = id ? world.characters.get(id) : undefined;
    return c ? `${c.givenName} ${c.familyName}` : 'nobody';
  };
  const roaming = [...world.locations.values()].reduce(
    (sum, l) => sum + Object.values(l.roaming).reduce<number>((a, n) => a + (n ?? 0), 0),
    0,
  );
  const fortresses = [...world.locations.values()]
    .filter((l) => l.fortress)
    .map((l) =>
      row(
        `  ${l.name}`,
        `${l.fortress!.lordId ? `held by ${name(l.fortress!.lordId)}` : 'empty'}, ` +
          `${l.fortress!.garrison} soldiers, ${l.fortress!.lineage.length} ${l.fortress!.lineage.length === 1 ? 'lord' : 'lords'} so far`,
      ),
    );
  const dread = [...world.characters.values()]
    .filter((c) => c.calling === 'dread')
    .map((c) =>
      row(
        `  ${c.givenName} ${c.familyName}`,
        `${c.species} of level ${c.level}, ${c.slain} lives claimed` +
          (c.death ? ', destroyed' : `, in ${world.locations.get(c.homeId)?.name}`),
      ),
    );
  return [
    row('Regions', [...world.regions.values()].map((r) => r.biome).join(', ') || 'none'),
    row('Places', [...kinds].map(([k, n]) => `${n} ${k}`).join(', ')),
    row('Hard weather', counts.get('weather.turn') ?? 0),
    row('Creature migrations', counts.get('creature.migrate') ?? 0),
    row('Creatures roaming now', roaming),
    row(
      'Raids',
      `${world.tally.raids} (${counts.get('raid.sack') ?? 0} sacked, ${counts.get('raid.repelled') ?? 0} repelled)`,
    ),
    row('Patrols clearing roads', counts.get('patrol.clear') ?? 0),
    row('Fortresses', ''),
    ...fortresses,
    row('The dread', `${world.tally.dreadSlain} destroyed`),
    ...dread,
    row(
      'Culture lands',
      [...world.regions.values()]
        .filter((r) => r.culture)
        .map((r) => `${r.name} (${r.culture})`)
        .join(', ') || 'none',
    ),
    row('Myths', `${world.myths.length} (${world.myths.filter((m) => m.endedAt).length} ended)`),
    ...world.myths.slice(-5).map((m) => {
      const place = world.locations.get(m.locationId)!;
      const where = `${place.article ? 'the ' : ''}${place.name}`;
      const what =
        m.subject.kind === 'creature' ? `the ${m.subject.creature}` : name(m.subject.characterId);
      return row(`  ${what} of ${where}`, `${m.deaths} lives, told by ${m.culture} folk`);
    }),
  ];
}

/** Who lives how, how deep the families go, and who is remembered (ROADMAP.md Phase 8). */
function generationRows(
  world: World,
  counts: ReadonlyMap<string, number>,
  row: (label: string, value: string | number) => string,
): string[] {
  const living = [...world.characters.values()].filter((c) => !c.death);
  const depth = new Map<CharacterId, number>();
  const generation = (c: Character): number => {
    let g = depth.get(c.id);
    if (g === undefined) {
      const parents = c.parents.flatMap((id) => world.characters.get(id) ?? []);
      g = parents.length === 0 ? 1 : 1 + Math.max(...parents.map(generation));
      depth.set(c.id, g);
    }
    return g;
  };
  const deepest = Math.max(1, ...[...world.characters.values()].map(generation));
  const grid = (['human', 'elf', 'dwarf'] as const).map((species) => {
    const folk = living.filter((c) => c.species === species);
    const by = (calling: Character['calling']) => folk.filter((c) => c.calling === calling).length;
    return row(
      `  ${species}`,
      `${folk.length}: ${by('adventurer')} adventurers, ${by('townsfolk')} townsfolk, ` +
        `${by('child')} children, ${by('merchant')} merchants`,
    );
  });
  const heroes = world.heroes.slice(-5).map((id) => {
    const c = world.characters.get(id)!;
    return row(`  ${c.givenName} ${c.familyName}`, `renown ${renownOf(c)}, level ${c.level}`);
  });
  return [
    row('Living, by people', ''),
    ...grid,
    row('Deepest generation', deepest),
    row('Births', counts.get('family.birth') ?? 0),
    row('Marriages', counts.get('family.marry') ?? 0),
    row('Retirements', counts.get('character.retire') ?? 0),
    row('Came of age', counts.get('family.comeOfAge') ?? 0),
    row('Inheritances', counts.get('family.inherit') ?? 0),
    row('Tales told', counts.get('social.tale') ?? 0),
    row('Legends', `${world.heroes.length}${heroes.length > 0 ? ', most recently:' : ''}`),
    ...heroes,
  ];
}

/** Prices in each town, the money supply, and how the merchants are doing (ROADMAP.md Phase 7). */
function economyRows(
  world: World,
  counts: ReadonlyMap<string, number>,
  row: (label: string, value: string | number) => string,
): string[] {
  const shown = ['food', 'ore', 'tools', 'arms', 'potions'] as const;
  const towns = [...world.markets.values()].map((m) =>
    row(
      `  ${world.locations.get(m.townId)!.name}`,
      `index ${priceIndex(m).toFixed(2)}; ` +
        shown.map((g) => `${g} ${goingPrice(m, g).toFixed(1)}`).join(', '),
    ),
  );
  const sum = (r: Partial<Record<string, number>>) =>
    Object.values(r).reduce<number>((a, n) => a + (n ?? 0), 0);
  const merchants = [...world.characters.values()].filter(
    (c) => c.calling === 'merchant' && !c.death,
  );
  const richest = [...merchants].sort((a, b) => b.gold - a.gold)[0];
  return [
    row('Prices', '(against where they started; going prices in gold)'),
    ...towns,
    row('Money held', Math.round(moneyHeld(world))),
    row('  minted', Math.round(sum(world.ledger.minted))),
    row('  burned', Math.round(sum(world.ledger.burned))),
    row('Merchants alive', merchants.length),
    row('  runs completed', counts.get('trade.unload') ?? 0),
    ...(richest
      ? [row('  richest', `${richest.givenName} ${richest.familyName}, ${richest.gold} gold`)]
      : []),
    row('Troubles', counts.get('market.shock') ?? 0),
  ];
}

/** Friendships, parties, outlaws and the law. */
function bondRows(
  world: World,
  counts: ReadonlyMap<string, number>,
  row: (label: string, value: string | number) => string,
): string[] {
  const living = [...world.characters.values()].filter((c) => c.death === null);
  let friendships = 0;
  for (const c of living) {
    for (const [id, opinion] of Object.entries(c.opinions)) {
      const other = world.characters.get(id as CharacterId);
      if (opinion?.bond === 'friend' && other && !other.death && c.id < other.id) friendships++;
    }
  }
  const name = (c: { givenName: string; familyName: string }) => `${c.givenName} ${c.familyName}`;
  const parties = [...world.parties.values()].map((p) =>
    p.members.map((id) => name(world.characters.get(id)!)).join(', '),
  );
  const outlaws = living.filter((c) => c.outlaw);
  const bounties = [...world.bounties.values()].map((b) => {
    const outlaw = world.characters.get(b.outlawId)!;
    return row(`  ${name(outlaw)}`, `${b.amount} gold${outlaw.death ? ' (dead)' : ''}`);
  });
  return [
    row('Friendships alive', friendships),
    row('Parties', parties.length),
    ...parties.map((members) => `    ${members}`),
    row('Outlaws at large', outlaws.length),
    row('Bounties posted', ''),
    ...(bounties.length > 0 ? bounties : ['    none']),
    row('Robberies', counts.get('crime.robbery') ?? 0),
    row(
      'Murders',
      [...world.characters.values()].filter((c) => c.death?.cause.kind === 'character').length,
    ),
    row('Bounties claimed', counts.get('bounty.claim') ?? 0),
  ];
}
