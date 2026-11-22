/**
 * Magic audit (ROADMAP.md 0.3.2): runs several worlds headless and reports
 * how magic goes in them: who can cast and how they came to it, what is
 * learned and cast and how it turns out, how often fights see magic, and how
 * much of it a player sees at Day speed and up. The yardstick for 0.5.0.
 *
 *   npm run audit:magic                                   (4 worlds of 20, 30 years)
 *   npm run audit:magic -- --adventurers 200 --years 10 --seeds a,b
 *   npm run audit:magic -- --blessings human=7.5,elf=20,centaur=5,dwarf=3
 *
 * `--blessings` tries other chances of the gift, in percent, by people.
 * Each world runs in its own process, as many at once as there are cores.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';

import { SPECIES, type SpeciesId } from '../src/content';
import {
  createSimulation,
  DAY,
  EVENT_IMPORTANCE,
  YEAR,
  Importance,
  type CharacterId,
  type SimEvent,
} from '../src/sim';

/** The peoples who live in towns; the dread are counted apart. */
const PEOPLES = ['human', 'elf', 'dwarf', 'centaur'] as const;

interface PeopleCount {
  lived: number;
  gifted: number;
  casters: number;
}

/** What one world's magic came to. */
interface WorldReport {
  readonly seed: string;
  readonly years: number;
  /** By people: everyone who lived, the gifted, and those who learned any spell. */
  readonly peoples: Record<string, PeopleCount>;
  /** Casters who learned without the gift, by study. */
  readonly studied: number;
  /** Mean number of casters alive at once, from monthly looks. */
  readonly castersAtOnce: number;
  /** Mean number of living adventurers, for scale. */
  readonly adventurersAtOnce: number;
  readonly learned: Record<string, number>;
  /** Everyone (the dread apart) who knew each spell, at the end or at their death. */
  readonly known: Record<string, number>;
  /** Casts by spell and outcome. */
  readonly casts: Record<string, Record<string, number>>;
  /** Casts by each caster, most first (the dread apart). */
  readonly byCaster: readonly number[];
  readonly dreadCasts: number;
  readonly fights: number;
  readonly fightsWithCast: number;
  readonly killsBySpell: number;
  readonly backlashDeaths: number;
  /** Magic events, and those a player sees at Day speed and above (Notable and up). */
  readonly magicEvents: number;
  readonly seenAtSpeed: number;
  /** Arcana of living casters at the end. */
  readonly arcana: readonly number[];
  /**
   * The gift by generation, by people: those grown when the world began (0),
   * those who came into it grown later (-1), and those born in it, by the
   * span of `ERA_YEARS` they were born in (1, 2, ...).
   */
  readonly eras: Record<number, Record<string, { born: number; gifted: number }>>;
  /** The living at the end, by people: how many, and how many gifted. */
  readonly livingAtEnd: Record<string, { born: number; gifted: number }>;
}

/** Years in each generation the gift is counted by. */
const ERA_YEARS = 25;

