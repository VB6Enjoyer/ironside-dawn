import { useCallback, useEffect, useState } from 'react';

import { createWorkerHost, type InitOptions, type SavedGame, type SimHost } from '../host';
import type { CharacterId, LocationId } from '../sim';
import { CharacterCard } from './components/CharacterCard';
import { Controls } from './components/Controls';
import { DigestPanel } from './components/DigestPanel';
import { SearchBox } from './components/SearchBox';
import { StatusBar } from './components/StatusBar';
import { WorldsDialog } from './components/WorldsDialog';
import { ChroniclePage } from './pages/ChroniclePage';
import { HallsPage } from './pages/HallsPage';
import { LogPage } from './pages/LogPage';
import { PlacePage, PlacesPage } from './pages/PlacesPage';
import { ProfilePage } from './pages/ProfilePage';
import { StatsPage } from './pages/StatsPage';
import { useRoute, type Route } from './route';
import {
  DEFAULT_CHARACTER_COUNT,
  randomSeed,
  specFromUrl,
  writeSpecToUrl,
  type WorldSpec,
} from './seed';
import { autosaveId, readSave, writeSave } from './storage';
import { useHostSnapshot } from './useHost';

/** Real time between autosaves while the world runs. */
const AUTOSAVE_MS = 60_000;

interface Session {
  /** A new key starts a new world. */
  readonly key: number;
  readonly spec: WorldSpec;
  readonly init: InitOptions;
  readonly note: string | null;
}

let nextSessionKey = 1;

/**
 * One worker per world, shared by every render of it. It is already running
 * when you arrive, and is terminated once nothing shows the world any more
 * (after a tick, so React's mount-unmount-mount in development keeps it).
 */
const hosts = new Map<
  number,
  { host: SimHost; users: number; closing?: ReturnType<typeof setTimeout> }
>();

function useWorldHost(session: Session): SimHost {
  let entry = hosts.get(session.key);
  if (!entry) {
    entry = { host: createWorkerHost(session.init), users: 0 };
    entry.host.start();
    hosts.set(session.key, entry);
  }
  useEffect(() => {
    const kept = hosts.get(session.key);
    if (!kept) return;
    kept.users++;
    clearTimeout(kept.closing);
    return () => {
      kept.users--;
      if (kept.users > 0) return;
      kept.closing = setTimeout(() => {
        kept.host.dispose();
        hosts.delete(session.key);
      });
    };
  }, [session.key]);
  return entry.host;
}

function freshSession(spec: WorldSpec): Session {
  return {
    key: nextSessionKey++,
    spec,
    init: { seed: spec.seed, characterCount: spec.characterCount },
    note: null,
  };
}

function savedSession(game: SavedGame, note: string): Session {
  return {
    key: nextSessionKey++,
    spec: { seed: game.seed, characterCount: game.world.characterCount },
    init: { seed: game.seed, restore: game },
    note,
  };
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // On arrival: the world named in the link, carried on from its autosave if
  // you've watched it here before; otherwise a new world.
  useEffect(() => {
    const spec = specFromUrl() ?? { seed: randomSeed(), characterCount: DEFAULT_CHARACTER_COUNT };
    let current = true;
    readSave(autosaveId(spec.seed))
      .catch(() => null)
      .then((game) => {
        if (!current) return;
        const fits = game && game.world.characterCount === spec.characterCount;
        setSession(
          fits
            ? savedSession(game, 'Carried on from where you left this world.')
            : freshSession(spec),
        );
      });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (session) writeSpecToUrl(session.spec);
  }, [session]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Ironside Dawn</h1>
          <p className="tagline">A world you watch rather than play.</p>
        </div>
        {session && (
          <div className="world-seed">
            <span>
              Seed <code>{session.spec.seed}</code>
            </span>
            <button type="button" onClick={() => setDialogOpen(true)}>
              Worlds…
            </button>
          </div>
        )}
      </header>

      {session ? (
        <WorldView
          key={session.key}
          session={session}
          dialogOpen={dialogOpen}
          onCloseDialog={() => setDialogOpen(false)}
          onSession={(next) => {
            setDialogOpen(false);
            window.location.hash = '';
            setSession(next);
          }}
          onStartOver={() => setSession(freshSession(session.spec))}
        />
      ) : (
        <p className="muted page-loading">Opening the world…</p>
      )}
    </div>
  );
}

function WorldView({
  session,
  dialogOpen,
  onCloseDialog,
  onSession,
  onStartOver,
}: {
  session: Session;
  dialogOpen: boolean;
  onCloseDialog(): void;
  onSession(session: Session): void;
  onStartOver(): void;
}) {
  const host = useWorldHost(session);
  return (
    <Observatory
      host={host}
      session={session}
      dialogOpen={dialogOpen}
      onCloseDialog={onCloseDialog}
      onSession={onSession}
      onStartOver={onStartOver}
    />
  );
}

