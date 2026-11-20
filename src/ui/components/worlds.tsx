import { useCallback, useEffect, useState } from 'react';

import { currentName, FIRST_RELEASE, type SavedGame } from '../../host';
import { PEOPLES, type PeopleId } from '../../content';
import type { WorldSettings } from '../../sim';
import { formatDate, SPECIES_NAMES } from '../../text';
import { exportSave, importSave } from '../files';
import { addPack, availablePacks, BUNDLED_PACKS, removePack } from '../packs';
import {
  CHARACTER_COUNTS,
  DEFAULT_CHARACTER_COUNT,
  randomSeed,
  shareLink,
  specOfSave,
  withHumans,
  type WorldSpec,
} from '../seed';
import { deleteSave, listSaves, readSave, type SaveInfo } from '../storage';

/**
 * The parts for starting and keeping worlds, shared by the main menu and the
 * Worlds dialog: a form for a new world, and the saved worlds with their
 * loading, exporting and importing.
 */

/** Running actions one at a time, with a line to say how they went. */
export function useActions() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, message, setMessage, run };
}

export type Actions = ReturnType<typeof useActions>;

/** The saves kept in this browser, newest first, and a way to ask again. */
export function useSaves(actions: Actions) {
  const [saves, setSaves] = useState<SaveInfo[] | null>(null);
  const { setMessage } = actions;
  const refresh = useCallback(
    () =>
      listSaves().then(setSaves, (e: unknown) => {
        setSaves([]);
        setMessage(`Saves are unavailable here: ${String(e)}`);
      }),
    [setMessage],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { saves, refresh };
}

/** A new world: its seed (a random one to start with), adventurers, settings and packs. */
export function NewWorldForm({
  initial,
  onNew,
  actions,
}: {
  /** The world whose choices the form starts from, if any. */
  initial?: WorldSpec;
  onNew(spec: WorldSpec): void;
  actions: Actions;
}) {
  const { run, setMessage } = actions;
  const start = initial?.settings ?? {};
  const [seed, setSeed] = useState(randomSeed);
  const [count, setCount] = useState<number>(initial?.characterCount ?? DEFAULT_CHARACTER_COUNT);
  const [size, setSize] = useState<WorldSettings['size'] | 'auto'>(start.size ?? 'auto');
  const [danger, setDanger] = useState<WorldSettings['danger']>(start.danger ?? 'normal');
  const [magic, setMagic] = useState<WorldSettings['magic']>(start.magic ?? 'normal');
  const [peoples, setPeoples] = useState<readonly PeopleId[]>(start.peoples ?? PEOPLES);
  const [cap, setCap] = useState<string>(start.populationCap ? String(start.populationCap) : '');
  const [packs, setPacks] = useState<readonly string[]>(initial?.packs ?? []);
  const [known, setKnown] = useState(availablePacks);
  const settings = (): Partial<WorldSettings> => ({
    ...(size !== 'auto' ? { size } : {}),
    danger,
    magic,
    peoples: withHumans(peoples),
    populationCap: Number(cap) > 0 ? Math.round(Number(cap)) : null,
  });

  return (
    <>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (seed.trim())
            onNew({
              seed: seed.trim(),
              characterCount: count,
              settings: settings(),
              packs: packs.filter((id) => known.some((p) => p.id === id)),
            });
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
        <details className="world-settings">
          <summary>Settings</summary>
          <div className="settings-grid">
            <label>
              Size{' '}
              <select value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
                <option value="auto">to suit the adventurers</option>
                <option value="small">small</option>
                <option value="medium">medium</option>
                <option value="large">large</option>
              </select>
            </label>
            <label>
              Danger{' '}
              <select value={danger} onChange={(e) => setDanger(e.target.value as typeof danger)}>
                <option value="gentle">gentle</option>
                <option value="normal">normal</option>
                <option value="deadly">deadly</option>
              </select>
            </label>
            <label>
              Magic{' '}
              <select value={magic} onChange={(e) => setMagic(e.target.value as typeof magic)}>
                <option value="rare">rare</option>
                <option value="normal">normal</option>
                <option value="common">common</option>
              </select>
            </label>
            <label>
              Most alive at once{' '}
              <input
                type="number"
                min={10}
                step={10}
                placeholder="no limit"
                value={cap}
                onChange={(e) => setCap(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Peoples</legend>
              {PEOPLES.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={p === 'human' || peoples.includes(p)}
                    disabled={p === 'human'}
                    onChange={(e) =>
                      setPeoples(
                        e.target.checked ? [...peoples, p] : peoples.filter((q) => q !== p),
                      )
                    }
                  />{' '}
                  {SPECIES_NAMES[p].plural}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Content packs</legend>
              {known.map((pack) => (
                <span key={pack.id} className="pack">
                  <label title={pack.description ?? undefined}>
                    <input
                      type="checkbox"
                      checked={packs.includes(pack.id)}
                      onChange={(e) =>
                        setPacks(
                          e.target.checked
                            ? [...packs, pack.id]
                            : packs.filter((id) => id !== pack.id),
                        )
                      }
                    />{' '}
                    {pack.name}
                  </label>
                  {!BUNDLED_PACKS.includes(pack) && (
                    <button
                      type="button"
                      className="link-button"
                      aria-label={`Forget ${pack.name}`}
                      onClick={() => {
                        removePack(pack.id);
                        setPacks(packs.filter((id) => id !== pack.id));
                        setKnown(availablePacks());
                      }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              ))}
              <label className="import">
                Add a pack{' '}
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file)
                      run(async () => {
                        const pack = addPack(await file.text());
                        setKnown(availablePacks());
                        setPacks((ids) => (ids.includes(pack.id) ? ids : [...ids, pack.id]));
                        setMessage(`Added ${pack.name}.`);
                      });
                  }}
                />
              </label>
            </fieldset>
          </div>
        </details>
      </form>
      <p className="muted">
        Large worlds run slower; 500 adventurers take about five minutes a decade.
      </p>
    </>
  );
}

/** The saved worlds: load, copy a link, export or delete each; import a save file. */
export function SavedWorlds({
  saves,
  refresh,
  onLoad,
  actions,
}: {
  saves: SaveInfo[] | null;
  refresh(): Promise<void>;
  onLoad(game: SavedGame): void;
  actions: Actions;
}) {
  const { busy, run, setMessage } = actions;
  // Links need a web address to point to; the desktop app may have none.
  const canLink = shareLink({ seed: 'x', characterCount: 1, settings: {}, packs: [] }) !== null;
  return (
    <>
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
                  saved {new Date(s.savedAt).toLocaleString()} · begun in version{' '}
                  {currentName(s.madeWith ?? FIRST_RELEASE)}
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
                {canLink && (
                  <button
                    type="button"
                    disabled={busy}
                    title="Copy a link that begins this world again, stamped with the version it was begun in"
                    onClick={() =>
                      run(async () => {
                        const game = await readSave(s.id);
                        if (!game) throw new Error('That save has gone missing.');
                        await navigator.clipboard.writeText(shareLink(specOfSave(game))!);
                        setMessage(
                          `Link to ${s.name} copied, for version ${game.madeWith ?? FIRST_RELEASE}.`,
                        );
                      })
                    }
                  >
                    Copy link
                  </button>
                )}
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
    </>
  );
}
