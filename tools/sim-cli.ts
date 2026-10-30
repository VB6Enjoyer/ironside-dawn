/**
 * Headless simulation runner (ARCHITECTURE.md §7).
 *
 *   npm run sim -- --seed 42 --days 7
 *   npm run sim -- --seed 42 --days 365 --quiet     (just the world report)
 */
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

import { creatureDef, type CreatureId } from '../src/content';
import {
  createSimulation,
  DAY,
  Importance,
  StreamHash,
  WORLD_START,
  type SimEvent,
  type World,
} from '../src/sim';
import {
  describeEvent,
  formatDate,
  formatTimestamp,
  toPlainText,
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
      ...worldReport(sim.world, counts),
    ].join('\n'),
  );
  return 0;
}

/** World health at a glance (ARCHITECTURE.md §7): who lives, who died, what's left. */
function worldReport(world: World, counts: ReadonlyMap<string, number>): string[] {
  const characters = [...world.characters.values()];
  const living = characters.filter((c) => c.death === null);
  const fallen = characters.filter((c) => c.death !== null);

  const tally = (keys: readonly string[]) => {
    const totals = new Map<string, number>();
    for (const key of keys) totals.set(key, (totals.get(key) ?? 0) + 1);
    return [...totals].sort((a, b) => b[1] - a[1]);
  };
  const deathCauses = tally(
    fallen.map(({ death }) =>
      death!.cause.kind === 'creature'
        ? creatureDef(death!.cause.creature.species).plural
        : `${TRAP_NAMES[death!.cause.trap]}s`,
    ),
  );
  const kills = new Map<CreatureId, number>();
  for (const c of characters) {
    for (const [species, n] of Object.entries(c.kills) as [CreatureId, number][]) {
      kills.set(species, (kills.get(species) ?? 0) + n);
    }
  }
  const richest = [...living].sort((a, b) => b.gold - a.gold).slice(0, 5);
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
