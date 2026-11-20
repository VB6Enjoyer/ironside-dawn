// Pixi without eval, so the map runs under a strict content security policy
// (the desktop build has one).
import 'pixi.js/unsafe-eval';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js';

import type { BiomeId } from '../../content';
import type { MapPlace, MapTraveler, MapView } from '../../host';
import type { CharacterId, LocationId } from '../../sim';

/**
 * The world map (ROADMAP.md Phase 9), drawn with PixiJS on one canvas:
 * regions as colored land, roads, places, and everyone on the road moving
 * along them. Drag to pan, scroll or pinch to zoom; places and travelers
 * can be clicked. Distances in the view are leagues; the map scales them.
 */

/** Land colors, muted to sit on the dark page. */
export const BIOME_COLORS: Record<BiomeId, number> = {
  plains: 0x4f5d3c,
  forest: 0x2e4a34,
  hills: 0x5e5539,
  mountains: 0x4c4f58,
  steppe: 0x6b6040,
  marsh: 0x34504a,
  wastes: 0x5c3631,
};
/** For a map with no regions (the starter map). */
const PLAIN_LAND = 0x3b4236;

const ROAD = 0xb39a6b;
const TOWN = 0xe6e2d8;
const DUNGEON = 0xc0574d;
const FORTRESS = 0x9aa3b0;
const WILD = 0xc9b878;
const LABEL = 0xe6e2d8;
const TRAVELER: Record<'adventurer' | 'merchant' | 'outlaw' | 'other', number> = {
  adventurer: 0x6fa8e8,
  merchant: 0xe3b04f,
  outlaw: 0xe0604f,
  other: 0xbfbfbf,
};
const FOLLOWED = 0xffffff;

/** Pixels per league in the land texture. */
const TEXEL = 4;

/** What the map is asked to show: a traveler's dot, or a place. */
export type StageFocus =
  | { readonly kind: 'traveler'; readonly id: CharacterId }
  | { readonly kind: 'place'; readonly id: LocationId };

/** How far in the map zooms to show something: at least this many pixels per league... */
const FOCUS_SCALE = 18;
/** ...and at least this many times closer than the whole map. */
const FOCUS_ZOOM = 2.5;
const HIGHLIGHT = 0xf0c14b;

export interface StageEvents {
  onPlace(id: LocationId): void;
  onTraveler(id: CharacterId): void;
  onRegion(id: string): void;
  onHover(text: string | null): void;
}

export class MapStage {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly land = new Container();
  private readonly roads = new Graphics();
  private readonly places = new Container();
  private readonly movers = new Container();
  /** The ring around whatever the map was asked to show. */
  private readonly highlight = new Graphics();
  private focus: StageFocus | null = null;
  /** A new focus not yet zoomed to (the canvas may still be getting ready). */
  private focusChanged = false;
  /** Whether the view keeps a moving focus in the middle: until the user pans or zooms. */
  private tracking = false;
  private pulse = 0;
  private ready = false;
  private destroyed = false;
  private view: MapView | null = null;
  private landKey = '';
  private following: ReadonlySet<CharacterId> = new Set();
  private time = 0;
  private fitted = false;
  private readonly sprites = new Map<CharacterId, Graphics>();

  constructor(
    private readonly host: HTMLElement,
    private readonly events: StageEvents,
  ) {
    void this.init();
  }

  private async init(): Promise<void> {
    await this.app.init({
      // See-through: the page's own background shows around the land, in either theme.
      backgroundAlpha: 0,
      antialias: true,
      resizeTo: this.host,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }
    this.host.appendChild(this.app.canvas);
    this.world.addChild(this.land, this.roads, this.places, this.movers, this.highlight);
    this.highlight.eventMode = 'none';
    this.app.ticker.add((ticker) => this.animateHighlight(ticker.deltaMS));
    this.app.stage.addChild(this.world);
    this.panAndZoom();
    this.ready = true;
    if (this.view) this.setView(this.view);
    this.applyFocus();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.ready) this.app.destroy(true, { children: true, texture: true });
  }

