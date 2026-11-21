import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import {
  APP_VERSION,
  compareVersions,
  createWorkerHost,
  FIRST_RELEASE,
  HISTORY_VERSION,
  replaysHere,
  SAME_HISTORY_SINCE,
  type InitOptions,
  type SavedGame,
  type SimHost,
} from '../host';
import { installPack, type ContentPack } from '../content';
import { defaultSettings, type CharacterId, type LocationId, type WorldSettings } from '../sim';
import { CharacterCard } from './components/CharacterCard';
import { Controls } from './components/Controls';
import { DigestPanel } from './components/DigestPanel';
import { DisplaySettings } from './components/DisplaySettings';
import { HoverPreviews } from './components/HoverPreview';
import { PlaceCard } from './components/PlaceCard';
import type { LinkClick } from './components/Prose';
import { SearchBox } from './components/SearchBox';
import { StatusBar } from './components/StatusBar';
import { WhatsNew } from './components/WhatsNew';
import { WorldsDialog } from './components/WorldsDialog';
import { ChroniclePage } from './pages/ChroniclePage';
import { HallsPage } from './pages/HallsPage';
import { LogPage } from './pages/LogPage';
import { PlacePage, PlacesPage } from './pages/PlacesPage';
import { ProfilePage } from './pages/ProfilePage';
import { MainMenu } from './pages/MainMenu';
import { RegionPage } from './pages/RegionPage';
import { StatsPage } from './pages/StatsPage';
import { TradePage } from './pages/TradePage';

// The map brings in PixiJS, so it loads only when first opened.
const MapPage = lazy(() => import('./pages/MapPage'));
import { useRoute, type Route } from './route';
import { specFromUrl, specOfSave, writeSpecToUrl, type WorldSpec } from './seed';
import { currentDisplay } from './display';
import { packsByIds } from './packs';
import { markNotesSeen, notesUnseen } from './releases';
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

/**
 * The world's content packs go into this page's tables as well as the
 * worker's, so its creatures, arms and spells can be named here. A pack can
 * go in only once per page; one changed since needs a reload.
 */
function installHere(packs: readonly ContentPack[]): string | null {
  for (const pack of packs) {
    try {
      installPack(pack);
    } catch (e) {
      return `${e instanceof Error ? e.message : String(e)} Reload the page to use it.`;
    }
  }
  return null;
}

/**
 * Why a link's world won't follow the history it had where the link was made,
 * or null if it will: a seed plays out the same only in versions that play
 * worlds out the same way.
 */
function otherHistory(madeWith: string = FIRST_RELEASE): string | null {
  if (replaysHere(madeWith)) return null;
  return compareVersions(madeWith, HISTORY_VERSION) > 0
    ? `This link comes from a newer version (${madeWith}) than this one (${APP_VERSION}), so its world turns out differently here.`
    : `This link was made with version ${madeWith}. Worlds have played out differently since ${SAME_HISTORY_SINCE}, so its world turns out differently here.`;
}

/** A world begun now, in this version. */
function freshSession(spec: WorldSpec, from?: WorldSpec): Session {
  const packs = packsByIds(spec.packs);
  const missing = spec.packs.filter((id) => !packs.some((p) => p.id === id));
  const trouble = installHere(packs);
  return {
    key: nextSessionKey++,
    spec: { ...spec, packs: packs.map((p) => p.id), madeWith: HISTORY_VERSION },
    init: {
      seed: spec.seed,
      characterCount: spec.characterCount,
      settings: spec.settings,
      ...(packs.length > 0 ? { packs } : {}),
    },
    note:
      trouble ??
      (missing.length > 0
        ? `This world was made with content packs you haven't added here (${missing.join(', ')}), so it has turned out differently.`
        : null) ??
      (from ? otherHistory(from.madeWith) : null),
  };
}

function savedSession(game: SavedGame, note: string): Session {
  const packs = game.world.packs;
  return {
    key: nextSessionKey++,
    spec: specOfSave(game),
    init: { seed: game.seed, restore: game },
    note: installHere(packs) ?? note,
  };
}

