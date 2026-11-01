import type { CharacterId, Importance, LocationId } from '../sim';
import type { NameResolver } from '../text';
import type {
  ClientMessage,
  EngineMessage,
  EngineStatus,
  FastForwardDigest,
  InitOptions,
  LogEntry,
  NameEntry,
  PlaceEntry,
  Port,
  Request,
  RequestOf,
  Responses,
} from './protocol';
import { speedTier, type SpeedId } from './speed';

/**
 * The UI's handle on a world running elsewhere (ARCHITECTURE.md §5). It keeps
 * a copy of what the UI shows all the time (the clock, the log, everyone's
 * names) and fetches anything else on request.
 */
export interface SimHost {
  getSnapshot(): HostSnapshot;
  /** Called whenever the snapshot changes (about ten times a second while running). */
  subscribe(listener: () => void): () => void;
  start(): void;
  pause(): void;
  setSpeed(speed: SpeedId): void;
  /** Overrides the speed's default log floor; null goes back to the default. */
  setFloor(floor: Importance | null): void;
  /** While paused: runs until the next event the log would show (at most one in-game day). */
  step(): void;
  /** Follow these characters: their every move is logged, blow by blow. */
  follow(ids: readonly CharacterId[]): void;
  /** Report blow-by-blow detail at this place too (a location being looked at). */
  watchPlace(id: LocationId | null): void;
  /** Skips ahead as fast as possible, then pauses with a digest of what happened. */
  fastForward(until: number): void;
  cancelFastForward(): void;
  /** Puts away the digest of the last skip. */
  dismissDigest(): void;
  request<K extends Request['kind']>(request: RequestOf<K>): Promise<Responses[K]>;
  /** Names of everyone who ever lived, and every place, for prose. */
  readonly names: NameResolver;
  readonly places: ReadonlyMap<LocationId, PlaceEntry>;
  /** Stops the world for good. */
  dispose(): void;
}

export interface HostSnapshot extends EngineStatus {
  /** False until the engine has sent the world for the first time. */
  readonly ready: boolean;
  /** Log entries, oldest first. */
  readonly log: readonly LogEntry[];
  /** What happened during the last skip ahead, until dismissed. */
  readonly digest: FastForwardDigest | null;
  /** Goes up whenever names change, for memoizing on them. */
  readonly namesVersion: number;
  readonly error: string | null;
}

export interface RemoteHostOptions {
  /** Most log entries kept for the UI. Defaults to 20,000. */
  readonly logLimit?: number;
  readonly onDispose?: () => void;
}

export function createRemoteHost(
  port: Port<EngineMessage, ClientMessage>,
  init: InitOptions,
  options: RemoteHostOptions = {},
): SimHost {
  const logLimit = options.logLimit ?? 20_000;
  const listeners = new Set<() => void>();
  const people = new Map<CharacterId, NameEntry>();
  const places = new Map<LocationId, PlaceEntry>();
  const waiting = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  let nextRequestId = 1;
  let disposed = false;

  let snapshot: HostSnapshot = {
    seed: init.seed,
    time: 0,
    running: false,
    speed: 'minute',
    floorOverride: null,
    floor: speedTier('minute').defaultFloor,
    eventCount: 0,
    hiddenCount: 0,
    livingCount: 0,
    fallenCount: 0,
    measuredRate: 0,
    following: [],
    fastForward: null,
    ready: false,
    log: [],
    digest: null,
    namesVersion: 0,
    error: null,
  };

  const publish = (next: HostSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  port.onmessage = ({ data: message }) => {
    if (disposed) return;
    switch (message.kind) {
      case 'update': {
        for (const entry of message.names) people.set(entry.id, entry);
        for (const place of message.places ?? []) places.set(place.id, place);
        let log = snapshot.log;
        if (message.entries.length > 0) {
          log = log.concat(message.entries);
          if (log.length > logLimit) log = log.slice(log.length - logLimit);
        }
        publish({
          ...snapshot,
          ...message.status,
          ready: true,
          log,
          digest: message.digest ?? snapshot.digest,
          namesVersion: snapshot.namesVersion + (message.names.length > 0 ? 1 : 0),
        });
        return;
      }
      case 'reply': {
        waiting.get(message.id)?.resolve(message.result);
        waiting.delete(message.id);
        return;
      }
      case 'error': {
        if (message.id !== null) {
          waiting.get(message.id)?.reject(new Error(message.message));
          waiting.delete(message.id);
        } else {
          publish({ ...snapshot, error: message.message });
        }
        return;
      }
    }
  };

  const send = (message: ClientMessage) => {
    if (!disposed) port.postMessage(message);
  };
  send({ kind: 'init', ...init });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => send({ kind: 'start' }),
    pause: () => send({ kind: 'pause' }),
    setSpeed: (speed) => send({ kind: 'speed', speed }),
    setFloor: (floor) => send({ kind: 'floor', floor }),
    step: () => send({ kind: 'step' }),
    follow: (ids) => send({ kind: 'follow', ids }),
    watchPlace: (id) => send({ kind: 'watchPlace', id }),
    fastForward: (until) => send({ kind: 'fastForward', until }),
    cancelFastForward: () => send({ kind: 'cancelFastForward' }),
    dismissDigest: () => publish({ ...snapshot, digest: null }),
    request<K extends Request['kind']>(request: RequestOf<K>) {
      const id = nextRequestId++;
      return new Promise<Responses[K]>((resolve, reject) => {
        if (disposed) return reject(new Error('The world has been closed'));
        waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
        send({ kind: 'request', id, request });
      });
    },
    names: {
      character(id) {
        return people.get(id);
      },
      location(id) {
        return places.get(id);
      },
    },
    places,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { reject } of waiting.values()) reject(new Error('The world has been closed'));
      waiting.clear();
      listeners.clear();
      options.onDispose?.();
    },
  };
}
