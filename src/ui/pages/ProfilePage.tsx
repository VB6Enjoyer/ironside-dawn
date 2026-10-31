import type { SimHost } from '../../host';
import { DAY, Importance, roleOf, toCalendar, type CharacterId, type SimEvent } from '../../sim';
import {
  biography,
  describeEvent,
  formatTimestamp,
  seasonName,
  SPECIES_NAMES,
  type NameResolver,
} from '../../text';
import { LineChart } from '../components/charts';
import { Prose, type ProseLinks } from '../components/Prose';
import { useQuery } from '../useHost';

/** A character's full profile: their life story, how they grew, and a timeline. */
export function ProfilePage({
  host,
  id,
  names,
  time,
  ...links
}: { host: SimHost; id: CharacterId; names: NameResolver; time: number } & ProseLinks) {
  const view = useQuery(host, { kind: 'character', id }, Math.floor(time / (DAY / 24)));
  if (view === undefined) return <p className="muted page-loading">Reading their story…</p>;
  if (view === null) return <p className="muted page-loading">Nobody by that name.</p>;
  const { character: c, events } = view;
  const home = names.location(c.homeId);
  const samples = [
    ...c.history,
    ...(c.death ? [] : [[view.slice.time, c.level, c.gold, 0] as const]),
  ];
  const x = samples.map(([t]) => t);
  const when = (t: number) => {
    const cal = toCalendar(t);
    return `Year ${cal.year}, ${seasonName(cal.season)}`;
  };

  return (
    <div className="page profile-page">
      <header className="profile-header">
        <h2>
          {c.givenName} {c.familyName}
        </h2>
        <p className="card-subtitle">
          {c.death ? 'Was a' : 'A'} level {c.level} {roleOf(c)} ·{' '}
          {SPECIES_NAMES[c.species].singular} of {home?.name ?? 'nowhere'}
          {c.outlaw && ' · outlaw'}
          {c.death && ` · died ${formatTimestamp(c.death.at)}`}
        </p>
      </header>

      <section className="biography">
        {biography(c, events, names).map((paragraph, i) => (
          <p key={i}>
            <Prose segments={paragraph} {...links} />
          </p>
        ))}
      </section>

      <div className="chart-grid-layout">
        <LineChart
          title="Level"
          x={x}
          xLabel={when}
          series={[
            {
              id: 'level',
              label: 'Level',
              color: 'var(--series-1)',
              values: samples.map(([, level]) => level),
            },
          ]}
        />
        <LineChart
          title="Gold in hand"
          x={x}
          xLabel={when}
          series={[
            {
              id: 'gold',
              label: 'Gold',
              color: 'var(--series-4)',
              values: samples.map(([, , gold]) => gold),
            },
          ]}
        />
      </div>

      <Timeline events={events} names={names} links={links} />
    </div>
  );
}

function Timeline({
  events,
  names,
  links,
}: {
  events: readonly SimEvent[];
  names: NameResolver;
  links: ProseLinks;
}) {
  const years = new Map<number, SimEvent[]>();
  for (const event of [...events].reverse()) {
    const year = toCalendar(event.t).year;
    years.set(year, [...(years.get(year) ?? []), event]);
  }
  return (
    <section className="timeline">
      <h3>Timeline</h3>
      <p className="muted">
        Most recent first. Everyday doings fade from memory in time; notable ones are kept.
      </p>
      {[...years].map(([year, list]) => (
        <section key={year}>
          <h4>Year {year}</h4>
          <ol className="card-recent">
            {list.map((event) => (
              <li
                key={event.id}
                className={event.importance >= Importance.Notable ? 'notable' : undefined}
              >
                <time>{formatTimestamp(event.t)}</time>
                <span>
                  <Prose segments={describeEvent(event, names)} {...links} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}
