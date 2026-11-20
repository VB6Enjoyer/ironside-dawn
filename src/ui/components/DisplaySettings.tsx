import { useEffect, useRef } from 'react';

import { setDisplay, useDisplay, type Display } from '../display';

/** One choice, as a row of buttons of which one is pressed. */
function Choice<K extends keyof Display>({
  name,
  setting,
  options,
  hint,
}: {
  name: string;
  setting: K;
  options: readonly { value: Display[K]; label: string }[];
  hint?: string;
}) {
  const display = useDisplay();
  return (
    <div className="setting">
      <span className="setting-name" id={`setting-${setting}`}>
        {name}
      </span>
      <div className="segmented" role="group" aria-labelledby={`setting-${setting}`}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={display[setting] === o.value}
            className={display[setting] === o.value ? 'active' : undefined}
            onClick={() => setDisplay({ [setting]: o.value } as Partial<Display>)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {hint && <p className="setting-hint">{hint}</p>}
    </div>
  );
}

/** How the app is shown, kept in this browser. Changes apply at once. */
export function DisplaySettings({ onClose }: { onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="worlds-dialog display-settings"
      onClose={onClose}
      aria-labelledby="display-title"
    >
      <header>
        <h2 id="display-title">Display</h2>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <p className="muted">Kept in this browser. Changes apply at once.</p>
      <Choice
        name="Layout"
        setting="layout"
        options={[
          { value: 'wide', label: 'Full width' },
          { value: 'compact', label: 'Compact' },
        ]}
        hint="Full width uses the whole window, with side columns on wide screens. Compact keeps everything in one narrow column."
      />
      <Choice
        name="Text size"
        setting="textSize"
        options={[
          { value: 'small', label: 'Small' },
          { value: 'normal', label: 'Normal' },
          { value: 'large', label: 'Large' },
        ]}
      />
      <Choice
        name="Colour cues"
        setting="colours"
        options={[
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
        hint="Colour for what things are about: red for deaths and kills, gold for wealth, purple for dungeons, pink for love, orange for crime, blue for magic."
      />
    </dialog>
  );
}
