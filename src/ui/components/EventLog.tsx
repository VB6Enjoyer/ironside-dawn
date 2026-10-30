import { useVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState } from 'react';

import type { SimEvent } from '../../sim';
import { describeEvent, formatTimestamp, type NameResolver } from '../../text';

/** How close to the bottom still counts as "following the latest events". */
const PIN_THRESHOLD_PX = 48;

export function EventLog({ log, names }: { log: readonly SimEvent[]; names: NameResolver }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

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

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX);
  };

  return (
    <section className="log-panel" aria-label="World chronicle">
      <div ref={scrollRef} className="log-scroll" onScroll={onScroll}>
        {log.length === 0 ? (
          <p className="log-empty">Nothing worth noting yet at this level of detail.</p>
        ) : (
          <ol className="log-list" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const event = log[item.index]!;
              return (
                <li
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className={`log-row importance-${event.importance}`}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <time className="log-time">{formatTimestamp(event.t)}</time>
                  <span className="log-text">
                    {describeEvent(event, names).map((segment, i) =>
                      'ref' in segment ? (
                        <span key={i} className={`ref ref-${segment.ref.kind}`}>
                          {segment.text}
                        </span>
                      ) : (
                        segment.text
                      ),
                    )}
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