  /** New map data: redraw what changed. */
  setView(view: MapView): void {
    this.view = view;
    if (!this.ready) return;
    const key = `${view.width}x${view.height}:${view.regions.map((r) => r.id).join()}`;
    if (key !== this.landKey) {
      this.landKey = key;
      this.drawLand(view);
      this.fitted = false;
    }
    this.drawRoads(view);
    this.drawPlaces(view);
    if (!this.fitted) this.fit(view);
    this.drawTravelers();
    if (this.focusChanged) this.applyFocus();
    else if (this.focus && this.tracking) this.centerOn(this.focus);
  }

  /**
   * Shows someone or somewhere: zooms in, centres the view on them and rings
   * them. A traveler stays in the middle as they move, until the user pans or
   * zooms. Null clears it.
   */
  setFocus(focus: StageFocus | null): void {
    const same =
      focus && this.focus && focus.kind === this.focus.kind && focus.id === this.focus.id;
    this.focus = focus;
    if (focus && !same) this.focusChanged = true;
    if (this.ready) this.applyFocus();
  }

  private applyFocus(): void {
    const focus = this.focus;
    if (!focus) {
      this.highlight.clear();
      return;
    }
    if (this.focusChanged && this.view) {
      this.focusChanged = false;
      this.tracking = true;
      const { width, height } = this.app.screen;
      const whole = Math.min(width / this.view.width, height / this.view.height);
      const scale = Math.min(80, Math.max(this.world.scale.x, FOCUS_SCALE, whole * FOCUS_ZOOM));
      this.world.scale.set(scale);
      this.fitted = true;
    }
    this.centerOn(focus);
  }

  /** Where the focus is on the map now, in leagues, if it is there at all. */
  private focusPoint(focus: StageFocus): { x: number; y: number } | null {
    if (focus.kind === 'traveler') {
      const dot = this.sprites.get(focus.id);
      return dot ? { x: dot.x, y: dot.y } : null;
    }
    const place = this.view?.places.find((p) => p.id === focus.id);
    return place ? { x: place.x, y: place.y } : null;
  }

  private centerOn(focus: StageFocus): void {
    const point = this.focusPoint(focus);
    if (!point) return;
    const { width, height } = this.app.screen;
    const scale = this.world.scale.x;
    this.world.position.set(width / 2 - point.x * scale, height / 2 - point.y * scale);
  }

  /** A slow pulse, or a still ring for those who ask for less motion. */
  private animateHighlight(deltaMS: number): void {
    const point = this.focus && this.focusPoint(this.focus);
    this.highlight.clear();
    if (!point) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pulse = (this.pulse + deltaMS / 1400) % 1;
    const wave = still ? 0.5 : this.pulse;
    // Sized in screen pixels, so the ring reads at any zoom.
    const unit = 1 / this.world.scale.x;
    this.highlight
      .circle(point.x, point.y, (14 + 16 * wave) * unit)
      .stroke({ width: 2.5 * unit, color: HIGHLIGHT, alpha: still ? 0.9 : 1 - wave })
      .circle(point.x, point.y, 10 * unit)
      .stroke({ width: 2 * unit, color: HIGHLIGHT, alpha: 0.95 });
  }

  /** The clock moved, or who is followed changed: move everyone along their roads. */
  setTime(time: number, following: ReadonlySet<CharacterId>): void {
    this.time = time;
    this.following = following;
    if (!this.ready) return;
    this.drawTravelers();
    if (this.focus && this.tracking) this.centerOn(this.focus);
  }

  private fit(view: MapView): void {
    const { width, height } = this.app.screen;
    if (width === 0 || view.width === 0) return;
    const scale = Math.min(width / view.width, height / view.height) * 0.96;
    this.world.scale.set(scale);
    this.world.position.set((width - view.width * scale) / 2, (height - view.height * scale) / 2);
    this.fitted = true;
  }

