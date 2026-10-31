import { useEffect } from 'react';

import type { CharacterSummary, PlaceEntry, SimHost } from '../../host';
import { HOUR, type CharacterId, type LocationId } from '../../sim';
import { creatureDef, type CreatureId, type SpeciesId } from '../../content';
import {
  article,
  describeEvent,
  formatTimestamp,
  legendTitle,
  type NameResolver,
  SPECIES_NAMES,
} from '../../text';
import { formatCount } from '../format';
import { Prose, type ProseLinks } from '../components/Prose';
import { useQuery } from '../useHost';

const KIND_NAMES = { town: 'Town', dungeon: 'Dungeon', wilderness: 'Wilderness' } as const;
const DANGER = ['', 'tame', 'uneasy', 'dangerous', 'deadly', 'murderous'];

export const placeName = (p: PlaceEntry | undefined) =>
  p
    ? `${p.article ? `${p.article.charAt(0).toUpperCase()}${p.article.slice(1)} ` : ''}${p.name}`
    : 'Unknown';

/** Every place in the world, at a glance. */
export function PlacesPage({
  host,
  time,
  onLocation,
}: { host: SimHost; time: number } & Required<Pick<ProseLinks, 'onLocation'>>) {
  const places = useQuery(host, { kind: 'places' }, Math.floor(time / HOUR));
  if (!places) return <p className="muted page-loading">Surveying the land…</p>;
  return (
    <div className="page places-page">
      <h2>Places</h2>
      <ul className="place-list">
        {places.map((p) => {
          const entry = host.places.get(p.id);
          return (
            <li key={p.id}>
              <button type="button" className="place-card" onClick={() => onLocation(p.id)}>
                <span className="place-kind">{entry ? KIND_NAMES[entry.kind] : ''}</span>
                <span className="place-name">{placeName(entry)}</span>
                <span className="muted">
                  {p.present} {p.present === 1 ? 'adventurer' : 'adventurers'} here
                  {p.outlaws > 0 && ` · ${p.outlaws} ${p.outlaws === 1 ? 'outlaw' : 'outlaws'}`}
                  {p.creatures !== null && ` · ${formatCount(p.creatures)} creatures`}
                  {p.fallen > 0 && ` · ${p.fallen} fallen`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One place: who's there, what lives there, what happened there. */
export function PlacePage({
  host,
  id,
  names,
  time,
  ...links
}: { host: SimHost; id: LocationId; names: NameResolver; time: number } & ProseLinks) {
  // Watching a place reports its fights blow by blow.
  useEffect(() => {
    host.watchPlace(id);
    return () => host.watchPlace(null);
  }, [host, id]);
  const view = useQuery(host, { kind: 'location', id }, time);
  if (view === undefined) return <p className="muted page-loading">Travelling there…</p>;
  if (view === null) return <p className="muted page-loading">There is no such place.</p>;
  const { location, present, fallen, events } = view;
  const outlaws = present.filter((c) => c.outlaw);
  const honest = present.filter((c) => !c.outlaw);

  return (
    <div className="page place-page">
      <p className="place-kind">{KIND_NAMES[location.kind]}</p>
      <h2>{placeName(host.places.get(id))}</h2>

      {location.kind === 'town' && (
        <p>
          Home to{' '}
          {(Object.entries(location.population) as [SpeciesId, number][])
            .map(([s, n]) => `${formatCount(n)} ${SPECIES_NAMES[s].plural}`)
            .join(' and ')}
          {location.academy && ', with an academy where the gifted study magic'}.
        </p>
      )}

      {location.dungeon && (
        <section className="card-section">
          <h3>What lives here</h3>
          <p className="muted">
            {capital(article(DANGER[location.dungeon.def.danger]!))}{' '}
            {DANGER[location.dungeon.def.danger]} place, {location.dungeon.def.depth} chambers deep.
          </p>
          <dl className="facts">
            {(Object.entries(location.dungeon.population) as [CreatureId, number][])
              .filter(([, n]) => Math.round(n) > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([creature, n]) => (
                <div key={creature} className="fact-row">
                  <dt>{capital(creatureDef(creature).plural)}</dt>
                  <dd>about {formatCount(Math.round(n))}</dd>
                </div>
              ))}
          </dl>
          {location.dungeon.lostItems.length > 0 && (
            <p>
              Lost here, waiting to be found:{' '}
              {location.dungeon.lostItems.map(legendTitle).join(', ')}.
            </p>
          )}
        </section>
      )}

      {outlaws.length > 0 && (
        <section className="card-section">
          <h3>Danger on the road</h3>
          <People people={outlaws} onCharacter={links.onCharacter} />
        </section>
      )}

      <section className="card-section">
        <h3>Here now</h3>
        {honest.length === 0 ? (
          <p className="muted">Nobody.</p>
        ) : (
          <People people={honest} onCharacter={links.onCharacter} />
        )}
      </section>

      {fallen.length > 0 && (
        <section className="card-section">
          <h3>Fell here</h3>
          <People people={fallen} onCharacter={links.onCharacter} />
        </section>
      )}

      <section className="card-section">
        <h3>Lately</h3>
        {events.length === 0 ? (
          <p className="muted">Nothing worth telling.</p>
        ) : (
          <ol className="card-recent">
            {[...events]
              .reverse()
              .slice(0, 40)
              .map((event) => (
                <li key={event.id}>
                  <time>{formatTimestamp(event.t)}</time>
                  <span>
                    <Prose segments={describeEvent(event, names)} {...links} />
                  </span>
                </li>
              ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function People({
  people,
  onCharacter,
}: {
  people: readonly CharacterSummary[];
  onCharacter?: (id: CharacterId) => void;
}) {
  return (
    <ul className="people">
      {[...people]
        .sort((a, b) => b.level - a.level)
        .map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`ref ref-character${p.dead ? ' ref-dead' : ''}`}
              onClick={() => onCharacter?.(p.id)}
            >
              {p.name}
            </button>{' '}
            <span className="muted">
              level {p.level} {SPECIES_NAMES[p.species].singular}
            </span>
          </li>
        ))}
    </ul>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
