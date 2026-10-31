import type { CharacterId, LocationId } from '../../sim';
import type { Segment } from '../../text';

export interface ProseLinks {
  onCharacter?: (id: CharacterId) => void;
  onLocation?: (id: LocationId) => void;
}

/** Renders prose segments, turning names into buttons that open their card or page. */
export function Prose({
  segments,
  onCharacter,
  onLocation,
}: { segments: readonly Segment[] } & ProseLinks) {
  return segments.map((segment, i) => {
    if ('aside' in segment) {
      return (
        <span key={i} className="aside">
          {segment.text}
        </span>
      );
    }
    if (!('ref' in segment)) return segment.text;
    const ref = segment.ref;
    if (ref.kind === 'character' && onCharacter) {
      return (
        <button
          key={i}
          type="button"
          className="ref ref-character"
          onClick={() => onCharacter(ref.id)}
        >
          {segment.text}
        </button>
      );
    }
    if (ref.kind === 'location' && onLocation) {
      return (
        <button
          key={i}
          type="button"
          className="ref ref-location"
          onClick={() => onLocation(ref.id)}
        >
          {segment.text}
        </button>
      );
    }
    return (
      <span key={i} className={`ref ref-${ref.kind}`}>
        {segment.text}
      </span>
    );
  });
}