  /** Each league goes to the region whose heart is nearest: a coarse Voronoi map. */
  private drawLand(view: MapView): void {
    this.land.removeChildren().forEach((c) => c.destroy({ texture: true }));
    const w = Math.max(1, Math.round(view.width * TEXEL));
    const h = Math.max(1, Math.round(view.height * TEXEL));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d')!;
    const image = g.createImageData(w, h);
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const x = px / TEXEL;
        const y = py / TEXEL;
        let color = PLAIN_LAND;
        let best = Infinity;
        for (const r of view.regions) {
          const d = (r.x - x) ** 2 + (r.y - y) ** 2;
          if (d < best) {
            best = d;
            color = BIOME_COLORS[r.biome];
          }
        }
        const i = (py * w + px) * 4;
        image.data[i] = (color >> 16) & 0xff;
        image.data[i + 1] = (color >> 8) & 0xff;
        image.data[i + 2] = color & 0xff;
        image.data[i + 3] = 255;
      }
    }
    g.putImageData(image, 0, 0);
    const sprite = new Sprite(Texture.from(canvas));
    sprite.scale.set(1 / TEXEL);
    this.land.addChild(sprite);
    for (const r of view.regions) {
      const label = new Text({
        text: r.name,
        style: { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 28, fill: LABEL },
        resolution: 2,
      });
      label.alpha = 0.45;
      label.scale.set(1 / 20);
      label.anchor.set(0.5);
      label.position.set(r.x, r.y);
      // A land's name opens its page.
      label.eventMode = 'static';
      label.cursor = 'pointer';
      label.on('pointertap', () => this.events.onRegion(r.id));
      label.on('pointerover', () => {
        label.alpha = 0.8;
        this.events.onHover(`${r.name} · ${r.biome}`);
      });
      label.on('pointerout', () => {
        label.alpha = 0.45;
        this.events.onHover(null);
      });
      this.land.addChild(label);
    }
  }

  private drawRoads(view: MapView): void {
    const at = new Map(view.places.map((p) => [p.id, p]));
    this.roads.clear();
    for (const road of view.roads) {
      const a = at.get(road.a);
      const b = at.get(road.b);
      if (!a || !b) continue;
      this.roads.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    this.roads.stroke({ width: 0.25, color: ROAD, alpha: 0.75 });
  }

  private drawPlaces(view: MapView): void {
    this.places.removeChildren().forEach((c) => c.destroy());
    for (const place of view.places) {
      const mark = new Graphics();
      shape(mark, place);
      mark.position.set(place.x, place.y);
      mark.eventMode = 'static';
      mark.cursor = 'pointer';
      mark.on('pointertap', () => this.events.onPlace(place.id));
      mark.on('pointerover', () => this.events.onHover(describePlace(place)));
      mark.on('pointerout', () => this.events.onHover(null));
      this.places.addChild(mark);
      const label = new Text({
        text: `${place.article ? 'the ' : ''}${place.name}`,
        style: { fontFamily: 'Georgia, serif', fontSize: 22, fill: LABEL },
        resolution: 2,
      });
      label.scale.set(1 / 24);
      label.anchor.set(0, 0.5);
      label.position.set(place.x + 1.1, place.y);
      label.alpha = place.kind === 'town' || place.kind === 'fortress' ? 0.95 : 0.7;
      this.places.addChild(label);
    }
  }

  /** Everyone on the road, partway along their leg by the clock. */
  private drawTravelers(): void {
    const view = this.view;
    if (!view) return;
    const at = new Map(view.places.map((p) => [p.id, p]));
    const seen = new Set<CharacterId>();
    for (const t of view.travelers) {
      const from = at.get(t.from);
      const to = at.get(t.to);
      if (!from || !to) continue;
      seen.add(t.id);
      let dot = this.sprites.get(t.id);
      if (!dot) {
        dot = new Graphics();
        dot.eventMode = 'static';
        dot.cursor = 'pointer';
        dot.on('pointertap', () => this.events.onTraveler(t.id));
        dot.on('pointerover', () => this.events.onHover(describeTraveler(t)));
        dot.on('pointerout', () => this.events.onHover(null));
        this.movers.addChild(dot);
        this.sprites.set(t.id, dot);
      }
      const followed = this.following.has(t.id);
      dot.clear();
      const r = 0.45 + 0.12 * Math.min(4, t.party - 1);
      dot.circle(0, 0, r).fill(colorOf(t));
      if (followed) dot.circle(0, 0, r + 0.35).stroke({ width: 0.18, color: FOLLOWED });
      const span = Math.max(1, t.arrivesAt - t.departedAt);
      const f = Math.max(0, Math.min(1, (this.time - t.departedAt) / span));
      dot.position.set(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f);
    }
    for (const [id, dot] of this.sprites) {
      if (seen.has(id)) continue;
      dot.destroy();
      this.sprites.delete(id);
    }
  }

  /** Drag to pan; wheel to zoom about the pointer. */
  private panAndZoom(): void {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    let drag: { x: number; y: number } | null = null;
    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      drag = { x: e.global.x - this.world.x, y: e.global.y - this.world.y };
      this.tracking = false;
    });
    stage.on('pointermove', (e: FederatedPointerEvent) => {
      if (drag) this.world.position.set(e.global.x - drag.x, e.global.y - drag.y);
    });
    const stop = () => (drag = null);
    stage.on('pointerup', stop);
    stage.on('pointerupoutside', stop);
    this.app.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.tracking = false;
        const factor = Math.exp(-e.deltaY * 0.0015);
        const scale = Math.max(2, Math.min(80, this.world.scale.x * factor));
        const rect = this.app.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const wx = (px - this.world.x) / this.world.scale.x;
        const wy = (py - this.world.y) / this.world.scale.y;
        this.world.scale.set(scale);
        this.world.position.set(px - wx * scale, py - wy * scale);
      },
      { passive: false },
    );
  }
}

