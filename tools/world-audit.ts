/**
 * World audit (ROADMAP.md 0.4.0, step 1): runs several worlds headless and
 * reports what Body and Soul touches: how people die (by cause, age and
 * calling, the retired apart), how often adventurers are hurt or weary, how
 * fights and delves go, how many live (named and in the town counts), and
 * what healing costs. It records the 0.3.2 baseline and grows with 0.4.
 *
 *   npm run audit:world                                   (4 worlds of 20, 100 years)
 *   npm run audit:world -- --adventurers 100 --years 50 --seeds a,b
 *
 * Each world runs in its own process, as many at once as there are cores.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';

import { SPECIES } from '../src/content';
import {
  ageOf,
  createSimulation,
  faithWord,
  DAY,
  goingPrice,
  YEAR,
  type Character,
  type CharacterId,
  type DeathCause,
  type SimEvent,
} from '../src/sim';

/** The peoples who live in towns; the dread are counted apart. */
const PEOPLES = ['human', 'elf', 'dwarf', 'centaur'] as const;
/** How a life is counted when it ends. */
const GROUPS = [
  'adventurer',
  'merchant',
  'retired',
  'townsfolk',
  'child',
  'lord',
  'dread',
] as const;
/** Ways to die (leaving for distant lands is counted apart). */
const CAUSES = [
  'creature',
  'fight',
  'murder',
  'trap',
  'backlash',
  'age',
  'executed',
  'prison',
] as const;
/** A stage of life, by the share of their people's lifespan. */
const STAGES = ['child', 'young', 'grown', 'old'] as const;
/** Years between looks at the population and prices. */
const LOOK_YEARS = 10;

type Group = (typeof GROUPS)[number];
type Cause = (typeof CAUSES)[number];
type Stage = (typeof STAGES)[number];
type Tally<K extends string> = Partial<Record<K, number>>;

/** What one world came to. */
interface WorldReport {
  readonly seed: string;
  readonly years: number;
  /** How long the world took to run, in milliseconds (for the speed budget). */
  readonly ms: number;
  /** Deaths by cause, for each group, and those who left. */
  readonly deaths: Partial<Record<Group, Tally<Cause>>>;
  readonly departed: number;
  /** Deaths by stage of life and cause (the dread aside). */
  readonly byStage: Partial<Record<Stage, Tally<Cause>>>;
  /** Age at death as a share of the people's lifespan (the dread aside). */
  readonly lifeShare: readonly number[];
  /** Monthly looks at living adventurers: how many, and how many hurt, weary, laid up. */
  readonly looks: {
    adventurers: number;
    hurt: number;
    weary: number;
    laidUp: number;
  };
  /** At the same looks, how many carried each kind of lasting effect (0.4.0). */
  readonly carrying: Tally<string>;
  /** The living at the end, by their faith in a word (0.4.0). */
  readonly faith: Tally<string>;
  /** Fights adventurers were in, how they ended, and how many died in them. */
  readonly fights: { started: number; won: number; escaped: number; deaths: number };
  /** Delves begun, fled, and deaths in dungeons. */
  readonly delves: { entered: number; fled: number; deaths: number };
  /** Every LOOK_YEARS: the named living by people and calling, the town counts, and prices. */
  readonly eras: readonly {
    readonly year: number;
    readonly named: Tally<string>;
    /** The named living by calling, the retired counted apart from other townsfolk. */
    readonly callings: Tally<string>;
    readonly townsfolk: number;
    readonly draught: number;
    readonly herbs: number;
    /** Tonics of vigor and calming draughts (0.4.0). */
    readonly vigor: number;
    readonly calm: number;
  }[];
}

function causeOf(cause: DeathCause): Cause | 'departed' {
  switch (cause.kind) {
    case 'creature':
      return 'creature';
    case 'character':
      return cause.murder ? 'murder' : 'fight';
    case 'trap':
      return 'trap';
    case 'magic':
      return 'backlash';
    case 'age':
      return 'age';
    case 'executed':
      return 'executed';
    case 'prison':
      return 'prison';
    case 'departed':
      return 'departed';
  }
}

function stageOf(c: Character, now: number): Stage {
  const def = SPECIES[c.species];
  const age = ageOf(c, now);
  if (age < def.adultAge) return 'child';
  if (age < def.lifespan * 0.4) return 'young';
  if (age < def.lifespan * 0.75) return 'grown';
  return 'old';
}

