import { useEffect, useRef, useState } from 'react';

import type { SavedGame } from '../../host';
import { formatDate } from '../../text';
import { exportSave, importSave } from '../files';
import { CHARACTER_COUNTS, randomSeed, shareLink, type WorldSpec } from '../seed';
import { deleteSave, listSaves, readSave, type SaveInfo } from '../storage';

/** Start a new world, save this one, or load or import another. */
export function WorldsDialog({
  current,
  onNew,
  onLoad,
  onSave,
  onClose,
}: {
  current: WorldSpec;
  onNew(spec: WorldSpec): void;
  onLoad(game: SavedGame): void;
  onSave(): Promise<void>;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [seed, setSeed] = useState(randomSeed);
  const [count, setCount] = useState<number>(current.characterCount);
  const [saves, setSaves] = useState<SaveInfo[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const refresh = () =>
    listSaves().then(setSaves, (e: unknown) => {
      setSaves([]);
      setMessage(`Saves are unavailable here: ${String(e)}`);
    });
  useEffect(() => {
    refresh();
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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
          Seed <code>{current.seed}</code>, {current.characterCount} adventurers. Anyone opening
          this link gets the same world from its beginning:
        </p>
        <div className="row">
          <input
            readOnly
            value={shareLink(current)}
            aria-label="Link to this world"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={() =>
              run(async () =>
                navigator.clipboard
                  .writeText(shareLink(current))
                  .then(() => setMessage('Link copied.')),
              )
            }
          >
            Copy
          </button>
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
        </div>
      </section>

      <section>
        <h3>A new world</h3>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (seed.trim()) onNew({ seed: seed.trim(), characterCount: count });
          }}
        >
          <label>
            Seed{' '}
            <input value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={64} required />
          </label>
          <button type="button" onClick={() => setSeed(randomSeed())} title="Pick a random seed">
            ⟳
          </button>
          <label>
            Adventurers{' '}
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {CHARACTER_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary">
            Begin
          </button>
        </form>
        <p className="muted">
          Large worlds run slower; 500 adventurers take about five minutes a decade.
        </p>
      </section>

      <section>
        <h3>Saved worlds</h3>
        {saves === null ? (
          <p className="muted">Looking…</p>
        ) : saves.length === 0 ? (
          <p className="muted">
            None yet. Worlds are saved as you watch, and when you press Save now.
          </p>
        ) : (
          <ul className="save-list">
            {saves.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  {s.auto && <span className="chip">autosave</span>}
                  <div className="muted">
                    {formatDate(s.time).split(' · ').slice(0, 2).join(' · ')} · {s.living} alive ·
                    saved {new Date(s.savedAt).toLocaleString()}
                  </div>
                </div>
                <div className="row">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const game = await readSave(s.id);
                        if (!game) throw new Error('That save has gone missing.');
                        onLoad(game);
                      })
                    }
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const game = await readSave(s.id);
                        if (!game) throw new Error('That save has gone missing.');
                        await exportSave(
                          game,
                          `ironside-dawn-${s.seed}-year-${formatDate(s.time).split(' ')[1]}`,
                        );
                      })
                    }
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await deleteSave(s.id);
                        await refresh();
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <label className="import">
          Import a save file{' '}
          <input
            type="file"
            accept=".json,.gz,application/json,application/gzip"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) run(async () => onLoad(await importSave(file)));
            }}
          />
        </label>
      </section>

      {message && (
        <p className="dialog-message" role="status">
          {message}
        </p>
      )}
    </dialog>
  );
}
