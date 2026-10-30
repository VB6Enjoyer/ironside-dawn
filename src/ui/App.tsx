import { useEffect, useMemo, useState } from 'react';

import { createLocalHost } from '../host';
import { browserFrames } from '../host/browser-frames';
import { worldNames } from '../text';
import { Controls } from './components/Controls';
import { EventLog } from './components/EventLog';
import { StatusBar } from './components/StatusBar';
import { randomSeed, seedFromUrl, writeSeedToUrl } from './seed';
import { useHostSnapshot } from './useHost';

export function App() {
  const [seed, setSeed] = useState(() => seedFromUrl() ?? randomSeed());

  useEffect(() => writeSeedToUrl(seed), [seed]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Ironside Dawn</h1>
          <p className="tagline">A world you watch rather than play.</p>
        </div>
        <div className="world-seed">
          <span>
            Seed <code>{seed}</code>
          </span>
          <button type="button" onClick={() => setSeed(randomSeed())}>
            New world
          </button>
        </div>
      </header>

      {/* A new seed remounts the world with a fresh host. */}
      <WorldView key={seed} seed={seed} />
    </div>
  );
}

function WorldView({ seed }: { seed: string }) {
  const [host] = useState(() => createLocalHost({ seed, frames: browserFrames }));
  const snapshot = useHostSnapshot(host);
  const names = useMemo(() => worldNames(host.world), [host]);

  // The world is already running when you arrive. Pausing on unmount stops
  // the frame loop, so a discarded world is simply garbage-collected.
  useEffect(() => {
    host.start();
    return () => host.pause();
  }, [host]);

  return (
    <>
      <Controls host={host} snapshot={snapshot} />
      <EventLog log={snapshot.log} names={names} />
      <StatusBar snapshot={snapshot} />
    </>
  );
}
