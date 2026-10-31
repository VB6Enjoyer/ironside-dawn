import { useEffect } from 'react';

import { SPEED_TIERS, type HostSnapshot, type SimHost } from '../../host';
import { DAY, Importance } from '../../sim';
import { formatDate } from '../../text';

const FLOOR_OPTIONS: { value: string; label: string; floor: Importance | null }[] = [
  { value: 'auto', label: 'Auto (by speed)', floor: null },
  { value: '0', label: 'Everything', floor: Importance.Trivial },
  { value: '1', label: 'Normal and up', floor: Importance.Normal },
  { value: '2', label: 'Notable and up', floor: Importance.Notable },
  { value: '3', label: 'Legendary only', floor: Importance.Legendary },
];

const YEAR = 360 * DAY;
const SKIPS: { label: string; seconds: number }[] = [
  { label: 'a season', seconds: 90 * DAY },
  { label: 'a year', seconds: YEAR },
  { label: '5 years', seconds: 5 * YEAR },
  { label: '10 years', seconds: 10 * YEAR },
  { label: '25 years', seconds: 25 * YEAR },
];

export function Controls({ host, snapshot }: { host: SimHost; snapshot: HostSnapshot }) {
  const { running, speed, floorOverride, time, fastForward } = snapshot;
  const skipping = fastForward !== null;

  // Space toggles play/pause; 1–6 pick a speed.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input, select, textarea, button, dialog') ||
        event.metaKey ||
        event.ctrlKey
      ) {
        return;
      }
      if (host.getSnapshot().fastForward) return;
      if (event.key === ' ') {
        event.preventDefault();
        if (host.getSnapshot().running) host.pause();
        else host.start();
        return;
      }
      const tier = SPEED_TIERS[Number(event.key) - 1];
      if (tier) host.setSpeed(tier.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [host]);

  return (
    <section className="controls" aria-label="Simulation controls">
      <div className="clock" aria-live="off">
        {snapshot.ready ? formatDate(time) : 'The world is waking…'}
      </div>

      {skipping ? (
        <SkipProgress host={host} time={time} from={fastForward.from} to={fastForward.to} />
      ) : (
        <div className="control-row">
          <button
            type="button"
            className="play"
            onClick={() => (running ? host.pause() : host.start())}
            aria-label={running ? 'Pause' : 'Play'}
            title="Play or pause (Space)"
          >
            {running ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button
            type="button"
            onClick={() => host.step()}
            disabled={running}
            title="Run until the next event the log would show"
          >
            Next event
          </button>

          <div className="speeds" role="group" aria-label="Speed">
            {SPEED_TIERS.map((tier, i) => (
              <button
                key={tier.id}
                type="button"
                aria-pressed={speed === tier.id}
                onClick={() => host.setSpeed(tier.id)}
                title={`${tier.label} (${i + 1})`}
              >
                {tier.label}
              </button>
            ))}
          </div>

          <label className="floor">
            Detail
            <select
              value={floorOverride === null ? 'auto' : String(floorOverride)}
              onChange={(e) => {
                const option = FLOOR_OPTIONS.find((o) => o.value === e.target.value);
                host.setFloor(option?.floor ?? null);
              }}
            >
              {FLOOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="floor">
            Skip ahead
            <select
              value=""
              onChange={(e) => {
                const skip = SKIPS[Number(e.target.value)];
                if (skip) host.fastForward(host.getSnapshot().time + skip.seconds);
              }}
            >
              <option value="" disabled>
                choose…
              </option>
              {SKIPS.map((s, i) => (
                <option key={s.label} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </section>
  );
}

function SkipProgress({
  host,
  time,
  from,
  to,
}: {
  host: SimHost;
  time: number;
  from: number;
  to: number;
}) {
  const fraction = Math.max(0, Math.min(1, (time - from) / (to - from)));
  return (
    <div className="control-row skip-progress">
      <span>Skipping ahead to {formatDate(to).split(' · ').slice(0, 2).join(' · ')}</span>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
        aria-label="Skip progress"
      >
        <div className="progress-fill" style={{ width: `${fraction * 100}%` }} />
      </div>
      <span className="muted">{Math.round(fraction * 100)}%</span>
      <button type="button" onClick={() => host.cancelFastForward()}>
        Stop here
      </button>
    </div>
  );
}
