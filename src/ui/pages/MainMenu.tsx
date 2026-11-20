import type { SavedGame } from '../../host';
import { formatDate } from '../../text';
import { NewWorldForm, SavedWorlds, useActions, useSaves } from '../components/worlds';
import type { WorldSpec } from '../seed';
import { readSave } from '../storage';

/**
 * What the bare address opens to: begin a new world, carry on with the one
 * last watched, or load, export or import a saved one.
 */
export function MainMenu({
  onNew,
  onLoad,
}: {
  onNew(spec: WorldSpec): void;
  onLoad(game: SavedGame): void;
}) {
  const actions = useActions();
  const { busy, message, run } = actions;
  const { saves, refresh } = useSaves(actions);
  const latest = saves?.[0];

  return (
    <main className="main-menu">
      <p className="menu-intro">
        A fantasy world, made from a seed, that lives its own history while you watch. Begin a new
        one, or carry on with a world you have watched before.
      </p>

      {latest && (
        <section className="menu-continue">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const game = await readSave(latest.id);
                if (!game) throw new Error('That save has gone missing.');
                onLoad(game);
              })
            }
          >
            Continue {latest.name}
          </button>
          <span className="muted">
            {formatDate(latest.time).split(' · ').slice(0, 2).join(' · ')} · {latest.living} alive
          </span>
        </section>
      )}

      <div className="menu-panels">
        <section className="menu-panel" aria-labelledby="menu-new">
          <h2 id="menu-new">A new world</h2>
          <NewWorldForm onNew={onNew} actions={actions} />
        </section>
        <section className="menu-panel" aria-labelledby="menu-saved">
          <h2 id="menu-saved">Saved worlds</h2>
          <SavedWorlds saves={saves} refresh={refresh} onLoad={onLoad} actions={actions} />
        </section>
      </div>

      {message && (
        <p className="dialog-message" role="status">
          {message}
        </p>
      )}
    </main>
  );
}
