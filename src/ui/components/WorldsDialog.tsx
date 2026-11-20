import { useEffect, useRef } from 'react';

import { FIRST_RELEASE, type SavedGame } from '../../host';
import { shareLink, type WorldSpec } from '../seed';
import { NewWorldForm, SavedWorlds, useActions, useSaves } from './worlds';

/** In a world: share or save it, start a new one, load or import another, or go to the menu. */
export function WorldsDialog({
  current,
  onNew,
  onLoad,
  onSave,
  onMenu,
  onClose,
}: {
  current: WorldSpec;
  onNew(spec: WorldSpec): void;
  onLoad(game: SavedGame): void;
  onSave(): Promise<void>;
  /** Leaves this world for the main menu. */
  onMenu(): void;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const actions = useActions();
  const { busy, message, setMessage, run } = actions;
  const { saves, refresh } = useSaves(actions);
  const link = shareLink(current);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} className="worlds-dialog" onClose={onClose} aria-labelledby="worlds-title">
      <header>
        <h2 id="worlds-title">Worlds</h2>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <section>
        <h3>This world</h3>
        <p className="muted">
          Seed <code>{current.seed}</code>, {current.characterCount} adventurers, begun in version{' '}
          {current.madeWith ?? FIRST_RELEASE}.{' '}
          {link
            ? 'Anyone opening this link gets the same world from its beginning:'
            : 'A world begun with the same seed and settings is the same world.'}
        </p>
        <div className="row">
          {link && (
            <>
              <input
                readOnly
                value={link}
                aria-label="Link to this world"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={() =>
                  run(async () =>
                    navigator.clipboard.writeText(link).then(() => setMessage('Link copied.')),
                  )
                }
              >
                Copy
              </button>
            </>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await onSave();
                setMessage('Saved.');
                await refresh();
              })
            }
          >
            Save now
          </button>
          <button type="button" onClick={onMenu} title="Save this world and go to the main menu">
            Main menu
          </button>
        </div>
      </section>

      <section>
        <h3>A new world</h3>
        <NewWorldForm initial={current} onNew={onNew} actions={actions} />
      </section>

      <section>
        <h3>Saved worlds</h3>
        <SavedWorlds saves={saves} refresh={refresh} onLoad={onLoad} actions={actions} />
      </section>

      {message && (
        <p className="dialog-message" role="status">
          {message}
        </p>
      )}
    </dialog>
  );
}
