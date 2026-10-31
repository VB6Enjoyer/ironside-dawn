/**
 * Headless simulation runner (ARCHITECTURE.md §7).
 *
 *   npm run sim -- --seed 42 --days 7
 *   npm run sim -- --seed 42 --days 365 --quiet     (just the world report)
 */
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

import { creatureDef, type CreatureId, type TraitId } from '../src/content';
import { roleOf } from '../src/sim/systems/progress';
import {
  createSimulation,
  DAY,
  Importance,
  StreamHash,
  WORLD_START,
  type CharacterId,
  type SimEvent,
  type World,
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
  --quiet                  Print only the summary, not the log.
  --help                   Show this message.`;

function main(): number {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        seed: { type: 'string' },
        days: { type: 'string', default: '3' },
        characters: { type: 'string', default: '20' },
        importance: { type: 'string', default: 'trivial' },
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
    eventCapacity: 1,
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
