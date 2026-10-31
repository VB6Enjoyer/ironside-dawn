import type { SimHost } from '../../host';
import { DAY } from '../../sim';
import { deathLine, formatTimestamp, SPECIES_NAMES, type NameResolver } from '../../text';
import { formatCount } from '../format';
import { Prose, type ProseLinks } from '../components/Prose';
import { useQuery } from '../useHost';
import type { CharacterId } from '../../sim';

/** Hall of Heroes, the Graveyard, and Most Wanted. */
export function HallsPage({
  host,
  names,
  time,
  ...links
}: { host: SimHost; names: NameResolver; time: number } & ProseLinks) {
  const halls = useQuery(host, { kind: 'halls' }, Math.floor(time / DAY));
  if (!halls) return <p className="muted page-loading">Opening the halls…</p>;
  const who = (id: CharacterId, name: string) =>
    links.onCharacter ? (
      <button type="button" className="ref ref-character" onClick={() => links.onCharacter!(id)}>
        {name}
      </button>
    ) : (
      name
    );
  const place = (id: Parameters<NameResolver['location']>[0]) => {
    const l = names.location(id);
    const text = l ? `${l.article ? `${l.article} ` : ''}${l.name}` : 'the wilds';
    return links.onLocation ? (
      <button type="button" className="ref ref-location" onClick={() => links.onLocation!(id)}>
        {text}
      </button>
    ) : (
      text
    );
  };

  return (
    <div className="page halls-page">
      <section className="hall">
        <h2>Hall of Heroes</h2>
        <p className="muted">The greatest of the living.</p>
        {halls.heroes.length === 0 ? (
          <p className="muted">No heroes yet.</p>
        ) : (
          <table className="hall-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Level</th>
                <th>Kills</th>
                <th>Legends</th>
                <th>Gold earned</th>
              </tr>
            </thead>
            <tbody>
              {halls.heroes.map((h) => (
                <tr key={h.id}>
                  <td>
                    {who(h.id, h.name)}{' '}
                    <span className="muted">{SPECIES_NAMES[h.species].singular}</span>
                  </td>
                  <td>{h.level}</td>
                  <td>{formatCount(h.kills)}</td>
                  <td>{h.legends || '—'}</td>
                  <td>{formatCount(h.goldEarned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="hall">
        <h2>Most Wanted</h2>
        <p className="muted">Outlaws with a price on their heads.</p>
        {halls.wanted.length === 0 ? (
          <p className="muted">The roads are safe, for now.</p>
        ) : (
          <ul className="wanted">
            {halls.wanted.map((w) => (
              <li key={w.id} className="wanted-poster">
                <div className="wanted-bounty">{formatCount(w.bounty)} gold</div>
                <div>{who(w.id, w.name)}</div>
                <div className="muted">
                  Level {w.level} {SPECIES_NAMES[w.species].singular} · {w.crimes}{' '}
                  {w.crimes === 1 ? 'crime' : 'crimes'}
                  {w.murders > 0 && `, ${w.murders} ${w.murders === 1 ? 'murder' : 'murders'}`}
                </div>
                <div className="muted">Last seen in {place(w.lastSeenAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="hall">
        <h2>The Graveyard</h2>
        <p className="muted">The most recently fallen.</p>
        {halls.fallen.length === 0 ? (
          <p className="muted">Nobody has died yet.</p>
        ) : (
          <ol className="graveyard">
            {halls.fallen.map((f) => (
              <li key={f.id}>
                <div>
                  {who(f.id, f.name)}{' '}
                  <span className="muted">
                    level {f.level} {SPECIES_NAMES[f.species].singular}
                    {f.outlaw && ', outlaw'}
                  </span>
                </div>
                <div className="epitaph">
                  <Prose segments={deathLine(f.cause, f.diedIn, names)} {...links} />
                  <span className="muted"> · {formatTimestamp(f.diedAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
