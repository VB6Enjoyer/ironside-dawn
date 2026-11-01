import { useEffect, useMemo, useRef, useState } from 'react';

import type { SimHost } from '../../host';
import { HOUR, type CharacterId } from '../../sim';
import type { ProseLinks } from '../components/Prose';
import { BIOME_COLORS, MapStage } from '../map/stage';
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
  onCharacter,
  onLocation,
  onRegion,
}: {
  host: SimHost;
  time: number;
  following: readonly CharacterId[];
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

  const biomes = [...new Set(view?.regions.map((r) => r.biome) ?? [])];
  return (
    <div className="page map-page">
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
