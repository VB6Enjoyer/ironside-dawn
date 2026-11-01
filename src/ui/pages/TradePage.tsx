import { LANGUAGES, type LanguageId } from '../../content';
import type { CaravanEntry, SimHost } from '../../host';
import { DAY, HOUR, type LocationId } from '../../sim';
import {
  describeEvent,
  formatTimestamp,
  goodsList,
  SHOCK_NAMES,
  SPECIES_NAMES,
  type NameResolver,
} from '../../text';
import { formatCount } from '../format';
import { Prose, type ProseLinks } from '../components/Prose';
import { useQuery } from '../useHost';

/** Merchants and their caravans, closed roads, and the latest deals. */
export function TradePage({
  host,
  names,
  time,
  ...links
}: { host: SimHost; names: NameResolver; time: number } & ProseLinks) {
  const view = useQuery(host, { kind: 'trade' }, Math.floor(time / HOUR));
  if (!view) return <p className="muted page-loading">Asking around the trading houses…</p>;
  const place = (id: LocationId | null) => {
    const l = id ? names.location(id) : undefined;
    return l ? `${l.article ? `${l.article} ` : ''}${l.name}` : 'the wilds';
  };
  const onRoad = view.merchants.filter((m) => m.locationId === null && cargoUnits(m) > 0);

  return (
    <div className="page trade-page">
      <h2>Trade</h2>
      <p className="muted">
        Merchants buy where goods are cheap and sell where they are dear. They are what ties the
        towns&rsquo; prices together.
      </p>

      {view.shocks.length > 0 && (
        <section className="card-section">
          <h3>Roads in trouble</h3>
          <ul className="troubles">
            {view.shocks.map((s, i) => {
              const route = view.routes.find((r) => r.id === s.routeId);
              return (
                <li key={i}>
                  {capital(SHOCK_NAMES[s.id])} between {place(route?.a ?? null)} and{' '}
                  {place(route?.b ?? null)}, for another{' '}
                  {Math.max(1, Math.round((s.until - time) / DAY))} days
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card-section">
        <h3>On the road</h3>
        {onRoad.length === 0 ? (
          <p className="muted">No caravans on the road just now.</p>
        ) : (
          <ul className="caravans">
            {onRoad.map((m) => (
              <li key={m.id}>
                <Who m={m} {...links} /> with {goodsList(m.cargo)}, bound for{' '}
                {place(m.destinationId)}{' '}
                <span className="muted">(cost {formatCount(Math.round(m.cargoPaid))} gold)</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-section">
        <h3>Merchants</h3>
        <div className="table-scroll">
          <table className="hall-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Where</th>
                <th>Gold</th>
                <th>Tongues</th>
              </tr>
            </thead>
            <tbody>
              {view.merchants.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Who m={m} {...links} />{' '}
                    <span className="muted">{SPECIES_NAMES[m.species].singular}</span>
                  </td>
                  <td>
                    {m.locationId
                      ? place(m.locationId)
                      : `on the road to ${place(m.destinationId)}`}
                  </td>
                  <td>{formatCount(m.gold)}</td>
                  <td className="tongues">{tongues(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-section">
        <h3>Lately</h3>
        {view.events.length === 0 ? (
          <p className="muted">No deals yet.</p>
        ) : (
          <ol className="card-recent">
            {[...view.events].reverse().map((event) => (
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

function Who({ m, onCharacter }: { m: CaravanEntry } & ProseLinks) {
  return onCharacter ? (
    <button type="button" className="ref ref-character" onClick={() => onCharacter(m.id)}>
      {m.name}
    </button>
  ) : (
    <>{m.name}</>
  );
}

const cargoUnits = (m: CaravanEntry) =>
  Object.values(m.cargo).reduce<number>((a, n) => a + (n ?? 0), 0);

/** The tongues a merchant can haggle in: "Common, Deeptongue". */
function tongues(m: CaravanEntry): string {
  return (Object.entries(m.languages) as [LanguageId, number][])
    .filter(([, level]) => level >= 70)
    .map(([id]) => LANGUAGES[id].name)
    .join(', ');
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