function Observatory({
  host,
  session,
  dialogOpen,
  onCloseDialog,
  onSession,
  onStartOver,
}: {
  host: SimHost;
  session: Session;
  dialogOpen: boolean;
  onCloseDialog(): void;
  onSession(session: Session): void;
  onStartOver(): void;
}) {
  const snapshot = useHostSnapshot(host);
  const [route, go] = useRoute();
  const [selected, setSelected] = useState<CharacterId | null>(null);
  const [note, setNote] = useState(session.note);
  const closeCard = useCallback(() => setSelected(null), []);
  const names = host.names;

  const save = useCallback(
    async (auto: boolean) => {
      const game = await host.request({ kind: 'save' });
      await writeSave(game, { auto, name: `World ${game.seed}` });
    },
    [host],
  );

  // Autosave now and then while the world runs, and whenever the tab is hidden.
  useEffect(() => {
    let lastTime = -1;
    const autosave = () => {
      const { ready, time, fastForward } = host.getSnapshot();
      if (!ready || fastForward || time === lastTime) return;
      lastTime = time;
      save(true).catch(() => undefined);
    };
    const interval = setInterval(autosave, AUTOSAVE_MS);
    const onHide = () => document.visibilityState === 'hidden' && autosave();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [host, save]);

  const links = {
    onCharacter: setSelected,
    onLocation: (id: LocationId) => go({ page: 'place', id }),
  };
  const cardId = selected ?? (route.page === 'profile' ? route.id : null);

  return (
    <>
      {note && (
        <p className="note" role="status">
          {note}{' '}
          <button
            type="button"
            onClick={() => {
              setNote(null);
              onStartOver();
            }}
          >
            Start this world over
          </button>{' '}
          <button type="button" onClick={() => setNote(null)} aria-label="Dismiss">
            ✕
          </button>
        </p>
      )}
      {snapshot.error && (
        <p className="note note-error" role="alert">
          Something went wrong in the world: {snapshot.error}
        </p>
      )}
      <Controls host={host} snapshot={snapshot} />
      <nav className="tabs" aria-label="Views">
        {TABS.map((tab) => (
          <a
            key={tab.page}
            href={`#/${tab.page}`}
            aria-current={tabOf(route) === tab.page ? 'page' : undefined}
          >
            {tab.label}
          </a>
        ))}
        <SearchBox host={host} onCharacter={setSelected} onLocation={links.onLocation} />
      </nav>
      <div className={`world-area${cardId ? ' with-card' : ''}`}>
        <main className="page-area">
          {route.page === 'log' && (
            <LogPage host={host} snapshot={snapshot} names={names} selected={cardId} {...links} />
          )}
          {route.page === 'chronicle' && (
            <ChroniclePage host={host} names={names} time={snapshot.time} {...links} />
          )}
          {route.page === 'places' && (
            <PlacesPage host={host} time={snapshot.time} onLocation={links.onLocation} />
          )}
          {route.page === 'place' && (
            <PlacePage host={host} id={route.id} names={names} time={snapshot.time} {...links} />
          )}
          {route.page === 'stats' && <StatsPage host={host} time={snapshot.time} />}
          {route.page === 'halls' && (
            <HallsPage host={host} names={names} time={snapshot.time} {...links} />
          )}
          {route.page === 'profile' && (
            <ProfilePage host={host} id={route.id} names={names} time={snapshot.time} {...links} />
          )}
        </main>
        {cardId && (
          <CharacterCard
            key={cardId}
            host={host}
            characterId={cardId}
            refresh={snapshot.time}
            names={names}
            following={snapshot.following.includes(cardId)}
            onFollow={(follow) => host.follow(follow ? [cardId] : [])}
            onProfile={() => go({ page: 'profile', id: cardId })}
            onClose={closeCard}
            {...links}
          />
        )}
      </div>
      <StatusBar snapshot={snapshot} />

      {snapshot.digest && (
        <DigestPanel
          digest={snapshot.digest}
          names={names}
          onClose={() => host.dismissDigest()}
          onChronicle={() => {
            host.dismissDigest();
            go({ page: 'chronicle' });
          }}
          {...links}
        />
      )}
      {dialogOpen && (
        <WorldsDialog
          current={session.spec}
          onNew={(spec) => onSession(freshSession(spec))}
          onLoad={(game) => onSession(savedSession(game, `Loaded world ${game.seed}.`))}
          onSave={() => save(false)}
          onClose={onCloseDialog}
        />
      )}
    </>
  );
}

const TABS = [
  { page: 'log', label: 'Live' },
  { page: 'chronicle', label: 'Chronicle' },
  { page: 'places', label: 'Places' },
  { page: 'stats', label: 'Statistics' },
  { page: 'halls', label: 'Halls' },
] as const;

function tabOf(route: Route): Route['page'] | null {
  if (route.page === 'place') return 'places';
  if (route.page === 'profile') return null;
  return route.page;
}
