import { useState } from 'react';

import { goodDef, professionDef, type GoodId } from '../../content';
import type { SimHost } from '../../host';
import { DAY, HOUR, toCalendar, type LocationId } from '../../sim';
import { SHOCK_NAMES, seasonName, type NameResolver } from '../../text';
import { formatCount } from '../format';
import { useQuery as useHostQuery } from '../useHost';
import { LineChart, formatValue } from './charts';

/** A town's market: what everything costs, who makes it, and how prices have moved. */
export function MarketPanel({
  host,
  townId,
  names,
  time,
}: {
  host: SimHost;
  townId: LocationId;
  names: NameResolver;
  time: number;
}) {
  const view = useQuery(host, townId, time);
  const [chosen, setChosen] = useState<GoodId>('food');
  if (!view) return null;

  const history = view.history[chosen] ?? [];
  // One price a day, the last one today.
  const x = history.map((_, i) => time - (history.length - 1 - i) * DAY);
  const when = (t: number) => {
    const c = toCalendar(t);
    return `Year ${c.year}, ${seasonName(c.season)} ${c.dayOfSeason}`;
  };
  const place = (id: LocationId) => {
    const l = names.location(id);
    return l ? `${l.article ? `${l.article} ` : ''}${l.name}` : 'the wilds';
  };

  return (
    <section className="card-section market-panel">
      <h3>The market</h3>
      <p className="muted">
        Prices are {describeIndex(view.priceIndex)}. The trading house holds{' '}
        {formatCount(Math.round(view.houseGold))} gold.
      </p>
      {view.shocks.length > 0 && (
        <ul className="troubles">
          {view.shocks.map((s, i) => (
            <li key={i}>
              {capital(SHOCK_NAMES[s.id])}
              {s.routeId ? ` on the road ${roadName(s.routeId, place)}` : ''}, for another{' '}
              {Math.max(1, Math.round((s.until - time) / DAY))} days
            </li>
          ))}
        </ul>
      )}
      <div className="table-scroll">
        <table className="hall-table market-table">
          <thead>
            <tr>
              <th>Good</th>
              <th>Price</th>
              <th title="Against thirty days ago">30 days</th>
              <th title="Wanted and offered at yesterday's auction">Wanted / offered</th>
              <th title="What the trading house pays and asks">House pays / asks</th>
              <th>In store</th>
            </tr>
          </thead>
          <tbody>
            {view.quotes.map((q) => (
              <tr
                key={q.good}
                className={q.good === chosen ? 'chosen' : undefined}
                onClick={() => setChosen(q.good)}
              >
                <td>
                  <button type="button" className="link-button" onClick={() => setChosen(q.good)}>
                    {capital(goodDef(q.good).name)}
                  </button>
                </td>
                <td>{formatValue(round(q.price))}</td>
                <td className={trend(q.change)}>{q.change === null ? '—' : change(q.change)}</td>
                <td>
                  {q.day
                    ? `${formatValue(Math.round(q.day.demand))} / ${formatValue(Math.round(q.day.supply))}`
                    : '—'}
                </td>
                <td>
                  {formatValue(round(q.bid))} / {formatValue(round(q.ask))}
                </td>
                <td>{formatValue(Math.floor(q.stock))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LineChart
        title={`${capital(goodDef(chosen).name)} over the last year`}
        subtitle="The going price each day, in gold"
        x={x}
        xLabel={when}
        series={[{ id: chosen, label: 'Price', color: 'var(--series-1)', values: history }]}
      />
      <h3>Who works here</h3>
      <dl className="facts">
        {view.workforce.map((w) => (
          <div key={w.id} className="fact-row">
            <dt>{capital(professionDef(w.id).name)}</dt>
            <dd>
              {formatCount(w.workers)}{' '}
              <span className="muted">
                · {w.vigor >= 0.95 ? 'thriving' : w.vigor >= 0.8 ? 'getting by' : 'going hungry'}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function useQuery(host: SimHost, townId: LocationId, time: number) {
  // Markets clear once a day; asking every in-game hour is plenty.
  return useHostQuery(host, { kind: 'market', id: townId }, Math.floor(time / HOUR));
}

const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const change = (ratio: number) => {
  const pct = Math.round((ratio - 1) * 100);
  return pct === 0 ? 'steady' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
};
const trend = (ratio: number | null) =>
  ratio === null || Math.abs(ratio - 1) < 0.05 ? undefined : ratio > 1 ? 'dearer' : 'cheaper';

function describeIndex(index: number): string {
  if (index >= 1.5) return `high, ${Math.round(index * 100)}% of where they started`;
  if (index <= 0.67) return `low, ${Math.round(index * 100)}% of where they started`;
  return `about where they started (${Math.round(index * 100)}%)`;
}

function roadName(routeId: string, place: (id: LocationId) => string): string {
  const [a, b] = routeId.split('~') as [LocationId, LocationId];
  return `between ${place(a)} and ${place(b)}`;
}
