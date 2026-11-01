import type { FamilyTree as Family, SimHost, WorldSlice } from '../../host';
import { DAY, Importance, toCalendar, type CharacterId, type SimEvent } from '../../sim';
import {
  biography,
  describeEvent,
  formatTimestamp,
  seasonName,
  SPECIES_NAMES,
  type NameResolver,
} from '../../text';
import { LineChart } from '../components/charts';
import { callingTitle, lifeYears } from '../format';
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
  const heroes = new Set(
    [...view.slice.characters.values()].filter((s) => s.legend).map((s) => s.id),
  );
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
          {callingTitle(c)} · {SPECIES_NAMES[c.species].singular} of {home?.name ?? 'nowhere'}
          {c.outlaw && ' · outlaw'}
          {c.death &&
            ` · ${c.death.cause.kind === 'departed' ? 'moved on' : 'died'} ${formatTimestamp(c.death.at)}`}
        </p>
      </header>

      <section className="biography">
        {biography(c, events, names, heroes).map((paragraph, i) => (
          <p key={i}>
            <Prose segments={paragraph} {...links} />
          </p>
        ))}
      </section>

      <FamilyTree
        self={id}
        family={view.family}
        world={view.slice}
        onCharacter={links.onCharacter}
      />

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

/** Their lineage, a generation to a row, from grandparents down to grandchildren. */
function FamilyTree({
  self,
  family,
  world,
  onCharacter,
}: {
  self: CharacterId;
  family: Family;
  world: WorldSlice;
  onCharacter?: (id: CharacterId) => void;
}) {
  const rows: [string, readonly CharacterId[]][] = [
    ['Grandparents', family.grandparents],
    ['Parents', family.parents],
    ['', [self, ...(family.spouse ? [family.spouse] : []), ...family.siblings]],
    ['Children', family.children],
    ['Grandchildren', family.grandchildren],
  ];
  const kin = rows.reduce((n, [, ids]) => n + ids.length, 0);
  if (kin <= 1) return null;
  const chip = (id: CharacterId) => {
    const person = world.characters.get(id);
    if (!person) return null;
    const role = id === self ? 'self' : id === family.spouse ? 'spouse' : null;
    const className = [
      'kin',
      person.dead && 'kin-dead',
      person.legend && 'kin-legend',
      role && `kin-${role}`,
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <li key={id}>
        <button
          type="button"
          className={className}
          disabled={id === self || !onCharacter}
          onClick={() => onCharacter?.(id)}
          title={person.legend ? 'Remembered in song' : undefined}
        >
          <span className="kin-name">
            {person.legend && '★ '}
            {person.name}
          </span>
          <span className="kin-years">
            {role === 'spouse' ? 'spouse · ' : ''}
            {lifeYears(person.born, person.died)}
          </span>
        </button>
      </li>
    );
  };
  return (
    <section className="family-tree" aria-label="Family tree">
      <h3>Family</h3>
      {rows
        .filter(([, ids]) => ids.length > 0)
        .map(([label, ids]) => (
          <div key={label || 'self'} className="kin-row">
            <span className="kin-label">{label || 'Their generation'}</span>
            <ul>{ids.map(chip)}</ul>
          </div>
        ))}
    </section>
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
