import { useMemo, useState } from 'react';

import { isDigest, type HostSnapshot, type SimHost } from '../../host';
import type { CharacterId, LocationId } from '../../sim';
import type { SpeciesId } from '../../content';
import {
  EVENT_CATEGORIES,
  eventCategory,
  SPECIES_NAMES,
  type EventCategory,
  type NameResolver,
} from '../../text';
import { EventLog } from '../components/EventLog';
import type { ProseLinks } from '../components/Prose';
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
  const [onlyFollowed, setOnlyFollowed] = useState(true);
  const followed = snapshot.following[0] ?? null;
  const followOnly = followed !== null && onlyFollowed;

  const filtered = useMemo(() => {
    const active = category !== 'all' || place !== 'all' || species !== 'all' || followOnly;
    if (!active) return snapshot.log;
    return snapshot.log.filter((e) => {
      if (isDigest(e)) return false;
      if (followOnly && !e.actors.includes(followed)) return false;
      if (category !== 'all' && eventCategory(e.type) !== category) return false;
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
  }, [snapshot.log, category, place, species, followOnly, followed, snapshot.namesVersion]);

  return (
    <div className="log-page">
      {followed && (
        <div className="follow-bar">
          <span>
            Following{' '}
            <button
              type="button"
              className="ref ref-character"
              onClick={() => links.onCharacter?.(followed)}
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
          <select value={species} onChange={(e) => setSpecies(e.target.value as SpeciesId | 'all')}>
            <option value="all">Anyone</option>
            {(Object.keys(SPECIES_NAMES) as SpeciesId[]).map((s) => (
              <option key={s} value={s}>
                {capital(SPECIES_NAMES[s].plural)}
              </option>
            ))}
          </select>
        </label>
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
        empty={filtered === snapshot.log ? undefined : 'Nothing in the log matches these filters.'}
        {...links}
      />
    </div>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
