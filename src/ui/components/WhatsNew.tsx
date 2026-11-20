import { useEffect, useRef } from 'react';

import { RELEASES, type Release } from '../releases';

/** The public release notes: this version's in full, earlier ones folded away. */
export function WhatsNew({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const [latest, ...earlier] = RELEASES;

  return (
    <dialog
      ref={ref}
      className="worlds-dialog whats-new"
      onClose={onClose}
      aria-labelledby="whats-new-title"
    >
      <header>
        <h2 id="whats-new-title">What’s new</h2>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      {latest && <Notes release={latest} />}
      {earlier.length > 0 && (
        <section>
          <h3>Earlier versions</h3>
          {earlier.map((release) => (
            <details key={release.version}>
              <summary>
                {release.version} · {release.title}
              </summary>
              <Notes release={release} heading={false} />
            </details>
          ))}
        </section>
      )}
      <form method="dialog" className="whats-new-actions">
        <button type="submit" className="primary">
          On with the world
        </button>
      </form>
    </dialog>
  );
}

function Notes({ release, heading = true }: { release: Release; heading?: boolean }) {
  const date = new Date(`${release.date}T12:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <article className="release">
      {heading && (
        <p className="release-heading">
          <strong>{release.title}</strong>
          <span className="muted">
            Version {release.version} · {date}
          </span>
        </p>
      )}
      <p>{release.intro}</p>
      <ul>
        {release.changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
      {!heading && <p className="muted">{date}</p>}
    </article>
  );
}
