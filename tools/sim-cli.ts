/**
 * Headless simulation runner (ARCHITECTURE.md §7).
 *
 *   npm run sim -- --seed 42 --days 7
 *   npm run sim -- --seed 42 --days 365 --quiet
 */
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

import {
  createSimulation,
  DAY,
  Importance,
  StreamHash,
  WORLD_START,
  type SimEvent,
} from '../src/sim';
import {
  describeEvent,
  formatDate,
  formatTimestamp,
  toPlainText,
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
      ...[...counts].map(([type, n]) => `  ${type.padEnd(22)} ${n}`),
      `Jobs run:    ${jobsRun}`,
      `Wall time:   ${seconds.toFixed(2)}s (${Math.round(days / seconds)} days/s)`,
      `Event hash:  ${hash.digest()}`,
    ].join('\n'),
  );
  return 0;
}

function fail(message: string): number {
  console.error(message);
  console.error(USAGE);
  return 1;
}

process.exitCode = main();
