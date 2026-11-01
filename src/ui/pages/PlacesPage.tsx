import { useEffect } from 'react';

import type { CharacterSummary, PlaceEntry, PlaceSummary, SimHost } from '../../host';
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
import { MarketPanel } from '../components/MarketPanel';
import { formatCount } from '../format';
import { Prose, type ProseLinks } from '../components/Prose';
import { useQuery } from '../useHost';

const KIND_NAMES = {
  town: 'Town',
  dungeon: 'Dungeon',
  wilderness: 'Wilderness',
  fortress: 'Fortress',
} as const;
const DANGER = ['', 'tame', 'uneasy', 'dangerous', 'deadly', 'murderous'];

export const placeName = (p: PlaceEntry | undefined) =>
  p
    ? `${p.article ? `${p.article.charAt(0).toUpperCase()}${p.article.slice(1)} ` : ''}${p.name}`
    : 'Unknown';

/** Kinds of place in the order they are listed. */
const KIND_ORDER = ['town', 'fortress', 'dungeon', 'wilderness'] as const;

const WEATHER_NAMES = {
  fair: 'fair skies',
  rain: 'rain',
  storm: 'storms',
  snow: 'snow',
  heat: 'scorching heat',
} as const;

/** Every place in the world at a glance, land by land. */
export function PlacesPage({
  host,
  time,
  onLocation,
  onRegion,
}: { host: SimHost; time: number; onRegion?: (id: string) => void } & Required<
  Pick<ProseLinks, 'onLocation'>
>) {
  const places = useQuery(host, { kind: 'places' }, Math.floor(time / HOUR));
  if (!places) return <p className="muted page-loading">Surveying the land…</p>;
  const lands = new Map<string, PlaceSummary[]>();
  for (const p of places) {
    const key = p.region ? p.region.name : '';
    lands.set(key, [...(lands.get(key) ?? []), p]);
  }
  const order = (p: PlaceSummary) => KIND_ORDER.indexOf(host.places.get(p.id)?.kind ?? 'town');
  return (
    <div className="page places-page">
      <h2>Places</h2>
      {[...lands].map(([land, list]) => (
        <section key={land || 'all'} className="land">
          {land && (
            <h3>
              {onRegion ? (
                <button
                  type="button"
                  className="ref ref-location"
                  onClick={() => onRegion(list[0]!.region!.id)}
                >
                  {capitalFirst(land)}
                </button>
              ) : (
                capitalFirst(land)
              )}{' '}
              <span className="muted">· {list[0]!.region!.biome}</span>
            </h3>
          )}
          <ul className="place-list">
            {[...list]
              .sort((a, b) => order(a) - order(b))
              .map((p) => {
                const entry = host.places.get(p.id);
                return (
                  <li key={p.id}>
                    <button type="button" className="place-card" onClick={() => onLocation(p.id)}>
                      <span className="place-kind">{entry ? KIND_NAMES[entry.kind] : ''}</span>
                      <span className="place-name">{placeName(entry)}</span>
                      <span className="muted">
                        {p.present} here
                        {p.outlaws > 0 &&
                          ` · ${p.outlaws} ${p.outlaws === 1 ? 'outlaw' : 'outlaws'}`}
                        {p.creatures !== null && ` · ${formatCount(p.creatures)} creatures`}
                        {p.fallen > 0 && ` · ${p.fallen} fallen`}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function capitalFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One place: who's there, what lives there, what happened there. */
export function PlacePage({
  host,
  id,
  names,
  time,
  onRegion,
  ...links
}: {
  host: SimHost;
  id: LocationId;
  names: NameResolver;
  time: number;
  onRegion?: (id: string) => void;
} & ProseLinks) {
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
      {view.region && (
        <p className="muted">
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
          , {view.region.biome}; {WEATHER_NAMES[view.region.weather]} today.
          {view.heldBy && (
            <>
              {' '}
              Under the protection of{' '}
              <button
                type="button"
                className="ref ref-location"
                onClick={() => links.onLocation?.(view.heldBy!.id)}
              >
                {placeName(view.heldBy)}
              </button>
              .
            </>
          )}
        </p>
      )}

      {location.fortress && (
        <section className="card-section">
          <h3>The seat</h3>
          <p>
            {view.lord ? (
              <>
                Held by{' '}
                <button
                  type="button"
                  className="ref ref-character"
                  onClick={() => links.onCharacter?.(view.lord!.id)}
                >
                  {view.lord.name}
                </button>
              </>
            ) : (
              'Standing empty, without a lord'
            )}
            , with {formatCount(location.fortress.garrison)} soldiers in the garrison.
          </p>
          {view.territory.length > 0 && (
            <p className="muted">
              Its lands:{' '}
              {view.territory.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    className="ref ref-location"
                    onClick={() => links.onLocation?.(t.id)}
                  >
                    {placeName(t)}
                  </button>
                </span>
              ))}
              .
            </p>
          )}
        </section>
      )}

      {view.master && (
        <section className="card-section dread-lair">
          <h3>Its master</h3>
          <p>
            In the deepest chamber lairs{' '}
            <button
              type="button"
              className="ref ref-character"
              onClick={() => links.onCharacter?.(view.master!.id)}
            >
              {view.master.name}
            </button>
            , {article(SPECIES_NAMES[view.master.species].singular)}{' '}
            {SPECIES_NAMES[view.master.species].singular} of level {view.master.level}.
          </p>
        </section>
      )}

      {Object.keys(location.roaming).length > 0 && (
        <section className="card-section">
          <h3>Loose on the roads</h3>
          <dl className="facts">
            {(Object.entries(location.roaming) as [CreatureId, number][]).map(([creature, n]) => (
              <div key={creature} className="fact-row">
                <dt>{capital(creatureDef(creature).plural)}</dt>
                <dd>about {formatCount(n)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {location.kind === 'town' && (
        <p>
          Home to{' '}
          {(Object.entries(location.population) as [SpeciesId, number][])
            .map(([s, n]) => `${formatCount(n)} ${SPECIES_NAMES[s].plural}`)
            .join(' and ')}
          {location.academy && ', with an academy where the gifted study magic'}.
        </p>
      )}
      {location.kind === 'town' && (
        <MarketPanel host={host} townId={id} names={names} time={time} />
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
