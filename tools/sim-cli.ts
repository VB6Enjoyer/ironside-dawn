/**
 * Headless simulation runner (ARCHITECTURE.md §7).
 *
 * Phase 0: proves the seeded RNG is reproducible from the command line.
 * Later phases grow this into "run N years and report world health".
 *
 *   npm run sim -- --seed 42
 */
import { randomInt } from 'node:crypto';
import { parseArgs } from 'node:util';

import { createRng } from '../src/sim';

const USAGE = `Usage: npm run sim -- [--seed <seed>]

Options:
  --seed <seed>  World seed (any text or number). Random if omitted.
  --help         Show this message.`;

function main(): number {
  let values: { seed?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      options: {
        seed: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error(USAGE);
    return 1;
  }

  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const seed = values.seed ?? String(randomInt(1, 1_000_000));
  if (seed.length === 0) {
    console.error('--seed must not be empty');
    return 1;
  }
  const rng = createRng(seed);
  const combat = rng.fork('combat');

  const lines = [
    `Seed: ${seed}${values.seed === undefined ? ` (pass --seed ${seed} to reproduce)` : ''}`,
    '',
    `d20 rolls:      ${Array.from({ length: 5 }, () => rng.roll('d20')).join(', ')}`,
    `2d6+1:          ${rng.roll('2d6+1')}`,
    `Coin flips:     ${Array.from({ length: 8 }, () => (rng.chance(0.5) ? 'H' : 'T')).join('')}`,
    `Height (cm):    ${rng.gaussian(172, 8).toFixed(1)}`,
    `Loot drop:      ${rng.weighted([
      ['nothing', 60],
      ['copper coins', 30],
      ['a rusted blade', 9],
      ['a cursed ring', 1],
    ])}`,
    `Combat stream:  ${Array.from({ length: 5 }, () => combat.roll('d20')).join(', ')}`,
  ];
  console.log(lines.join('\n'));
  return 0;
}

process.exitCode = main();