function shape(g: Graphics, place: MapPlace): void {
  switch (place.kind) {
    case 'town': {
      const r = 0.6 + Math.min(0.6, place.folk / 2000);
      g.circle(0, 0, r).fill(TOWN).stroke({ width: 0.12, color: 0x15171a });
      return;
    }
    case 'dungeon':
      g.poly([0, -0.8, 0.75, 0.55, -0.75, 0.55]).fill(DUNGEON);
      if (place.master) g.circle(0, -0.1, 1.25).stroke({ width: 0.15, color: DUNGEON });
      return;
    case 'fortress':
      g.rect(-0.6, -0.6, 1.2, 1.2).fill(FORTRESS).stroke({ width: 0.12, color: 0x15171a });
      return;
    case 'wilderness':
      g.poly([0, -0.55, 0.55, 0, 0, 0.55, -0.55, 0]).fill(WILD);
      if (place.roaming > 0) g.circle(0, 0, 0.95).stroke({ width: 0.12, color: DUNGEON });
  }
}

function colorOf(t: MapTraveler): number {
  if (t.outlaw) return TRAVELER.outlaw;
  if (t.calling === 'merchant') return TRAVELER.merchant;
  if (t.calling === 'adventurer') return TRAVELER.adventurer;
  return TRAVELER.other;
}

function describePlace(p: MapPlace): string {
  const name = `${p.article ? 'the ' : ''}${p.name}`;
  const parts = [name];
  if (p.kind === 'town') parts.push(`${p.folk.toLocaleString('en-US')} folk`);
  if (p.danger !== null) parts.push(`danger ${p.danger}`);
  if (p.master) parts.push(`lair of ${p.master}`);
  if (p.kind === 'fortress') parts.push(p.lord ? `held by ${p.lord}` : 'without a lord');
  if (p.garrison !== null) parts.push(`${p.garrison} soldiers`);
  if (p.roaming > 0) parts.push(`${p.roaming} creatures roaming`);
  return parts.join(' · ');
}

function describeTraveler(t: MapTraveler): string {
  const company = t.party > 1 ? ` and ${t.party - 1} more` : '';
  return `${t.name}${company} · ${t.outlaw ? 'outlaw' : t.calling}`;
}