const add = <K extends string>(tally: Tally<K>, key: K, n = 1) => {
  tally[key] = (tally[key] ?? 0) + n;
};

function runWorld(seed: string, adventurers: number, years: number): WorldReport {
  const retired = new Set<CharacterId>();
  const deaths: WorldReport['deaths'] = {};
  const byStage: WorldReport['byStage'] = {};
  const lifeShare: number[] = [];
  const fights = { started: 0, won: 0, escaped: 0, deaths: 0 };
  const delves = { entered: 0, fled: 0, deaths: 0 };
  let departed = 0;
  let sim: ReturnType<typeof createSimulation> | null = null;

  const onEvent = (e: SimEvent) => {
    if (!sim) return;
    switch (e.type) {
      case 'character.retire':
        retired.add(e.data.characterId);
        break;
      case 'combat.start':
        fights.started++;
        break;
      case 'combat.victory':
        fights.won++;
        break;
      case 'combat.escape':
        fights.escaped++;
        break;
      case 'delve.enter':
        delves.entered++;
        break;
      case 'delve.exit':
        if (e.data.fled) delves.fled++;
        break;
      case 'character.death': {
        const c = sim.world.characters.get(e.data.characterId)!;
        const cause = causeOf(e.data.cause);
        if (cause === 'departed') {
          departed++;
          break;
        }
        const group: Group =
          c.calling === 'townsfolk' && (retired.has(c.id) || c.level > 1)
            ? 'retired'
            : (c.calling as Group);
        add((deaths[group] ??= {}), cause);
        if (cause === 'creature' || cause === 'fight' || cause === 'trap' || cause === 'backlash') {
          if (cause !== 'trap') fights.deaths++;
          if (sim.world.locations.get(e.data.locationId)?.kind === 'dungeon') delves.deaths++;
        }
        if (c.calling !== 'dread') {
          add((byStage[stageOf(c, sim.world.time)] ??= {}), cause);
          lifeShare.push(ageOf(c, sim.world.time) / SPECIES[c.species].lifespan);
        }
        break;
      }
    }
  };
  const began = performance.now();
  sim = createSimulation({ seed, characterCount: adventurers, watch: 'none', onEvent });
  const start = sim.world.time;
  const looks = { adventurers: 0, hurt: 0, weary: 0, laidUp: 0 };
  const carrying: Tally<string> = {};
  const eras: WorldReport['eras'][number][] = [];

  const lookAtEra = () => {
    const world = sim!.world;
    const named: Tally<string> = {};
    const callings: Tally<string> = {};
    for (const c of world.characters.values()) {
      if (c.death) continue;
      const retiredNow = c.calling === 'townsfolk' && (retired.has(c.id) || c.level > 1);
      add(callings, retiredNow ? 'retired' : c.calling);
      if (c.calling !== 'dread') add(named, c.species);
    }
    let townsfolk = 0;
    for (const l of world.locations.values()) {
      if (l.kind !== 'town') continue;
      for (const n of Object.values(l.population)) townsfolk += n ?? 0;
    }
    const prices = (good: 'potions' | 'herbs' | 'vigor' | 'calm') => {
      const all = [...world.markets.values()].map((m) => goingPrice(m, good));
      return all.reduce((s, p) => s + p, 0) / Math.max(1, all.length);
    };
    eras.push({
      year: Math.round((world.time - start) / YEAR),
      named,
      callings,
      townsfolk: Math.round(townsfolk),
      draught: prices('potions'),
      herbs: prices('herbs'),
      vigor: prices('vigor'),
      calm: prices('calm'),
    });
  };

  lookAtEra();
  for (let month = 1; month <= years * 12; month++) {
    sim.advance(start + month * 30 * DAY);
    const now = sim.world.time;
    for (const c of sim.world.characters.values()) {
      if (c.death || c.calling !== 'adventurer') continue;
      looks.adventurers++;
      if (c.hp < c.maxHp / 2) looks.hurt++;
      if (c.stamina < c.maxStamina * 0.3) looks.weary++;
      for (const kind of new Set(c.effects.filter((e) => e.until > now).map((e) => e.kind))) {
        add(carrying, kind);
      }
      if (c.activity.kind === 'convalescing') looks.laidUp++;
    }
    if (month % (LOOK_YEARS * 12) === 0) lookAtEra();
  }
  const ms = Math.round(performance.now() - began);
  const faith: Tally<string> = {};
  for (const c of sim.world.characters.values()) {
    const word = c.death ? null : faithWord(c);
    if (word) add(faith, word);
  }
  return {
    seed,
    years,
    ms,
    deaths,
    departed,
    byStage,
    lifeShare,
    looks,
    carrying,
    faith,
    fights,
    delves,
    eras,
  };
}

