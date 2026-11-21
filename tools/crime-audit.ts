/**
 * Crime audit (ROADMAP.md, 0.3.0 step 1): runs several worlds headless and
 * reports how crime goes in them, against the targets of the Outlaws Update.
 *
 *   npm run audit:crime                                   (4 worlds of 20, 100 years)
 *   npm run audit:crime -- --adventurers 200 --years 15 --seeds a,b
 *
 * Each world runs in its own process, as many at once as there are cores.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';

import { createSimulation, DAY, type CharacterId, type SimEvent } from '../src/sim';

const YEAR = 360 * DAY;

/** What one world's century of crime came to. */
interface WorldReport {
  readonly seed: string;
  readonly years: number;
  /** Year (from 0) each outlaw turned, and why. */
  readonly turns: readonly { readonly year: number; readonly why: string }[];
  /** How many different people turned (some turn more than once). */
  readonly people: number;
  readonly robberies: number;
  readonly ambushes: number;
  readonly murders: number;
  /** Robberies and ambushes by each outlaw who led any, most first. */
  readonly byOutlaw: readonly number[];
  /** How outlaws' careers ended: went straight, killed for the bounty, otherwise dead, still at large. */
  /**
   * How outlaws' careers ended: went straight, killed for the bounty, taken alive,
   * otherwise dead, still at large (held ones aside).
   */
  readonly ends: {
    reformed: number;
    bountied: number;
    captured: number;
    died: number;
    atLarge: number;
  };
  /** Bounties claimed (heads and live captives) and heads lost; capture tries and outcomes. */
  readonly justice: {
    heads: number;
    alive: number;
    lost: number;
    traps: number;
    takedowns: number;
    caught: number;
    escapes: number;
    jailed: number;
    freed: number;
    held: number;
  };
  /** Share of monthly looks at an honest adventurer that found them broke. */
  readonly brokeShare: number;
  /** Crimes against the nameless that came off, by kind, and those foiled (0.3.0). */
  readonly nameless: Record<string, number>;
  readonly foiled: number;
  /** Of those, done by someone who was no outlaw; and fines paid. */
  readonly occasional: number;
  readonly fined: number;
  /** Gold worth the towns lost to crime, and gold fences paid out. */
  readonly stolen: number;
  readonly fenced: number;
  /** Towns' standing worsening as word spread, by the standing reached; turned away at gates. */
  readonly notorious: Record<string, number>;
  readonly turnedAway: number;
}

