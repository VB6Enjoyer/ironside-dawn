import { useState } from 'react';

import type { SimHost } from '../../host';
import { DAY, Importance } from '../../sim';
import { describeEvent, formatTimestamp, type NameResolver } from '../../text';
import { Prose, type ProseLinks } from '../components/Prose';
import { useQuery } from '../useHost';

/** The chronicle: notable and legendary events, year by year. */
export function ChroniclePage({
  host,
  names,
  time,
  ...links
}: { host: SimHost; names: NameResolver; time: number } & ProseLinks) {
  const [year, setYear] = useState<number | null>(null);
  const view = useQuery(host, { kind: 'chronicle', year }, Math.floor(time / DAY));
  if (!view) return <p className="muted page-loading">Opening the chronicle…</p>;

  return (
    <div className="page chronicle-page">
      <h2>The chronicle</h2>
      <p className="muted">The notable and the legendary, as the world will remember them.</p>
      {view.years.length > 0 && (
        <nav className="year-picker" aria-label="Year">
          {view.years.map((y) => (
            <button key={y} type="button" aria-pressed={y === view.year} onClick={() => setYear(y)}>
              Year {y}
            </button>
          ))}
        </nav>
      )}
      {view.events.length === 0 ? (
        <p className="muted">Nothing worth chronicling yet.</p>
      ) : (
        <ol className="chronicle">
          {view.events.map((event) => (
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
    </div>
  );
}
