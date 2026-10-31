import type { FastForwardDigest } from '../../host';
import type { WorldSample } from '../../sim';
import { describeEvent, formatDate, formatTimestamp, type NameResolver } from '../../text';
import { formatCount } from '../format';
import { Prose, type ProseLinks } from './Prose';

const YEAR = 360 * 86_400;
const day = (t: number) => formatDate(t).split(' · ').slice(0, 2).join(' · ');
const total = (r: Partial<Record<string, number>>) =>
  Object.values(r).reduce<number>((a, n) => a + (n ?? 0), 0);
const living = (s: WorldSample) => total(s.population);

/** What happened while the world was skipped ahead. */
export function DigestPanel({
  digest,
  names,
  onClose,
  onChronicle,
  ...links
}: {
  digest: FastForwardDigest;
  names: NameResolver;
  onClose(): void;
  onChronicle(): void;
} & ProseLinks) {
  const { before, after, counts } = digest;
  const years = (digest.to - digest.from) / YEAR;
  const span =
    years >= 1.95
      ? `${Math.round(years)} years`
      : years >= 0.95
        ? 'A year'
        : `${Math.round(years * 4)} seasons`;
  const deaths = total(after.deaths) - total(before.deaths);
  const facts: [string, string][] = [
    ['Adventurers', `${formatCount(living(before))} → ${formatCount(living(after))}`],
    ['Newcomers', formatCount(counts['character.introduced'] ?? 0)],
    ['Deaths', formatCount(deaths)],
    ['Average level', `${before.meanLevel} → ${after.meanLevel}`],
    ['Highest level', `${before.maxLevel} → ${after.maxLevel}`],
    ['Delves', formatCount(counts['delve.enter'] ?? 0)],
    ['Legendary finds', formatCount(after.legendsFound - before.legendsFound)],
    ['Friendships made', formatCount(counts['social.friend'] ?? 0)],
    ['Robberies', formatCount(after.robberies - before.robberies)],
    ['Murders', formatCount(after.murders - before.murders)],
    ['Bounties claimed', formatCount(after.bountiesClaimed - before.bountiesClaimed)],
  ];

  return (
    <div className="digest-backdrop" role="presentation" onClick={onClose}>
      <section
        className="digest"
        role="dialog"
        aria-modal="true"
        aria-labelledby="digest-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <header>
          <h2 id="digest-title">
            {digest.cancelled ? `Stopped after ${span.toLowerCase()}` : `${span} passed`}
          </h2>
          <p className="muted">
            {day(digest.from)} to {day(digest.to)}
          </p>
        </header>
        <dl className="digest-facts">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {digest.highlights.length > 0 && (
          <>
            <h3>What will be remembered</h3>
            <ol className="card-recent digest-highlights">
              {digest.highlights.map((event) => (
                <li key={event.id}>
                  <time>{formatTimestamp(event.t)}</time>
                  <span>
                    <Prose segments={describeEvent(event, names)} {...links} />
                  </span>
                </li>
              ))}
            </ol>
            {digest.moreHighlights > 0 && (
              <p className="muted">
                …and {formatCount(digest.moreHighlights)} more in the chronicle.
              </p>
            )}
          </>
        )}
        <footer>
          <button type="button" onClick={onChronicle}>
            Read the chronicle
          </button>
          <button type="button" className="primary" onClick={onClose} autoFocus>
            Carry on
          </button>
        </footer>
      </section>
    </div>
  );
}
