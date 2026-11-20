import { useMemo, useState } from 'react';

import { isDigest, type HostSnapshot, type SimHost } from '../../host';
import { HOUR, Importance, type CharacterId, type LocationId } from '../../sim';
import type { SpeciesId } from '../../content';
import {
  describeEvent,
  EVENT_CATEGORIES,
  EVENT_TONES,
  eventCategory,
  eventTone,
  formatTimestamp,
  SPECIES_NAMES,
  type EventCategory,
  type Mark,
  type NameResolver,
} from '../../text';
import { EventLog } from '../components/EventLog';
import { Prose, type ProseLinks } from '../components/Prose';
import { useDisplay } from '../display';
import { useQuery } from '../useHost';
import { placeName } from './PlacesPage';

/** The live log, with filters by kind of event, place and people, and follow mode. */
export function LogPage({
  host,
  snapshot,
  names,
  selected,
  ...links
}: {
  host: SimHost;
  snapshot: HostSnapshot;
  names: NameResolver;
  selected: CharacterId | null;
} & ProseLinks) {
  const [category, setCategory] = useState<EventCategory | 'all'>('all');
  const [place, setPlace] = useState<LocationId | 'all'>('all');
  const [species, setSpecies] = useState<SpeciesId | 'all'>('all');
  const [tone, setTone] = useState<Mark | 'all'>('all');
  const [onlyFollowed, setOnlyFollowed] = useState(true);
  const { layout } = useDisplay();
  const followed = snapshot.following[0] ?? null;
  const followOnly = followed !== null && onlyFollowed;

  const filtered = useMemo(() => {
    const active =
      category !== 'all' || place !== 'all' || species !== 'all' || tone !== 'all' || followOnly;
    if (!active) return snapshot.log;
    return snapshot.log.filter((e) => {
      if (isDigest(e)) return false;
      if (followOnly && !e.actors.includes(followed)) return false;
      if (category !== 'all' && eventCategory(e.type) !== category) return false;
      if (tone !== 'all' && eventTone(e) !== tone) return false;
      if (place !== 'all' && e.locationId !== place) return false;
      if (species !== 'all') {
        const matches = e.actors.some(
          (id) => names.character(id as CharacterId)?.species === species,
        );
        if (!matches) return false;
      }
      return true;
    });
    // names change identity never; their contents grow with namesVersion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.log, category, place, species, tone, followOnly, followed, snapshot.namesVersion]);

  return (
    <div className="log-page">
      <div className="log-main">
        {followed && (
          <div className="follow-bar">
            <span>
              Following{' '}
              <button
                type="button"
                className="ref ref-character"
                onClick={(e) => links.onCharacter?.(followed, e)}
              >
                {names.character(followed)?.name ?? 'someone'}
              </button>
            </span>
            <label>
              <input
                type="checkbox"
                checked={onlyFollowed}
                onChange={(e) => setOnlyFollowed(e.target.checked)}
              />{' '}
              Only their doings
            </label>
            <button type="button" onClick={() => host.follow([])}>
              Stop following
            </button>
          </div>
        )}
        <div className="log-filters" role="group" aria-label="Filter the log">
          <label>
            Show
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as EventCategory | 'all')}
            >
              <option value="all">Everything</option>
              {EVENT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Where
            <select value={place} onChange={(e) => setPlace(e.target.value as LocationId | 'all')}>
              <option value="all">Anywhere</option>
              {[...host.places.values()].map((p) => (
                <option key={p.id} value={p.id}>
                  {placeName(p)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Who
            <select
              value={species}
              onChange={(e) => setSpecies(e.target.value as SpeciesId | 'all')}
            >
              <option value="all">Anyone</option>
              {(Object.keys(SPECIES_NAMES) as SpeciesId[]).map((s) => (
                <option key={s} value={s}>
                  {capital(SPECIES_NAMES[s].plural)}
                </option>
              ))}
            </select>
          </label>
          <div className="tone-chips" role="group" aria-label="Only events of a kind">
            {EVENT_TONES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tone-chip tone-${t.id}`}
                aria-pressed={tone === t.id}
                title={tone === t.id ? 'Show everything again' : `Only ${t.label.toLowerCase()}`}
                onClick={() => setTone(tone === t.id ? 'all' : t.id)}
              >
                <span className="tone-symbol" aria-hidden="true">
                  {t.symbol}
                </span>
                {t.label}
              </button>
            ))}
          </div>
          {filtered !== snapshot.log && (
            <span className="muted">
              {filtered.length} of {snapshot.log.length} entries
            </span>
          )}
        </div>
        <EventLog
          log={filtered}
          names={names}
          selected={selected}
          empty={
            filtered === snapshot.log ? undefined : 'Nothing in the log matches these filters.'
          }
          {...links}
        />
      </div>
      {layout === 'wide' && <Headlines host={host} names={names} time={snapshot.time} {...links} />}
    </div>
  );
}

/** Beside the live log on wide screens: the notable and legendary, newest first. */
function Headlines({
  host,
  names,
  time,
  ...links
}: { host: SimHost; names: NameResolver; time: number } & ProseLinks) {
  const events = useQuery(
    host,
    { kind: 'events', query: { minImportance: Importance.Notable, limit: HEADLINES } },
    Math.floor(time / HOUR),
  );
  return (
    <aside className="headlines" aria-label="Headlines">
      <h3>Headlines</h3>
      {!events ? null : events.length === 0 ? (
        <p className="muted">Nothing worth telling yet.</p>
      ) : (
        <ol className="chronicle">
          {[...events].reverse().map((event) => (
            <li
              key={event.id}
              className={event.importance >= Importance.Legendary ? 'legendary' : undefined}
            >
              <time>{formatTimestamp(event.t)}</time>
              <span>
                <Prose segments={describeEvent(event, names)} {...links} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

/** How many headlines are kept beside the log. */
const HEADLINES = 40;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
