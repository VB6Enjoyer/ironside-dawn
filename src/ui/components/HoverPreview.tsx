import { useEffect, useState } from 'react';

import type { SimHost } from '../../host';
import { ageOf, type CharacterId, type LocationId } from '../../sim';
import { describeActivity, peopleName, type NameResolver } from '../../text';
import { useDisplay } from '../display';
import { callingTitle, formatCount } from '../format';
import { placeName } from '../pages/PlacesPage';
import { MODIFIER } from './DisplaySettings';
import { useQuery } from '../useHost';
import { Prose } from './Prose';

/** How long the pointer rests on a name before its preview shows. */
const DELAY_MS = 450;
const WIDTH = 300;

interface Target {
  readonly kind: 'character' | 'location';
  readonly id: string;
  readonly rect: DOMRect;
  /** When it was shown, so each glance asks for the latest. */
  readonly at: number;
}

/**
 * A glance at whoever or wherever a name refers to, shown when the pointer
 * rests on a link (or a link takes the keyboard focus). Links say what they
 * name with `data-character` or `data-location`; one listener serves them all.
 */
export function HoverPreviews({ host, names }: { host: SimHost; names: NameResolver }) {
  const { previews } = useDisplay();
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (previews === 'off') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Element | null = null;
    const linkOf = (node: EventTarget | null) =>
      node instanceof Element ? node.closest('[data-character], [data-location]') : null;
    const hide = () => {
      clearTimeout(timer);
      current = null;
      setTarget(null);
    };
    const show = (link: Element) => {
      clearTimeout(timer);
      current = link;
      timer = setTimeout(() => {
        const kind = link.hasAttribute('data-character') ? 'character' : 'location';
        setTarget({
          kind,
          id: link.getAttribute(`data-${kind}`)!,
          rect: link.getBoundingClientRect(),
          at: Date.now(),
        });
      }, DELAY_MS);
    };
    const onOver = (event: PointerEvent) => {
      // A tap is a click on a touch screen; there is nothing to hover.
      if (event.pointerType === 'touch') return;
      const link = linkOf(event.target);
      if (link === current) return;
      if (link) show(link);
      else hide();
    };
    const onFocus = (event: FocusEvent) => {
      const link = linkOf(event.target);
      if (link) show(link);
    };
    // A shown preview would be left behind by a scroll; one still to come
    // measures where its name is when it shows. (The log scrolls by itself.)
    const onScroll = () => setTarget(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      setTarget(null);
    };
  }, [previews]);

  if (!target || previews === 'off') return null;
  // Below the name if it fits, otherwise above it.
  const below = target.rect.bottom + 180 < window.innerHeight;
  const style = {
    left: Math.max(8, Math.min(target.rect.left, window.innerWidth - WIDTH - 8)),
    ...(below
      ? { top: target.rect.bottom + 6 }
      : { bottom: window.innerHeight - target.rect.top + 6 }),
    width: WIDTH,
  };
  return (
    <div className="hover-preview" style={style} role="tooltip">
      {target.kind === 'character' ? (
        <CharacterGlance host={host} names={names} id={target.id as CharacterId} at={target.at} />
      ) : (
        <PlaceGlance host={host} id={target.id as LocationId} at={target.at} />
      )}
    </div>
  );
}

function CharacterGlance({
  host,
  names,
  id,
  at,
}: {
  host: SimHost;
  names: NameResolver;
  id: CharacterId;
  at: number;
}) {
  const { characterClick } = useDisplay();
  const c = useQuery(host, { kind: 'peek', id }, at);
  if (!c) return <p className="muted">{c === null ? 'Nobody by that name.' : 'Looking…'}</p>;
  const home = names.location(c.homeId);
  const dead = c.death !== null;
  const opens = (page: boolean) => (page ? 'their life story' : 'their card');
  return (
    <>
      <p className="glance-name">
        {c.givenName} {c.familyName}
        {dead && <span className="muted"> †</span>}
      </p>
      <p className="glance-sub">
        {callingTitle(c)} · {peopleName(c.species, c.culture).singular} of {home?.name ?? 'nowhere'}{' '}
        · aged {ageOf(c, c.death?.at ?? host.getSnapshot().time)}
      </p>
      <p className="glance-line">
        <Prose segments={describeActivity(c, names)} />
      </p>
      {!dead && (
        <div className="glance-bar" aria-label={`Health ${c.hp} of ${c.maxHp}`}>
          <span style={{ width: `${Math.max(0, Math.min(100, (100 * c.hp) / c.maxHp))}%` }} />
        </div>
      )}
      <p className="glance-hint">
        Click for {opens(characterClick === 'page')} · {MODIFIER}+click for{' '}
        {opens(characterClick !== 'page')}
      </p>
    </>
  );
}

function PlaceGlance({ host, id, at }: { host: SimHost; id: LocationId; at: number }) {
  const place = host.places.get(id);
  const summaries = useQuery(host, { kind: 'places' }, at);
  const summary = summaries?.find((s) => s.id === id);
  if (!place) return <p className="muted">Nowhere by that name.</p>;
  const facts = summary
    ? [
        `${formatCount(summary.present)} here`,
        ...(summary.creatures !== null ? [`${formatCount(summary.creatures)} creatures`] : []),
        ...(summary.fallen > 0 ? [`${formatCount(summary.fallen)} fallen`] : []),
      ]
    : [];
  return (
    <>
      <p className="glance-name glance-place">{capitalFirst(placeName(place))}</p>
      <p className="glance-sub">
        {capitalFirst(place.kind)}
        {summary?.region && ` in ${summary.region.name}, ${summary.region.biome}`}
      </p>
      {facts.length > 0 && <p className="glance-line">{facts.join(' · ')}</p>}
      <p className="glance-hint">Click for its page</p>
    </>
  );
}

const capitalFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
