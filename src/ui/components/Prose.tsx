import type { CharacterId, LocationId } from '../../sim';
import type { Segment } from '../../text';

/** Which keys were held on a click: Ctrl or Cmd swaps what a character's link opens. */
export type LinkClick = Pick<MouseEvent, 'ctrlKey' | 'metaKey'>;

export interface ProseLinks {
  onCharacter?: (id: CharacterId, click?: LinkClick) => void;
  onLocation?: (id: LocationId, click?: LinkClick) => void;
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
    if ('mark' in segment) {
      return (
        <span key={i} className={`mark mark-${segment.mark}`}>
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
          data-character={ref.id}
          onClick={(e) => onCharacter(ref.id, e)}
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
          data-location={ref.id}
          onClick={(e) => onLocation(ref.id, e)}
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
