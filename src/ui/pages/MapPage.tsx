import { useEffect, useMemo, useRef, useState } from 'react';

import type { MapView, SimHost } from '../../host';
import { HOUR, type Character, type CharacterId } from '../../sim';
import type { ProseLinks } from '../components/Prose';
import { BIOME_COLORS, MapStage, type StageFocus } from '../map/stage';
import type { MapFocus } from '../route';
import { useQuery } from '../useHost';

const BIOME_NAMES = {
  plains: 'Plains',
  forest: 'Forest',
  hills: 'Hills',
  mountains: 'Mountains',
  steppe: 'Steppe',
  marsh: 'Marsh',
  wastes: 'Wastes',
} as const;

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** The world map: lands, roads, places, and everyone on the road. Loaded on demand. */
export default function MapPage({
  host,
  time,
  following,
  focus,
  onClearFocus,
  onCharacter,
  onLocation,
  onRegion,
}: {
  host: SimHost;
  time: number;
  following: readonly CharacterId[];
  /** Someone or somewhere to show: the map zooms to them and rings them. */
  focus?: MapFocus;
  onClearFocus?: () => void;
  onRegion?: (id: string) => void;
} & ProseLinks) {
  // Travelers move between updates by the clock; the roads only need asking for now and then.
  const view = useQuery(host, { kind: 'map' }, Math.floor(time / HOUR));
  const holder = useRef<HTMLDivElement>(null);
  const stage = useRef<MapStage | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const followed = useMemo(() => new Set(following), [following]);

  // The latest handlers, for the stage to call without being rebuilt.
  const handlers = useRef({ onCharacter, onLocation, onRegion });
  useEffect(() => {
    handlers.current = { onCharacter, onLocation, onRegion };
  });

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const map = new MapStage(element, {
      onPlace: (id) => handlers.current.onLocation?.(id),
      onTraveler: (id) => handlers.current.onCharacter?.(id),
      onRegion: (id) => handlers.current.onRegion?.(id),
      onHover: setHover,
    });
    stage.current = map;
    return () => {
      map.destroy();
      stage.current = null;
    };
  }, []);

  useEffect(() => {
    if (view) stage.current?.setView(view);
  }, [view]);
  useEffect(() => {
    stage.current?.setTime(time, followed);
  }, [time, followed]);

  // Where the one to show is: asked again each hour, as they move on.
  const person = useQuery(
    host,
    focus?.kind === 'character' ? { kind: 'peek', id: focus.id } : null,
    Math.floor(time / HOUR),
  );
  const target = focus && view ? stageFocus(focus, person ?? null, view) : null;
  const targetKey = target ? `${target.kind}:${target.id}` : '';
  useEffect(() => {
    stage.current?.setFocus(target);
    // The key says when the target really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const biomes = [...new Set(view?.regions.map((r) => r.biome) ?? [])];
  return (
    <div className="page map-page">
      {focus && (
        <p className="map-focus" role="status">
          <span>{focusText(focus, person ?? null, host)}</span>
          <button type="button" onClick={onClearFocus}>
            Show the whole map
          </button>
        </p>
      )}
      <div className="map-frame" ref={holder} aria-label="World map" role="img" />
      <p className="map-hover" aria-live="polite">
        {hover ?? 'Drag to move, scroll to zoom. Click a place or a traveler.'}
      </p>
      <ul className="map-legend">
        {biomes.map((b) => (
          <li key={b}>
            <span className="swatch" style={{ background: hex(BIOME_COLORS[b]) }} />
            {BIOME_NAMES[b]}
          </li>
        ))}
        <li>
          <span className="symbol symbol-town" /> Town
        </li>
        <li>
          <span className="symbol symbol-fortress" /> Fortress
        </li>
        <li>
          <span className="symbol symbol-dungeon" /> Dungeon (ringed: a lair of the dread)
        </li>
        <li>
          <span className="symbol symbol-wild" /> Wild place (ringed: creatures roam)
        </li>
        <li>
          <span className="dot dot-adventurer" /> Adventurers
        </li>
        <li>
          <span className="dot dot-merchant" /> Merchants
        </li>
        <li>
          <span className="dot dot-outlaw" /> Outlaws
        </li>
      </ul>
    </div>
  );
}

/**
 * Where on the map someone is: their own dot on the road, their leader's if
 * they travel in a party, or else the place they are at (or fell at).
 */
function stageFocus(focus: MapFocus, person: Character | null, view: MapView): StageFocus | null {
  if (focus.kind === 'place') return { kind: 'place', id: focus.id };
  if (!person) return null;
  const onRoad = (id: CharacterId) => view.travelers.some((t) => t.id === id);
  if (!person.death && onRoad(person.id)) return { kind: 'traveler', id: person.id };
  const activity = person.activity;
  if (!person.death && activity.kind === 'accompanying' && onRoad(activity.leaderId)) {
    return { kind: 'traveler', id: activity.leaderId };
  }
  const place =
    person.death?.locationId ??
    person.locationId ??
    (activity.kind === 'traveling' ? activity.leg.from : person.homeId);
  return { kind: 'place', id: place };
}

/** "Showing Ragna Deepbeard, on the road to Faerlond." */
function focusText(focus: MapFocus, person: Character | null, host: SimHost): string {
  // Mid-sentence: "the Vaults of Ashes", not "The Vaults of Ashes".
  const place = (id: Parameters<typeof host.places.get>[0]) => {
    const p = host.places.get(id);
    return p ? `${p.article ? 'the ' : ''}${p.name}` : 'somewhere';
  };
  if (focus.kind === 'place') return `Showing ${place(focus.id)}.`;
  if (!person) return 'Looking for them…';
  const name = `${person.givenName} ${person.familyName}`;
  if (person.death) return `Showing where ${name} fell, in ${place(person.death.locationId)}.`;
  const activity = person.activity;
  if (activity.kind === 'traveling') {
    return `Showing ${name}, on the road to ${place(activity.destinationId)}.`;
  }
  if (activity.kind === 'accompanying' && !person.locationId) {
    return `Showing ${name}, on the road with their party.`;
  }
  return `Showing ${name}, in ${place(person.locationId ?? person.homeId)}.`;
}
