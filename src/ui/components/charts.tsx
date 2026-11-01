import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * Small hand-made SVG charts for the statistics pages: line charts over time
 * and a column chart. Thin marks, recessive axes, a crosshair with one
 * tooltip for every series, a legend for two or more series, and a table
 * view so nothing depends on hovering or on color alone.
 */

export interface Series {
  readonly id: string;
  readonly label: string;
  /** A CSS color, normally one of the --series-N tokens, in fixed order. */
  readonly color: string;
  readonly values: readonly number[];
}

const MARGIN = { top: 12, right: 76, bottom: 26, left: 48 };
const HEIGHT = 200;
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function formatValue(n: number): string {
  return Math.abs(n) >= 10_000 ? compact.format(n) : full.format(n);
}

/** Round axis ticks from zero up to at least `max`. */
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  // Everything charted is counted, so steps are whole numbers.
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough)!,
  );
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function Frame({
  title,
  subtitle,
  legend,
  table,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: readonly Series[];
  table: React.ReactNode;
  children: React.ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="chart">
      <figcaption className="chart-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="chart-subtitle">{subtitle}</p>}
        </div>
        <button type="button" className="chart-toggle" onClick={() => setShowTable(!showTable)}>
          {showTable ? 'Chart' : 'Table'}
        </button>
      </figcaption>
      {legend && legend.length >= 2 && (
        <ul className="chart-legend">
          {legend.map((s) => (
            <li key={s.id}>
              <svg width="16" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="16"
                  y2="4"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {showTable ? <div className="chart-table">{table}</div> : children}
    </figure>
  );
}

/** Values over time, one line per series, all on one axis. */
export function LineChart({
  title,
  subtitle,
  x,
  xLabel,
  series,
}: {
  title: string;
  subtitle?: string;
  /** The x of each value. */
  x: readonly number[];
  /** How to name an x value: "Year 3, Harvest". */
  xLabel(value: number): string;
  series: readonly Series[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const tooltipId = useId();

  const innerW = Math.max(100, width - MARGIN.left - MARGIN.right);
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = niceTicks(max);
  const top = ticks.at(-1)!;
  const x0 = x[0] ?? 0;
  const span = Math.max(1, (x.at(-1) ?? 1) - x0);
  const px = (v: number) => MARGIN.left + ((v - x0) / span) * innerW;
  const py = (v: number) => MARGIN.top + innerH - (v / top) * innerH;

  const pick = (clientX: number, rect: DOMRect) => {
    const t = x0 + ((clientX - rect.left - MARGIN.left) / innerW) * span;
    let best = 0;
    for (let i = 1; i < x.length; i++) if (Math.abs(x[i]! - t) < Math.abs(x[best]! - t)) best = i;
    return best;
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) =>
    setHover(pick(e.clientX, e.currentTarget.getBoundingClientRect()));
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const from = hover ?? x.length - 1;
    setHover(Math.max(0, Math.min(x.length - 1, from + (e.key === 'ArrowLeft' ? -1 : 1))));
  };

  // End labels only when they won't run into each other.
  const ends = series.map((s) => py(s.values.at(-1) ?? 0)).sort((a, b) => a - b);
  const endLabels = series.length <= 4 && ends.every((y, i) => i === 0 || y - ends[i - 1]! >= 14);

  const yearTicks = timeTicks(x, innerW);
  const table = (
    <table>
      <thead>
        <tr>
          <th>When</th>
          {series.map((s) => (
            <th key={s.id}>{s.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {x.map((v, i) => (
          <tr key={v}>
            <td>{xLabel(v)}</td>
            {series.map((s) => (
              <td key={s.id}>{formatValue(s.values[i] ?? 0)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Frame title={title} subtitle={subtitle} legend={series} table={table}>
      <div className="chart-body" ref={ref}>
        {x.length < 2 ? (
          <p className="muted">Not enough history yet.</p>
        ) : (
          <>
            <svg
              width={width}
              height={HEIGHT}
              role="img"
              aria-label={`${title}. Use the table for the values.`}
              aria-describedby={hover !== null ? tooltipId : undefined}
              tabIndex={0}
              onPointerMove={onPointer}
              onPointerLeave={() => setHover(null)}
              onKeyDown={onKey}
              onBlur={() => setHover(null)}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    className="chart-grid"
                    x1={MARGIN.left}
                    x2={MARGIN.left + innerW}
                    y1={py(t)}
                    y2={py(t)}
                  />
                  <text
                    className="chart-tick"
                    x={MARGIN.left - 6}
                    y={py(t)}
                    dy="0.32em"
                    textAnchor="end"
                  >
                    {formatValue(t)}
                  </text>
                </g>
              ))}
              {yearTicks.map((t) => (
                <text
                  key={t.value}
                  className="chart-tick"
                  x={px(t.value)}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                >
                  {t.label}
                </text>
              ))}
              {series.map((s) => (
                <polyline
                  key={s.id}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={s.values.map((v, i) => `${px(x[i]!)},${py(v)}`).join(' ')}
                />
              ))}
              {endLabels &&
                series.map((s) => (
                  <text
                    key={s.id}
                    className="chart-end-label"
                    x={px(x.at(-1)!) + 8}
                    y={py(s.values.at(-1) ?? 0)}
                    dy="0.32em"
                  >
                    {formatValue(s.values.at(-1) ?? 0)}
                    {series.length > 1 ? ` ${s.label}` : ''}
                  </text>
                ))}
              {hover !== null && (
                <g>
                  <line
                    className="chart-crosshair"
                    x1={px(x[hover]!)}
                    x2={px(x[hover]!)}
                    y1={MARGIN.top}
                    y2={MARGIN.top + innerH}
                  />
                  {series.map((s) => (
                    <circle
                      key={s.id}
                      cx={px(x[hover]!)}
                      cy={py(s.values[hover] ?? 0)}
                      r="4"
                      fill={s.color}
                      className="chart-dot"
                    />
                  ))}
                </g>
              )}
            </svg>
            {hover !== null && (
              <div
                id={tooltipId}
                className="chart-tooltip"
                role="status"
                style={{
                  left: Math.min(px(x[hover]!) + 12, width - 180),
                  top: MARGIN.top,
                }}
              >
                <div className="chart-tooltip-title">{xLabel(x[hover]!)}</div>
                {series.map((s) => (
                  <div key={s.id} className="chart-tooltip-row">
                    <svg width="12" height="8" aria-hidden="true">
                      <line
                        x1="0"
                        y1="4"
                        x2="12"
                        y2="4"
                        stroke={s.color}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                    <strong>{formatValue(s.values[hover] ?? 0)}</strong>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Frame>
  );
}

/** Year boundaries as x ticks, thinned to fit. */
function timeTicks(x: readonly number[], width: number): { value: number; label: string }[] {
  const YEAR = 360 * 86_400;
  const first = x[0] ?? 0;
  const last = x.at(-1) ?? 0;
  const startYear = Math.ceil(first / YEAR);
  const endYear = Math.floor(last / YEAR);
  const years = Math.max(1, endYear - startYear + 1);
  const every = Math.max(1, Math.ceil(years / Math.max(2, Math.floor(width / 60))));
  const ticks: { value: number; label: string }[] = [];
  for (let y = startYear; y <= endYear; y += every)
    ticks.push({ value: y * YEAR, label: `Y${y + 1}` });
  return ticks;
}

/** One value per category, as columns from a single baseline. */
export function ColumnChart({
  title,
  subtitle,
  categories,
  values,
  color,
  categoryLabel,
  valueLabel,
}: {
  title: string;
  subtitle?: string;
  categories: readonly (string | number)[];
  values: readonly number[];
  color: string;
  categoryLabel(category: string | number): string;
  valueLabel(value: number): string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const margin = { top: 16, right: 12, bottom: 26, left: 40 };
  const innerW = Math.max(100, width - margin.left - margin.right);
  const innerH = HEIGHT - margin.top - margin.bottom;
  const ticks = niceTicks(Math.max(0, ...values));
  const top = ticks.at(-1)!;
  const band = innerW / Math.max(1, categories.length);
  const barW = Math.max(2, Math.min(24, band - 2));
  const py = (v: number) => margin.top + innerH - (v / top) * innerH;
  const labelEvery = Math.max(1, Math.ceil(categories.length / Math.floor(innerW / 28)));

  const table = (
    <table>
      <tbody>
        {categories.map((c, i) => (
          <tr key={c}>
            <td>{categoryLabel(c)}</td>
            <td>{valueLabel(values[i] ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Frame title={title} subtitle={subtitle} table={table}>
      <div className="chart-body" ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${title}. Use the table for the values.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                className="chart-grid"
                x1={margin.left}
                x2={margin.left + innerW}
                y1={py(t)}
                y2={py(t)}
              />
              <text
                className="chart-tick"
                x={margin.left - 6}
                y={py(t)}
                dy="0.32em"
                textAnchor="end"
              >
                {formatValue(t)}
              </text>
            </g>
          ))}
          {categories.map((c, i) => {
            const v = values[i] ?? 0;
            const x = margin.left + i * band + (band - barW) / 2;
            const h = Math.max(0, innerH - (py(v) - margin.top));
            const r = Math.min(4, barW / 2, h);
            const y = py(v);
            // Rounded at the data end, square at the baseline.
            const path = `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`;
            return (
              <g
                key={c}
                tabIndex={0}
                role="img"
                aria-label={`${categoryLabel(c)}: ${valueLabel(v)}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                {/* A hit area wider than the column. */}
                <rect
                  x={margin.left + i * band}
                  y={margin.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                />
                {h > 0 && (
                  <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />
                )}
                {i % labelEvery === 0 && (
                  <text className="chart-tick" x={x + barW / 2} y={HEIGHT - 6} textAnchor="middle">
                    {c}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="chart-tooltip"
            role="status"
            style={{
              left: Math.min(margin.left + hover * band + band, width - 160),
              top: margin.top,
            }}
          >
            <div className="chart-tooltip-row">
              <strong>{valueLabel(values[hover] ?? 0)}</strong>
              <span>{categoryLabel(categories[hover]!)}</span>
            </div>
          </div>
        )}
      </div>
    </Frame>
  );
}

/** A labelled number, for the row above the charts. */
export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}
