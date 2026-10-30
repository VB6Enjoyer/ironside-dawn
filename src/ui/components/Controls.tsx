import { useEffect } from 'react';

import { SPEED_TIERS, type HostSnapshot, type SimHost } from '../../host';
import { Importance } from '../../sim';
import { formatDate } from '../../text';

const FLOOR_OPTIONS: { value: string; label: string; floor: Importance | null }[] = [
  { value: 'auto', label: 'Auto (by speed)', floor: null },
  { value: '0', label: 'Everything', floor: Importance.Trivial },
  { value: '1', label: 'Normal and up', floor: Importance.Normal },
  { value: '2', label: 'Notable and up', floor: Importance.Notable },
  { value: '3', label: 'Legendary only', floor: Importance.Legendary },
];

export function Controls({ host, snapshot }: { host: SimHost; snapshot: HostSnapshot }) {
  const { running, speed, floorOverride, time } = snapshot;

  // Space toggles play/pause; 1–5 pick a speed.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, select, textarea, button') || event.metaKey || event.ctrlKey) {
        return;
      }
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
        {formatDate(time)}
      </div>

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
      </div>
    </section>
  );
}
