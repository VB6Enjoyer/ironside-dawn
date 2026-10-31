import type { SimHost } from '../../host';
import { DAY, toCalendar, type WorldSample } from '../../sim';
import { seasonName, SPECIES_NAMES } from '../../text';
import { ColumnChart, LineChart, StatTile, type Series } from '../components/charts';
import { formatCount } from '../format';
import { useQuery } from '../useHost';

/** Categorical slots in fixed order (see styles.css). */
const SLOT = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

const when = (t: number) => {
  const c = toCalendar(t);
  return `Year ${c.year}, ${seasonName(c.season)}`;
};

function series(
  history: readonly WorldSample[],
  defs: readonly { id: string; label: string; value(s: WorldSample): number }[],
): Series[] {
  return defs.map((d, i) => ({
    id: d.id,
    label: d.label,
    color: SLOT[i]!,
    values: history.map(d.value),
  }));
}

/** The world statistics dashboard: how the world has changed, season by season. */
export function StatsPage({ host, time }: { host: SimHost; time: number }) {
  // Samples are taken at each season's start; asking once a day is plenty.
  const stats = useQuery(host, { kind: 'stats' }, Math.floor(time / DAY));
  if (!stats) return <p className="muted page-loading">Gathering the numbers…</p>;

  const history = stats.history;
  const x = history.map((s) => s.t);
  const now = history.at(-1);
  const levels = Object.entries(stats.levels)
    .map(([level, n]) => [Number(level), n] as const)
    .sort((a, b) => a[0] - b[0]);
  const deaths = (s: WorldSample) => Object.values(s.deaths).reduce((a, n) => a + (n ?? 0), 0);
  const living = levels.reduce((a, [, n]) => a + n, 0);

  return (
    <div className="page stats-page">
      <h2>The state of the world</h2>
      <p className="muted">Sampled at the start of every season.</p>

      {now && (
        <div className="stat-tiles">
          <StatTile label="Adventurers alive" value={formatCount(living)} />
          <StatTile label="Fallen, all told" value={formatCount(deaths(now))} />
          <StatTile label="Legendary items found" value={formatCount(now.legendsFound)} />
          <StatTile label="Outlaws at large" value={formatCount(now.outlaws)} />
        </div>
      )}

      <div className="chart-grid-layout">
        <LineChart
          title="Adventurers by people"
          x={x}
          xLabel={when}
          series={series(
            history,
            (['human', 'elf', 'dwarf'] as const).map((id) => ({
              id,
              label: capital(SPECIES_NAMES[id].plural),
              value: (s) => s.population[id] ?? 0,
            })),
          )}
        />
        <LineChart
          title="Deaths by cause"
          subtitle="All told, since the world began"
          x={x}
          xLabel={when}
          series={series(history, [
            { id: 'creature', label: 'Creatures', value: (s) => s.deaths.creature ?? 0 },
            { id: 'character', label: 'Other people', value: (s) => s.deaths.character ?? 0 },
            { id: 'trap', label: 'Traps', value: (s) => s.deaths.trap ?? 0 },
            { id: 'magic', label: 'Their own magic', value: (s) => s.deaths.magic ?? 0 },
          ])}
        />
        <LineChart
          title="Levels"
          subtitle="Among the living"
          x={x}
          xLabel={when}
          series={series(history, [
            { id: 'mean', label: 'Average', value: (s) => s.meanLevel },
            { id: 'max', label: 'Highest', value: (s) => s.maxLevel },
          ])}
        />
        <LineChart
          title="Gold held by the living"
          x={x}
          xLabel={when}
          series={series(history, [{ id: 'gold', label: 'Gold', value: (s) => s.gold }])}
        />
        <LineChart
          title="Crime and justice"
          subtitle="All told, since the world began"
          x={x}
          xLabel={when}
          series={series(history, [
            { id: 'robberies', label: 'Robberies', value: (s) => s.robberies },
            { id: 'murders', label: 'Murders', value: (s) => s.murders },
            { id: 'claims', label: 'Bounties claimed', value: (s) => s.bountiesClaimed },
          ])}
        />
        <ColumnChart
          title="Adventurers by level, now"
          categories={levels.map(([level]) => level)}
          values={levels.map(([, n]) => n)}
          color="var(--series-1)"
          categoryLabel={(level) => `Level ${level}`}
          valueLabel={(n) => `${n} ${n === 1 ? 'adventurer' : 'adventurers'}`}
        />
      </div>
    </div>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
