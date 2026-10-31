import type { CharacterId } from '../../sim';
import type { Segment } from '../../text';

/** Renders prose segments, turning character names into buttons that open their card. */
export function Prose({
  segments,
  onCharacter,
}: {
  segments: readonly Segment[];
  onCharacter?: (id: CharacterId) => void;
}) {
  return segments.map((segment, i) => {
    if ('aside' in segment) {
      return (
        <span key={i} className="aside">
          {segment.text}
        </span>
      );
    }
    if (!('ref' in segment)) return segment.text;
    if (segment.ref.kind === 'character' && onCharacter) {
      const id = segment.ref.id;
      return (
        <button key={i} type="button" className="ref ref-character" onClick={() => onCharacter(id)}>
          {segment.text}
        </button>
      );
    }
    return (
      <span key={i} className={`ref ref-${segment.ref.kind}`}>
        {segment.text}
      </span>
    );
  });
}