/** Runs one world in a child process of this same script, for its report. */
function runInChild(seed: string, adventurers: number, years: number): Promise<WorldReport> {
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

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const total = (t: Tally<string> | undefined) => sum(Object.values(t ?? {}) as number[]);

function merge<K extends string>(tallies: readonly (Tally<K> | undefined)[]): Tally<K> {
  const out: Tally<K> = {};
  for (const t of tallies)
    for (const [k, n] of Object.entries(t ?? {})) add(out, k as K, n as number);
  return out;
}

function report(reports: readonly WorldReport[], adventurers: number, years: number) {
  const seconds = reports.map((r) => r.ms / 1000);
  console.log(
    `World audit: ${reports.length} worlds of ${adventurers} adventurers, ${years} years`,
  );
  console.log(
    `  ${(sum(seconds) / seconds.length).toFixed(1)} s a world on average (${(
      (1000 * sum(seconds)) /
      seconds.length /
      years
    ).toFixed(0)} ms a world-year), ${seconds.map((s) => s.toFixed(1)).join(' / ')} s\n`,
  );

  // Deaths by cause, overall and by group.
  const all = merge(GROUPS.map((g) => merge(reports.map((r) => r.deaths[g]))));
  const dead = total(all);
  console.log('Deaths by cause (all worlds): share of all deaths, then by group');
  console.log(
    `  ${'cause'.padEnd(10)}${'all'.padStart(14)}${GROUPS.map((g) => g.padStart(11)).join('')}`,
  );
  const byGroup = Object.fromEntries(
    GROUPS.map((g) => [g, merge(reports.map((r) => r.deaths[g]))]),
  ) as Record<Group, Tally<Cause>>;
  for (const cause of CAUSES) {
    const n = all[cause] ?? 0;
    console.log(
      `  ${cause.padEnd(10)}${`${n} (${pct(n / Math.max(1, dead))})`.padStart(14)}${GROUPS.map(
        (g) => String(byGroup[g][cause] ?? 0).padStart(11),
      ).join('')}`,
    );
  }
  console.log(
    `  ${'total'.padEnd(10)}${String(dead).padStart(14)}${GROUPS.map((g) =>
      String(total(byGroup[g])).padStart(11),
    ).join('')}`,
  );
  console.log(`  left for distant lands: ${sum(reports.map((r) => r.departed))}`);
  const retiredDeaths = total(byGroup.retired);
  console.log(
    `  the retired: ${pct((byGroup.retired.age ?? 0) / Math.max(1, retiredDeaths))} of old age`,
  );

  console.log('\nDeaths by stage of life (the dread aside): how many, and the main causes');
  for (const stage of STAGES) {
    const t = merge(reports.map((r) => r.byStage[stage]));
    const n = total(t);
    const top = (Object.entries(t) as [Cause, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, k]) => `${c} ${pct(k / Math.max(1, n))}`)
      .join(', ');
    console.log(`  ${stage.padEnd(8)}${String(n).padStart(6)}   ${top}`);
  }
  const shares = reports.flatMap((r) => r.lifeShare).sort((a, b) => a - b);
  if (shares.length) {
    console.log(
      `  age at death, share of lifespan: median ${pct(shares[shares.length >> 1]!)}, quarter ${pct(
        shares[shares.length >> 2]!,
      )}`,
    );
  }

  const looks = reports.map((r) => r.looks);
  const seen = sum(looks.map((l) => l.adventurers));
  console.log('\nLiving adventurers, looked at monthly: share of looks');
  console.log(
    `  hurt (under half health) ${pct(sum(looks.map((l) => l.hurt)) / seen)}, weary (under 30% stamina) ${pct(
      sum(looks.map((l) => l.weary)) / seen,
    )}, laid up ${pct(sum(looks.map((l) => l.laidUp)) / seen)}`,
  );
  const carrying = merge(reports.map((r) => r.carrying));
  const kinds = Object.entries(carrying).sort((a, b) => (b[1] as number) - (a[1] as number));
  console.log(
    `  carrying a lasting effect: ${
      kinds.length ? kinds.map(([k, n]) => `${k} ${pct((n as number) / seen)}`).join(', ') : 'none'
    }`,
  );

  const faith = merge(reports.map((r) => r.faith));
  const believers = total(faith);
  console.log(
    `  the living's faith at the end: ${[
      'devout',
      'believer',
      'doubter',
      'skeptic',
      'faithless',
      'corrupted',
    ]
      .map((w) => `${w} ${pct((faith[w] ?? 0) / Math.max(1, believers))}`)
      .join(', ')}`,
  );

  const f = reports.map((r) => r.fights);
  const d = reports.map((r) => r.delves);
  const started = sum(f.map((x) => x.started));
  const entered = sum(d.map((x) => x.entered));
  console.log('\nFights and delves (all worlds)');
  console.log(
    `  fights ${started}: won ${pct(sum(f.map((x) => x.won)) / started)}, escaped ${pct(
      sum(f.map((x) => x.escaped)) / started,
    )}; deaths in fights ${sum(f.map((x) => x.deaths))} (1 in ${Math.round(
      started / Math.max(1, sum(f.map((x) => x.deaths))),
    )} fights)`,
  );
  console.log(
    `  delves ${entered}: fled ${pct(sum(d.map((x) => x.fled)) / entered)}; deaths in dungeons ${sum(
      d.map((x) => x.deaths),
    )} (1 in ${Math.round(entered / Math.max(1, sum(d.map((x) => x.deaths))))} delves)`,
  );

  console.log(
    '\nPopulation and prices every ten years (all worlds summed; prices averaged over towns)',
  );
  const columns = ['adventurer', 'merchant', 'retired', 'townsfolk', 'child'] as const;
  console.log(
    `  ${'year'.padEnd(6)}${PEOPLES.map((p) => p.padStart(8)).join('')}  |${columns
      .map((c) => c.slice(0, 9).padStart(11))
      .join(
        '',
      )}  |${'town counts'.padStart(12)}${'draught'.padStart(9)}${'herbs'.padStart(7)}${'vigor'.padStart(7)}${'calm'.padStart(6)}`,
  );
  const eraCount = Math.min(...reports.map((r) => r.eras.length));
  for (let i = 0; i < eraCount; i++) {
    const eras = reports.map((r) => r.eras[i]!);
    const named = merge(eras.map((e) => e.named));
    const callings = merge(eras.map((e) => e.callings));
    const avg = (xs: number[]) => sum(xs) / xs.length;
    console.log(
      [
        `  ${String(eras[0]!.year).padEnd(6)}`,
        PEOPLES.map((p) => String(named[p] ?? 0).padStart(8)).join(''),
        '  |',
        columns.map((c) => String(callings[c] ?? 0).padStart(11)).join(''),
        '  |',
        String(sum(eras.map((e) => e.townsfolk))).padStart(12),
        avg(eras.map((e) => e.draught))
          .toFixed(1)
          .padStart(9),
        avg(eras.map((e) => e.herbs))
          .toFixed(1)
          .padStart(7),
        avg(eras.map((e) => e.vigor))
          .toFixed(1)
          .padStart(7),
        avg(eras.map((e) => e.calm))
          .toFixed(1)
          .padStart(6),
      ].join(''),
    );
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      seeds: { type: 'string', default: 'alpha,bravo,charlie,delta' },
      adventurers: { type: 'string', default: '20' },
      years: { type: 'string', default: '100' },
      json: { type: 'boolean', default: false },
      world: { type: 'string' },
    },
  });
  const adventurers = Number(values.adventurers);
  const years = Number(values.years);
  if (values.world) {
    process.stdout.write(JSON.stringify(runWorld(values.world, adventurers, years)));
    return;
  }
  const seeds = values.seeds.split(',').filter(Boolean);
  const reports = await inParallel(seeds, availableParallelism(), (seed) =>
    runInChild(seed, adventurers, years),
  );
  if (values.json) console.log(JSON.stringify(reports, null, 2));
  else report(reports, adventurers, years);
}

void main();
