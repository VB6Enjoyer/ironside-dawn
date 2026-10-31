import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { isDigest, type LogEntry } from '../../host';
import type { CharacterId } from '../../sim';
import { describeEvent, formatTimestamp, type NameResolver } from '../../text';
import { formatCount } from '../format';
import { Prose, type ProseLinks } from './Prose';

/** How close to the bottom still counts as "following the latest events". */
const PIN_THRESHOLD_PX = 48;

interface Props extends ProseLinks {
  log: readonly LogEntry[];
  names: NameResolver;
  /** Rows involving this character are highlighted. */
  selected: CharacterId | null;
  /** Shown when the log is empty. */
  empty?: string;
}

export function EventLog({ log, names, selected, empty, onCharacter, onLocation }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  // Set by the user's own input. Scroll events without it come from layout
  // changes (the card opening, rows re-wrapping) and must not unpin the log.
  const userScrolling = useRef(false);

  // TanStack Virtual can't be auto-memoized by the React Compiler; this
  // component doesn't rely on memoization, so that's fine.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: log.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 12,
    getItemKey: (index) => log[index]?.id ?? index,
  });

  useLayoutEffect(() => {
    if (pinned && log.length > 0) virtualizer.scrollToIndex(log.length - 1, { align: 'end' });
  }, [log, pinned, virtualizer]);

  // Stay at the bottom when the panel changes size while pinned.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinned) return;
    const observer = new ResizeObserver(() => {
      if (log.length > 0) virtualizer.scrollToIndex(log.length - 1, { align: 'end' });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [log.length, pinned, virtualizer]);

  const markUserScroll = () => {
    userScrolling.current = true;
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || !userScrolling.current) return;
    userScrolling.current = false;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX);
  };

  return (
    <section className="log-panel" aria-label="World chronicle">
      <div
        ref={scrollRef}
        className="log-scroll"
        onScroll={onScroll}
        onWheel={markUserScroll}
        onTouchMove={markUserScroll}
        onPointerDown={(e) => {
          // Only the scrollbar itself; clicking a name in a row isn't scrolling.
          if (e.target === e.currentTarget) markUserScroll();
        }}
        onKeyDown={markUserScroll}
        tabIndex={0}
      >
        {log.length === 0 ? (
          <p className="log-empty">
            {empty ?? 'Nothing worth noting yet at this level of detail.'}
          </p>
        ) : (
          <ol className="log-list" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const event = log[item.index]!;
              if (isDigest(event)) {
                return (
                  <li
                    key={item.key}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    className="log-row log-digest"
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <time className="log-time">{formatTimestamp(event.t)}</time>
                    <span className="log-text">
                      …and {formatCount(event.count)} minor{' '}
                      {event.count === 1 ? 'happening' : 'happenings'} across the realm.
                    </span>
                  </li>
                );
              }
              return (
                <li
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className={`log-row importance-${event.importance}${
                    selected && event.actors.includes(selected) ? ' log-row-selected' : ''
                  }`}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <time className="log-time">{formatTimestamp(event.t)}</time>
                  <span className="log-text">
                    <Prose
                      segments={describeEvent(event, names)}
                      onCharacter={onCharacter}
                      onLocation={onLocation}
                    />
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {!pinned && (
        <button type="button" className="jump-latest" onClick={() => setPinned(true)}>
          ↓ Latest
        </button>
      )}
    </section>
  );
}