function runWorld(
  seed: string,
  adventurers: number,
  years: number,
  blessings: Partial<Record<SpeciesId, number>>,
): WorldReport {
  for (const [species, percent] of Object.entries(blessings) as [SpeciesId, number][]) {
    (SPECIES[species] as { giftChance: number }).giftChance = percent / 100;
  }
  const casts: Record<string, Record<string, number>> = {};
  const learned: Record<string, number> = {};
  const byCaster = new Map<CharacterId, number>();
  const fightsWithCast = new Set<string>();
  let dreadCasts = 0;
  let fights = 0;
  let killsBySpell = 0;
  let backlashDeaths = 0;
  let magicEvents = 0;
  let seenAtSpeed = 0;
  let sim: ReturnType<typeof createSimulation> | null = null;
  const onEvent = (e: SimEvent) => {
    if (!sim) return;
    if (e.type === 'combat.start') fights++;
    if (e.type.startsWith('magic.')) {
      magicEvents++;
      if (EVENT_IMPORTANCE[e.type] >= Importance.Notable) seenAtSpeed++;
    }
    switch (e.type) {
      case 'magic.cast':
      case 'magic.backlash': {
        const data = e.data;
        const caster = sim.world.characters.get(data.characterId)!;
        const bySpell = (casts[data.spell] ??= {});
        bySpell[data.outcome] = (bySpell[data.outcome] ?? 0) + 1;
        if (caster.calling === 'dread') dreadCasts++;
        else byCaster.set(caster.id, (byCaster.get(caster.id) ?? 0) + 1);
        if (caster.activity.kind === 'fighting') fightsWithCast.add(caster.activity.encounterId);
        break;
      }
      case 'magic.learn':
        learned[e.data.spell] = (learned[e.data.spell] ?? 0) + 1;
        break;
      case 'character.death':
        if (e.data.cause.kind === 'magic') backlashDeaths++;
        if (e.data.cause.kind === 'character' && e.data.cause.spell) {
          killsBySpell++;
          seenAtSpeed++;
        }
        break;
      case 'combat.kill':
        if (e.data.spell) killsBySpell++;
        break;
      case 'magic.kill':
        killsBySpell++;
        break;
    }
  };
  sim = createSimulation({ seed, characterCount: adventurers, watch: 'none', onEvent });
  const start = sim.world.time;
  let looks = 0;
  let casterSum = 0;
  let adventurerSum = 0;
  for (let month = 0; month < years * 12; month++) {
    sim.advance(sim.world.time + 30 * DAY);
    looks++;
    for (const c of sim.world.characters.values()) {
      if (c.death || c.calling === 'dread') continue;
      if (c.spells.length > 0) casterSum++;
      if (c.calling === 'adventurer') adventurerSum++;
    }
  }
  const peoples: Record<string, PeopleCount> = {};
  let studied = 0;
  const arcana: number[] = [];
  const known: Record<string, number> = {};
  const eras: WorldReport['eras'] = {};
  const livingAtEnd: WorldReport['livingAtEnd'] = {};
  for (const c of sim.world.characters.values()) {
    if (c.calling === 'dread') continue;
    for (const spell of c.spells) known[spell] = (known[spell] ?? 0) + 1;
    if (!(PEOPLES as readonly string[]).includes(c.species)) continue;
    const era =
      c.parents.length === 0
        ? c.born < start
          ? 0
          : -1
        : 1 + Math.floor((c.born - start) / (ERA_YEARS * YEAR));
    for (const into of [((eras[era] ??= {})[c.species] ??= { born: 0, gifted: 0 })].concat(
      c.death ? [] : [(livingAtEnd[c.species] ??= { born: 0, gifted: 0 })],
    )) {
      into.born++;
      if (c.gifted) into.gifted++;
    }
    const p = (peoples[c.species] ??= { lived: 0, gifted: 0, casters: 0 });
    p.lived++;
    if (c.gifted) p.gifted++;
    if (c.spells.length > 0) {
      p.casters++;
      if (!c.gifted) studied++;
      if (!c.death) arcana.push(Math.round(c.skills.arcana));
    }
  }
  return {
    seed,
    years,
    peoples,
    studied,
    castersAtOnce: casterSum / looks,
    adventurersAtOnce: adventurerSum / looks,
    learned,
    known,
    casts,
    byCaster: [...byCaster.values()].sort((a, b) => b - a),
    dreadCasts,
    fights,
    fightsWithCast: fightsWithCast.size,
    killsBySpell,
    backlashDeaths,
    magicEvents,
    seenAtSpeed,
    arcana: arcana.sort((a, b) => a - b),
    eras,
    livingAtEnd,
  };
}

/** Runs one world in a child process of this same script, for its report. */
function runInChild(
  seed: string,
  adventurers: number,
  years: number,
  blessings: string,
): Promise<WorldReport> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        ...process.execArgv,
        process.argv[1]!,
        '--world',
        seed,
        '--adventurers',
        String(adventurers),
        '--years',
        String(years),
        '--blessings',
        blessings,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(JSON.parse(out) as WorldReport) : reject(new Error(`world ${seed}`)),
    );
  });
}