function runWorld(seed: string, adventurers: number, years: number): WorldReport {
  const turns: { year: number; why: string }[] = [];
  const turned = new Set<CharacterId>();
  const byOutlaw = new Map<CharacterId, number>();
  let robberies = 0;
  let ambushes = 0;
  let murders = 0;
  const nameless: Record<string, number> = {};
  const notorious: Record<string, number> = {};
  let foiled = 0;
  let occasional = 0;
  let fined = 0;
  let stolen = 0;
  let fenced = 0;
  let turnedAway = 0;
  const ends = { reformed: 0, bountied: 0, captured: 0, died: 0, atLarge: 0 };
  const justice = {
    heads: 0,
    alive: 0,
    lost: 0,
    traps: 0,
    takedowns: 0,
    caught: 0,
    escapes: 0,
    jailed: 0,
    freed: 0,
    held: 0,
  };
  let start = 0;
  let sim: ReturnType<typeof createSimulation> | null = null;
  const credit = (id: CharacterId) => byOutlaw.set(id, (byOutlaw.get(id) ?? 0) + 1);
  const onEvent = (e: SimEvent) => {
    if (!sim) return;
    switch (e.type) {
      case 'outlaw.turn':
        turned.add(e.data.characterId);
        turns.push({
          year: Math.floor((e.t - start) / YEAR),
          why: e.data.reason ?? 'want',
        });
        break;
      case 'crime.robbery':
        robberies++;
        credit(e.data.characterId);
        break;
      case 'outlaw.ambush':
        ambushes++;
        credit(e.data.characterId);
        break;
      case 'crime.commit': {
        if (!sim.world.characters.get(e.data.characterId)?.outlaw) occasional++;
        else credit(e.data.characterId);
        if (e.data.fine !== undefined) fined++;
        if (e.data.foiled) foiled++;
        else nameless[e.data.crime] = (nameless[e.data.crime] ?? 0) + 1;
        stolen += e.data.value;
        break;
      }
      case 'crime.fence':
        fenced += e.data.gold;
        break;
      case 'outlaw.notorious':
        notorious[e.data.standing] = (notorious[e.data.standing] ?? 0) + 1;
        break;
      case 'outlaw.barred':
        turnedAway++;
        break;
      case 'outlaw.reform':
        ends.reformed++;
        break;
      case 'bounty.head':
        ends.bountied++;
        break;
      case 'bounty.claim':
        if (e.data.alive) justice.alive++;
        else justice.heads++;
        break;
      case 'bounty.lost':
        justice.lost++;
        break;
      case 'capture.attempt':
        if (e.data.how === 'trap') justice.traps++;
        else justice.takedowns++;
        if (e.data.success) {
          justice.caught++;
          ends.captured++;
        }
        break;
      case 'capture.escape':
        justice.escapes++;
        break;
      case 'outlaw.jailed':
        justice.jailed++;
        break;
      case 'outlaw.freed':
        justice.freed++;
        break;
      case 'character.death': {
        const dead = sim.world.characters.get(e.data.characterId);
        const cause = e.data.cause;
        if (cause.kind === 'character' && sim.world.characters.get(cause.characterId)?.outlaw) {
          murders++;
        }
        // Killed for a bounty is counted when the head is taken, which follows this event
        // while the bounty still stands; any other end of an outlaw is counted here.
        if (dead?.outlaw && !(cause.kind === 'character' && sim.world.bounties.has(dead.id))) {
          ends.died++;
        }
        break;
      }
    }
  };
  sim = createSimulation({ seed, characterCount: adventurers, watch: 'none', onEvent });
  start = sim.world.time;
  let looks = 0;
  let broke = 0;
  for (let month = 0; month < years * 12; month++) {
    sim.advance(sim.world.time + 30 * DAY);
    for (const c of sim.world.characters.values()) {
      if (c.death || c.calling !== 'adventurer' || c.outlaw) continue;
      looks++;
      if (c.gold < 40) broke++;
    }
  }
  for (const c of sim.world.characters.values()) {
    if (c.death || !c.outlaw) continue;
    if (c.captive || c.activity.kind === 'jailed') justice.held++;
    else ends.atLarge++;
  }
  return {
    seed,
    years,
    turns,
    people: turned.size,
    robberies,
    ambushes,
    murders,
    byOutlaw: [...byOutlaw.values()].sort((a, b) => b - a),
    ends,
    justice,
    brokeShare: looks ? broke / looks : 0,
    nameless,
    foiled,
    occasional,
    fined,
    stolen,
    fenced,
    notorious,
    turnedAway,
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

const pct = (x: number) => `${Math.round(x * 100)}%`;
const share = (counts: readonly number[], top: number) => {
  const total = counts.reduce((a, b) => a + b, 0);
  return total ? counts.slice(0, top).reduce((a, b) => a + b, 0) / total : null;
};
/** Share of the run's decades in which anyone turned outlaw. */
const decadesWithATurn = (r: WorldReport) => {
  const decades = Math.max(1, Math.ceil(r.years / 10));
  return new Set(r.turns.map((t) => Math.floor(t.year / 10))).size / decades;
};

function report(reports: readonly WorldReport[], adventurers: number, years: number): void {
  console.log(
    `Crime audit: ${reports.length} worlds of ${adventurers} adventurers, ${years} years\n`,
  );
  console.log(
    'world      outlaws (people)  first  decades  robberies  ambushes  murders  top1  top2  ends (straight/head/alive/died/at large)  broke',
  );
  for (const r of reports) {
    const top1 = share(r.byOutlaw, 1);
    const top2 = share(r.byOutlaw, 2);
    console.log(
      [
        r.seed.padEnd(10),
        `${r.turns.length} (${r.people})`.padStart(16),
        String(r.turns[0]?.year ?? '—').padStart(6),
        pct(decadesWithATurn(r)).padStart(8),
        String(r.robberies).padStart(10),
        String(r.ambushes).padStart(9),
        String(r.murders).padStart(8),
        (top1 === null ? '—' : pct(top1)).padStart(5),
        (top2 === null ? '—' : pct(top2)).padStart(5),
        `${r.ends.reformed}/${r.ends.bountied}/${r.ends.captured}/${r.ends.died}/${r.ends.atLarge}`.padStart(
          39,
        ),
        `${(r.brokeShare * 100).toFixed(2)}%`.padStart(6),
      ].join(' '),
    );
  }
  console.log(
    '\nworld      nameless  nameless share  by kind                                        foiled  by non-outlaws (fined)  stolen/yr  fenced/yr  word: suspected/unwelcome/barred  turned away',
  );
  for (const r of reports) {
    const total = Object.values(r.nameless).reduce((a, b) => a + b, 0);
    const kinds = Object.entries(r.nameless)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    console.log(
      [
        r.seed.padEnd(10),
        String(total).padStart(8),
        (total + r.robberies ? pct(total / (total + r.robberies)) : '—').padStart(15),
        kinds.padEnd(46),
        String(r.foiled).padStart(6),
        `${r.occasional} (${r.fined})`.padStart(23),
        String(Math.round(r.stolen / r.years)).padStart(10),
        String(Math.round(r.fenced / r.years)).padStart(10),
        `${r.notorious.suspected ?? 0}/${r.notorious.unwelcome ?? 0}/${r.notorious.barred ?? 0}`.padStart(
          33,
        ),
        String(r.turnedAway).padStart(12),
      ].join(' '),
    );
  }
  console.log(
    '\nworld      bounties paid (heads/alive)  heads lost  capture tries (trap/takedown)  taken  escaped  jailed  freed  held now',
  );
  for (const r of reports) {
    const j = r.justice;
    console.log(
      [
        r.seed.padEnd(10),
        `${j.heads}/${j.alive}`.padStart(27),
        String(j.lost).padStart(11),
        `${j.traps}/${j.takedowns}`.padStart(30),
        String(j.caught).padStart(6),
        String(j.escapes).padStart(8),
        String(j.jailed).padStart(7),
        String(j.freed).padStart(6),
        String(j.held).padStart(9),
      ].join(' '),
    );
  }
  const whys = new Map<string, number>();
  for (const r of reports) for (const t of r.turns) whys.set(t.why, (whys.get(t.why) ?? 0) + 1);
  console.log(
    `\nWhy they turned: ${[...whys].map(([why, n]) => `${why} ${n}`).join(', ') || 'nobody did'}`,
  );

  // The step 2 targets: a trickle of outlaws through the years, and no one outlaw owning crime.
  const trickle = reports.filter((r) => decadesWithATurn(r) >= 0.5).length;
  const spread = reports.filter((r) => (share(r.byOutlaw, 1) ?? 0) <= 0.4).length;
  const namelessMost = reports.filter((r) => {
    const total = Object.values(r.nameless).reduce((a, b) => a + b, 0);
    return total > r.robberies;
  }).length;
  // More than a tenth of the adventurers turning in the first year is a burst.
  const burstOver = Math.max(2, Math.round(adventurers / 10));
  const burst = reports.filter(
    (r) => r.turns.filter((t) => t.year === 0).length > burstOver,
  ).length;
  console.log('\nTargets');
  const mark = (ok: boolean) => (ok ? '✓' : '✗');
  console.log(
    `  ${mark(trickle === reports.length)} someone turns outlaw in at least half the decades: ${trickle} of ${reports.length} worlds`,
  );
  console.log(
    `  ${mark(spread === reports.length)} no outlaw leads more than 40% of the crimes: ${spread} of ${reports.length} worlds`,
  );
  console.log(
    `  ${mark(namelessMost === reports.length)} most crimes have no named victim: ${namelessMost} of ${reports.length} worlds`,
  );
  console.log(
    `  ${mark(burst === 0)} no burst of outlaws in the first year (more than ${burstOver}): ${burst} of ${reports.length} worlds`,
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      seeds: { type: 'string', default: 'alpha,bravo,charlie,delta' },
      adventurers: { type: 'string', default: '20' },
      years: { type: 'string', default: '100' },
      world: { type: 'string' },
      json: { type: 'boolean', default: false },
    },
  });
  const adventurers = Number(values.adventurers);
  const years = Number(values.years);
  if (values.world !== undefined) {
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

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
