import { useEffect, useState } from 'react';

import type { SearchView, SimHost } from '../../host';
import type { CharacterId, LocationId } from '../../sim';
import { SPECIES_NAMES } from '../../text';
import { placeName } from '../pages/PlacesPage';

/** Find anyone who ever lived, or any place, by name. */
export function SearchBox({
  host,
  onCharacter,
  onLocation,
}: {
  host: SimHost;
  onCharacter(id: CharacterId): void;
  onLocation(id: LocationId): void;
}) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<SearchView | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (text.trim().length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      host.request({ kind: 'search', text }).then(
        (found) => current && setResults(found),
        () => undefined,
      );
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [host, text]);

  const shown = text.trim().length >= 2 ? results : null;
  const close = () => {
    setOpen(false);
    setText('');
    setResults(null);
  };

  return (
    <div
      className="search"
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
    >
      <input
        type="search"
        placeholder="Find someone or somewhere…"
        aria-label="Search by name"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      />
      {open && shown && (
        <ul className="search-results" role="listbox">
          {shown.places.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onLocation(p.id);
                  close();
                }}
              >
                {placeName(p)} <span className="muted">· {p.kind}</span>
              </button>
            </li>
          ))}
          {shown.characters.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={c.dead ? 'ref-dead' : undefined}
                onClick={() => {
                  onCharacter(c.id);
                  close();
                }}
              >
                {c.name}{' '}
                <span className="muted">
                  · level {c.level} {SPECIES_NAMES[c.species].singular}
                  {c.dead ? ', dead' : c.outlaw ? ', outlaw' : ''}
                </span>
              </button>
            </li>
          ))}
          {shown.places.length === 0 && shown.characters.length === 0 && (
            <li className="muted search-none">No one by that name.</li>
          )}
        </ul>
      )}
    </div>
  );
}