async function inParallel<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await run(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function report(
  reports: readonly WorldReport[],
  adventurers: number,
  years: number,
  blessings: string,
) {
  console.log(
    `Magic audit: ${reports.length} worlds of ${adventurers} adventurers, ${years} years${
      blessings ? `; blessings ${blessings}` : ''
    }\n`,
  );
  console.log(
    'world      gifted/lived  casters (studied)  casters at once  fights with a cast  casts  top3  dread casts  kills by spell  backlash deaths  seen at Day+',
  );
  for (const r of reports) {
    const lived = sum(Object.values(r.peoples).map((p) => p.lived));
    const gifted = sum(Object.values(r.peoples).map((p) => p.gifted));
    const casters = sum(Object.values(r.peoples).map((p) => p.casters));
    const total = sum(r.byCaster) + r.dreadCasts;
    console.log(
      [
        r.seed.padEnd(10),
        `${gifted}/${lived}`.padStart(12),
        `${casters} (${r.studied})`.padStart(18),
        `${r.castersAtOnce.toFixed(1)} of ${r.adventurersAtOnce.toFixed(0)}`.padStart(16),
        `${r.fightsWithCast}/${r.fights} ${pct(r.fightsWithCast / Math.max(1, r.fights))}`.padStart(
          19,
        ),
        String(total).padStart(6),
        pct(sum(r.byCaster.slice(0, 3)) / Math.max(1, sum(r.byCaster))).padStart(5),
        String(r.dreadCasts).padStart(12),
        String(r.killsBySpell).padStart(15),
        String(r.backlashDeaths).padStart(16),
        `${r.seenAtSpeed}/${r.magicEvents}`.padStart(13),
      ].join(' '),
    );
  }

  console.log('\nBy people (all worlds): gifted / lived, casters');
  for (const people of PEOPLES) {
    const lived = sum(reports.map((r) => r.peoples[people]?.lived ?? 0));
    const gifted = sum(reports.map((r) => r.peoples[people]?.gifted ?? 0));
    const casters = sum(reports.map((r) => r.peoples[people]?.casters ?? 0));
    if (lived === 0) continue;
    console.log(
      `  ${people.padEnd(8)} ${String(gifted).padStart(4)} / ${String(lived).padEnd(5)} (${(
        (100 * gifted) /
        lived
      ).toFixed(1)}% gifted)  ${casters} casters`,
    );
  }

  console.log(
    '\nCasts by spell (all worlds): total, success / partial / failure / backlash, known by',
  );
  const spells = new Map<string, Record<string, number>>();
  for (const r of reports) {
    for (const [spell, outcomes] of Object.entries(r.casts)) {
      const into = spells.get(spell) ?? {};
      for (const [o, n] of Object.entries(outcomes)) into[o] = (into[o] ?? 0) + n;
      spells.set(spell, into);
    }
  }
  const rows = [...spells].sort((a, b) => sum(Object.values(b[1])) - sum(Object.values(a[1])));
  for (const [spell, o] of rows) {
    console.log(
      `  ${spell.padEnd(16)} ${String(sum(Object.values(o))).padStart(6)}   ${o.success ?? 0} / ${
        o.partial ?? 0
      } / ${o.failure ?? 0} / ${o.backlash ?? 0}   known by ${sum(reports.map((r) => r.known[spell] ?? 0))}`,
    );
  }
  console.log('\nThe gift by generation (all worlds): gifted % of those born, and how many');
  const share = (counts: { born: number; gifted: number }[]) => {
    const born = sum(counts.map((x) => x.born));
    const gifted = sum(counts.map((x) => x.gifted));
    return (born ? `${((100 * gifted) / born).toFixed(1)}% of ${born}` : '—').padStart(14);
  };
  console.log(`  ${''.padEnd(16)}${PEOPLES.map((p) => p.padStart(14)).join('')}`);
  const eraIds = [...new Set(reports.flatMap((r) => Object.keys(r.eras).map(Number)))].sort(
    (a, b) => a - b,
  );
  for (const era of eraIds) {
    const label =
      era === 0
        ? 'grown at start'
        : era === -1
          ? 'came in later'
          : `born yr ${(era - 1) * ERA_YEARS}-${era * ERA_YEARS}`;
    const cells = PEOPLES.map((p) => share(reports.flatMap((r) => r.eras[era]?.[p] ?? [])));
    console.log(`  ${label.padEnd(16)}${cells.join('')}`);
  }
  const living = PEOPLES.map((p) => share(reports.flatMap((r) => r.livingAtEnd[p] ?? [])));
  console.log(`  ${'living at end'.padEnd(16)}${living.join('')}`);

  const arcana = reports.flatMap((r) => r.arcana).sort((a, b) => a - b);
  console.log(
    `\nLiving casters' arcana at the end: ${arcana.length ? `median ${arcana[arcana.length >> 1]}, highest ${arcana.at(-1)}` : 'none'}`,
  );
}

function parseBlessings(text: string): Partial<Record<SpeciesId, number>> {
  const out: Partial<Record<SpeciesId, number>> = {};
  for (const part of text.split(',').filter(Boolean)) {
    const [species, percent] = part.split('=');
    if (!species || !(species in SPECIES) || !Number.isFinite(Number(percent))) {
      throw new Error(`Bad --blessings entry "${part}": use people=percent, e.g. elf=20`);
    }
    out[species as SpeciesId] = Number(percent);
  }
  return out;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      seeds: { type: 'string', default: 'alpha,bravo,charlie,delta' },
      adventurers: { type: 'string', default: '20' },
      years: { type: 'string', default: '30' },
      blessings: { type: 'string', default: '' },
      world: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });
  const adventurers = Number(values.adventurers);
  const years = Number(values.years);
  const blessings = parseBlessings(values.blessings);
  if (values.world !== undefined) {
    process.stdout.write(JSON.stringify(runWorld(values.world, adventurers, years, blessings)));
    return;
  }
  const seeds = values.seeds.split(',').filter(Boolean);
  const reports = await inParallel(seeds, availableParallelism(), (seed) =>
    runInChild(seed, adventurers, years, values.blessings),
  );
  if (values.json) console.log(JSON.stringify(reports, null, 2));
  else report(reports, adventurers, years, values.blessings);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