/** Whether a saved world was made with the settings and packs a link asks for. */
function sameSettings(saved: SavedGame['world'], spec: WorldSpec): boolean {
  const wanted: WorldSettings = { ...defaultSettings(spec.characterCount), ...spec.settings };
  const packs = saved.packs.map((p) => p.id);
  return (
    JSON.stringify(saved.settings) === JSON.stringify(wanted) &&
    packs.join(',') === spec.packs.join(',')
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // The notes open by themselves once after each update, and from the version button.
  const [notesOpen, setNotesOpen] = useState(() => notesUnseen(APP_VERSION));
  const [displayOpen, setDisplayOpen] = useState(false);

  // The bare address opens the main menu; a link to a world opens that world,
  // carried on from its autosave if it has been watched here before.
  const [menu, setMenu] = useState(() => specFromUrl() === null);
  useEffect(() => {
    let current = true;
    const linked = specFromUrl();
    if (!linked) return;
    const arrive = async (): Promise<Session> => {
      const game = await readSave(autosaveId(linked.seed)).catch(() => null);
      const fits =
        game &&
        game.world.characterCount === linked.characterCount &&
        sameSettings(game.world, linked);
      return fits
        ? savedSession(game, 'Carried on from where you left this world.')
        : freshSession(linked, linked);
    };
    // Whatever goes wrong carrying on, the world begun afresh beats a page stuck opening.
    void arrive()
      .catch((e: unknown) => {
        console.error('Could not carry on a saved world', e);
        return freshSession(linked, linked);
      })
      .then((session) => {
        if (current) setSession(session);
      });
    return () => {
      current = false;
    };
  }, []);

  const enter = (next: Session) => {
    setMenu(false);
    setSession(next);
  };
  const toMenu = () => {
    setDialogOpen(false);
    setSession(null);
    setMenu(true);
    // The bare address is the menu's.
    window.history.replaceState(null, '', window.location.pathname);
  };

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
        <div className="world-seed">
          <button
            type="button"
            className="version-button"
            onClick={() => setNotesOpen(true)}
            title="What’s new in this version"
          >
            v{APP_VERSION} · What’s new
          </button>
          <button
            type="button"
            className="settings-button"
            onClick={() => setDisplayOpen(true)}
            aria-label="Display settings"
            title="Display settings"
          >
            ⚙
          </button>
          {session && (
            <>
              <span>
                Seed <code>{session.spec.seed}</code>
              </span>
              <button type="button" onClick={() => setDialogOpen(true)}>
                Worlds…
              </button>
            </>
          )}
        </div>
      </header>
      {displayOpen && <DisplaySettings onClose={() => setDisplayOpen(false)} />}
      {notesOpen && (
        <WhatsNew
          onClose={() => {
            markNotesSeen(APP_VERSION);
            setNotesOpen(false);
          }}
        />
      )}

      {session ? (
        <WorldView
          onMenu={toMenu}
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
      ) : menu ? (
        <MainMenu
          onNew={(spec) => enter(freshSession(spec))}
          onLoad={(game) => enter(savedSession(game, `Loaded world ${game.seed}.`))}
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
  onMenu,
}: {
  session: Session;
  dialogOpen: boolean;
  onCloseDialog(): void;
  onSession(session: Session): void;
  onStartOver(): void;
  onMenu(): void;
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
      onMenu={onMenu}
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
  onMenu,
}: {
  host: SimHost;
  session: Session;
  dialogOpen: boolean;
  onCloseDialog(): void;
  onSession(session: Session): void;
  onStartOver(): void;
  onMenu(): void;
}) {
  const snapshot = useHostSnapshot(host);
  const [route, go] = useRoute();
  const [selected, setSelected] = useState<CharacterId | null>(null);
  // A place's card takes the side column instead of a character's while open.
  const [placeCard, setPlaceCard] = useState<LocationId | null>(null);
  const [note, setNote] = useState(session.note);
  // On a life story the card shows that character until closed: closing it
  // there has to be remembered, or the page would bring it straight back.
  const [dismissed, setDismissed] = useState<CharacterId | null>(null);
  const closeCard = useCallback(() => {
    setSelected(null);
    if (route.page === 'profile') setDismissed(route.id);
  }, [route]);
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

  // A click on a name opens its card or its page, as chosen under Display
  // settings; with Ctrl (or Cmd) held, the other.
  const toPage = (click?: LinkClick) =>
    (currentDisplay().characterClick === 'page') !==
    Boolean(click && (click.ctrlKey || click.metaKey));
  const links = {
    onCharacter: (id: CharacterId, click?: LinkClick) => {
      setPlaceCard(null);
      if (toPage(click)) {
        // Straight to the page, without the card beside it.
        setSelected(null);
        setDismissed(id);
        go({ page: 'profile', id });
      } else {
        setSelected(id);
      }
    },
    onLocation: (id: LocationId, click?: LinkClick) => {
      if (toPage(click)) {
        // Straight to the page, without a card beside it.
        setPlaceCard(null);
        setSelected(null);
        go({ page: 'place', id });
      } else {
        setSelected(null);
        setPlaceCard(id);
      }
    },
  };
  const toRegion = (id: string) => go({ page: 'region', id });
  const cardId = placeCard
    ? null
    : (selected ?? (route.page === 'profile' && route.id !== dismissed ? route.id : null));

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
        <SearchBox host={host} onCharacter={links.onCharacter} onLocation={links.onLocation} />
      </nav>
      <div className={`world-area${cardId || placeCard ? ' with-card' : ''}`}>
        <main className="page-area">
          {route.page === 'log' && (
            <LogPage host={host} snapshot={snapshot} names={names} selected={cardId} {...links} />
          )}
          {route.page === 'chronicle' && (
            <ChroniclePage host={host} names={names} time={snapshot.time} {...links} />
          )}
          {route.page === 'places' && (
            <PlacesPage
              host={host}
              time={snapshot.time}
              onLocation={links.onLocation}
              onRegion={toRegion}
            />
          )}
          {route.page === 'place' && (
            <PlacePage
              host={host}
              id={route.id}
              names={names}
              time={snapshot.time}
              onRegion={toRegion}
              onMap={() => go({ page: 'map', focus: { kind: 'place', id: route.id } })}
              {...links}
            />
          )}
          {route.page === 'region' && (
            <RegionPage host={host} id={route.id} names={names} time={snapshot.time} {...links} />
          )}
          {route.page === 'trade' && (
            <TradePage host={host} names={names} time={snapshot.time} {...links} />
          )}
          {route.page === 'map' && (
            <Suspense fallback={<p className="muted page-loading">Unrolling the map…</p>}>
              <MapPage
                host={host}
                time={snapshot.time}
                following={snapshot.following}
                focus={route.focus}
                onClearFocus={() => go({ page: 'map' })}
                onRegion={toRegion}
                {...links}
              />
            </Suspense>
          )}
          {route.page === 'stats' && <StatsPage host={host} time={snapshot.time} />}
          {route.page === 'halls' && (
            <HallsPage host={host} names={names} time={snapshot.time} {...links} />
          )}
          {route.page === 'profile' && (
            <ProfilePage
              host={host}
              id={route.id}
              names={names}
              time={snapshot.time}
              onMap={() => go({ page: 'map', focus: { kind: 'character', id: route.id } })}
              {...links}
            />
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
            onMap={() => go({ page: 'map', focus: { kind: 'character', id: cardId } })}
            onClose={closeCard}
            {...links}
          />
        )}
        {placeCard && (
          <PlaceCard
            key={placeCard}
            host={host}
            placeId={placeCard}
            names={names}
            refresh={snapshot.time}
            onPage={() => {
              setPlaceCard(null);
              go({ page: 'place', id: placeCard });
            }}
            onMap={() => go({ page: 'map', focus: { kind: 'place', id: placeCard } })}
            onRegion={toRegion}
            onClose={() => setPlaceCard(null)}
            {...links}
          />
        )}
      </div>
      <StatusBar snapshot={snapshot} />
      <HoverPreviews host={host} names={names} />

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
          onMenu={() => {
            // Kept as it is now, so Continue on the menu carries on from here.
            void save(true)
              .catch(() => undefined)
              .then(onMenu);
          }}
          onClose={onCloseDialog}
        />
      )}
    </>
  );
}

const TABS = [
  { page: 'log', label: 'Live' },
  { page: 'chronicle', label: 'Chronicle' },
  { page: 'map', label: 'Map' },
  { page: 'places', label: 'Places' },
  { page: 'trade', label: 'Trade' },
  { page: 'stats', label: 'Statistics' },
  { page: 'halls', label: 'Halls' },
] as const;

function tabOf(route: Route): Route['page'] | null {
  if (route.page === 'place' || route.page === 'region') return 'places';
  if (route.page === 'profile') return null;
  return route.page;
}
