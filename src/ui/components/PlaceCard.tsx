import { useEffect } from 'react';

import { creatureDef, type CreatureId, type SpeciesId } from '../../content';
import type { SimHost } from '../../host';
import type { LocationId } from '../../sim';
import { describeEvent, formatTimestamp, SPECIES_NAMES, type NameResolver } from '../../text';
import { formatCount } from '../format';
import { DANGER, KIND_NAMES, People, placeName, WEATHER_NAMES } from '../pages/PlacesPage';
import { useQuery } from '../useHost';
import { Prose, type ProseLinks } from './Prose';

/** How many of those here, and of the latest events, the card shows. */
const PEOPLE_SHOWN = 8;
const EVENTS_SHOWN = 6;

/**
 * A place at a glance, in the side column like a character's card: what it
 * is, who holds or haunts it, who is there now and what happened lately.
 * Its page has the rest.
 */
export function PlaceCard({
  host,
  placeId,
  names,
  refresh,
  onPage,
  onMap,
  onRegion,
  onClose,
  ...links
}: {
  host: SimHost;
  placeId: LocationId;
  names: NameResolver;
  /** Changes when the card should ask again (the clock). */
  refresh: unknown;
  onPage(): void;
  onMap(): void;
  onRegion?: (id: string) => void;
  onClose(): void;
} & ProseLinks) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const view = useQuery(host, { kind: 'location', id: placeId }, refresh);
  if (!view) {
    return (
      <aside className="character-card place-card" aria-busy="true">
        <p className="muted">{view === null ? 'There is no such place.' : 'Travelling there…'}</p>
      </aside>
    );
  }
  const { location, present, events } = view;
  const name = placeName(host.places.get(placeId));
  const outlaws = present.filter((c) => c.outlaw);
  const honest = present.filter((c) => !c.outlaw);
  const recent = [...events].reverse().slice(0, EVENTS_SHOWN);

  return (
    <aside className="character-card place-card" aria-label={name}>
      <header className="card-header">
        <div>
          <p className="place-kind">{KIND_NAMES[location.kind]}</p>
          <h2>{name}</h2>
          {view.region && (
            <p className="card-subtitle">
              In{' '}
              {onRegion ? (
                <button
                  type="button"
                  className="ref ref-location"
                  onClick={() => onRegion(view.region!.id)}
                >
                  {view.region.name}
                </button>
              ) : (
                view.region.name
              )}
              , {view.region.biome}; {WEATHER_NAMES[view.region.weather]} today
            </p>
          )}
        </div>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="card-actions">
        <button type="button" onClick={onPage}>
          Place page
        </button>
        <button type="button" onClick={onMap} title="Where it is on the world map">
          Show on map
        </button>
      </div>

      <section className="card-section">
        {location.kind === 'town' && (
          <p>
            Home to{' '}
            {(Object.entries(location.population) as [SpeciesId, number][])
              .map(([s, n]) => `${formatCount(n)} ${SPECIES_NAMES[s].plural}`)
              .join(' and ')}
            {location.academy && ', with an academy'}.
          </p>
        )}
        {location.fortress && (
          <p>
            {view.lord ? (
              <>
                Held by{' '}
                <button
                  type="button"
                  className="ref ref-character"
                  data-character={view.lord.id}
                  onClick={(e) => links.onCharacter?.(view.lord!.id, e)}
                >
                  {view.lord.name}
                </button>
              </>
            ) : (
              'Standing empty, without a lord'
            )}
            , with {formatCount(location.fortress.garrison)} soldiers.
          </p>
        )}
        {location.dungeon && (
          <>
            <p>
              {capital(article(DANGER[location.dungeon.def.danger]!))}{' '}
              {DANGER[location.dungeon.def.danger]} place, {location.dungeon.def.depth} chambers
              deep.
              {view.master && (
                <>
                  {' '}
                  In its depths lairs{' '}
                  <button
                    type="button"
                    className="ref ref-character"
                    data-character={view.master.id}
                    onClick={(e) => links.onCharacter?.(view.master!.id, e)}
                  >
                    {view.master.name}
                  </button>
                  .
                </>
              )}
            </p>
            <Creatures counts={location.dungeon.population} />
          </>
        )}
        {Object.keys(location.roaming).length > 0 && (
          <>
            <p className="muted">Loose on the roads:</p>
            <Creatures counts={location.roaming} />
          </>
        )}
      </section>

      {outlaws.length > 0 && (
        <section className="card-section">
          <h3>Danger on the road</h3>
          <People people={outlaws.slice(0, PEOPLE_SHOWN)} onCharacter={links.onCharacter} />
        </section>
      )}

      <section className="card-section">
        <h3>Here now</h3>
        {honest.length === 0 ? (
          <p className="muted">Nobody.</p>
        ) : (
          <>
            <People people={honest.slice(0, PEOPLE_SHOWN)} onCharacter={links.onCharacter} />
            {honest.length > PEOPLE_SHOWN && (
              <p className="muted">and {formatCount(honest.length - PEOPLE_SHOWN)} more</p>
            )}
          </>
        )}
      </section>

      <section className="card-section">
        <h3>Lately</h3>
        {recent.length === 0 ? (
          <p className="muted">Nothing worth telling.</p>
        ) : (
          <ol className="card-recent">
            {recent.map((event) => (
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
    </aside>
  );
}

/** "about 40 skeletons", most first. */
function Creatures({ counts }: { counts: Partial<Record<CreatureId, number>> }) {
  const shown = (Object.entries(counts) as [CreatureId, number][])
    .filter(([, n]) => Math.round(n) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (shown.length === 0) return null;
  return (
    <dl className="facts">
      {shown.map(([creature, n]) => (
        <div key={creature} className="fact-row">
          <dt>{capital(creatureDef(creature).plural)}</dt>
          <dd>about {formatCount(Math.round(n))}</dd>
        </div>
      ))}
    </dl>
  );
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
