import type { SimHost } from '../../host';
import { creatureDef } from '../../content';
import { DAY } from '../../sim';
import { peopleName, whenIn, type NameResolver } from '../../text';
import type { ProseLinks } from '../components/Prose';
import { useQuery } from '../useHost';
import { placeName } from './PlacesPage';

const KIND_ORDER = ['town', 'fortress', 'dungeon', 'wilderness'] as const;
const KIND_NAMES = {
  town: 'Towns',
  fortress: 'Fortresses',
  dungeon: 'Dungeons',
  wilderness: 'Wild places',
} as const;
const WEATHER = {
  fair: 'fair skies',
  rain: 'rain',
  storm: 'storms',
  snow: 'snow',
  heat: 'scorching heat',
} as const;

/** One land (Phase 10): its culture and gods, its places, its tales, and who matters there. */
export function RegionPage({
  host,
  id,
  names,
  time,
  ...links
}: { host: SimHost; id: string; names: NameResolver; time: number } & ProseLinks) {
  const view = useQuery(host, { kind: 'region', id }, Math.floor(time / DAY));
  if (view === undefined) return <p className="muted page-loading">Riding out…</p>;
  if (view === null) return <p className="muted page-loading">There is no such land.</p>;

  const place = (pid: Parameters<NonNullable<ProseLinks['onLocation']>>[0]) => (
    <button type="button" className="ref ref-location" onClick={() => links.onLocation?.(pid)}>
      {placeName(host.places.get(pid))}
    </button>
  );
  const who = (cid: Parameters<NonNullable<ProseLinks['onCharacter']>>[0], name: string) => (
    <button type="button" className="ref ref-character" onClick={() => links.onCharacter?.(cid)}>
      {name}
    </button>
  );
  const nameOf = (cid: Parameters<NameResolver['character']>[0]) =>
    view.slice.characters.get(cid)?.name ?? names.character(cid)?.name ?? 'someone';

  return (
    <div className="page region-page">
      <p className="place-kind">Region · {view.biome}</p>
      <h2>{capital(view.name)}</h2>
      <p className="muted">{capital(WEATHER[view.weather])} today.</p>

      {view.culture ? (
        <section className="card-section">
          <h3>{view.culture.name} lands</h3>
          <p>
            The {listOf(view.culture.peoples)} here are raised in {view.culture.name} ways, with its
            names, its arms and its gods.
          </p>
          <dl className="facts">
            {view.culture.deities.map((d) => (
              <div key={d.name} className="fact-row">
                <dt>{d.name}</dt>
                <dd>{d.domain}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <p className="muted">
          No culture of its own holds sway here; each people keeps its own ways.
        </p>
      )}

      <section className="card-section">
        <h3>Tales told here</h3>
        {view.myths.length === 0 ? (
          <p className="muted">Nothing here has yet passed into legend.</p>
        ) : (
          <ul className="myths">
            {view.myths.map((m) => (
              <li key={m.id} className={m.ended ? 'muted' : undefined}>
                {m.subjectId ? (
                  <>
                    {who(m.subjectId, nameOf(m.subjectId))} of {place(m.placeId)}
                  </>
                ) : (
                  <>
                    The {m.creature ? creatureDef(m.creature).name : 'terror'} of {place(m.placeId)}
                  </>
                )}
                <span className="muted">
                  {' '}
                  · told since {whenIn(m.born)} · {m.deaths} lives
                  {m.ended && ' · its tale has ended'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.notable.length > 0 && (
        <section className="card-section">
          <h3>Notable figures</h3>
          <ul className="people">
            {view.notable.map((c) => (
              <li key={c.id}>
                {who(c.id, c.name)}{' '}
                <span className="muted">
                  level {c.level} {peopleName(c.species, c.culture).singular} · {c.note}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {KIND_ORDER.map((kind) => {
        const list = view.places.filter((p) => p.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind} className="card-section">
            <h3>{KIND_NAMES[kind]}</h3>
            <p>
              {list.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  {place(p.id)}
                </span>
              ))}
            </p>
          </section>
        );
      })}
    </div>
  );
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
