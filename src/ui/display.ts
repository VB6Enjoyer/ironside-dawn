import { useSyncExternalStore } from 'react';

/**
 * How the app is shown: choices made under Display settings, kept in this
 * browser and applied to the page as data attributes on <html>, which the
 * styles key on. More are added as the interface grows.
 */
export interface Display {
  /** Dark (the default) or light. */
  readonly theme: 'dark' | 'light';
  /** The whole width of the window, with room for side columns, or the narrow column of 0.1. */
  readonly layout: 'wide' | 'compact';
  readonly textSize: 'small' | 'normal' | 'large';
  /** Colour for what things are about: deaths, wealth, dungeons, love, crime, magic. */
  readonly colours: 'on' | 'off';
  /**
   * What a plain click on a character's or place's name opens: its card, or
   * its page. Ctrl+click (Cmd+click on a Mac) opens the other. (Named for
   * characters, which had cards first; kept so saved choices still apply.)
   */
  readonly characterClick: 'card' | 'page';
  /** A glance at whoever or wherever a name refers to, when the pointer rests on it. */
  readonly previews: 'on' | 'off';
}

export const DISPLAY_DEFAULTS: Display = {
  theme: 'dark',
  layout: 'wide',
  textSize: 'normal',
  colours: 'on',
  characterClick: 'card',
  previews: 'on',
};

const CHOICES: { readonly [K in keyof Display]: readonly Display[K][] } = {
  theme: ['dark', 'light'],
  layout: ['wide', 'compact'],
  textSize: ['small', 'normal', 'large'],
  colours: ['on', 'off'],
  characterClick: ['card', 'page'],
  previews: ['on', 'off'],
};

const KEY = 'ironside-dawn/display';

/** What was chosen before, keeping only choices this version knows. */
function load(): Display {
  let saved: Partial<Record<string, unknown>> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<string, unknown>>;
  } catch {
    // Unreadable or no storage: the defaults.
  }
  const display: Record<string, unknown> = { ...DISPLAY_DEFAULTS };
  for (const [key, allowed] of Object.entries(CHOICES)) {
    if ((allowed as readonly unknown[]).includes(saved[key])) display[key] = saved[key];
  }
  return display as unknown as Display;
}

let current: Display = load();
const listeners = new Set<() => void>();

function apply(display: Display): void {
  const root = document.documentElement;
  root.dataset.theme = display.theme;
  root.dataset.layout = display.layout;
  // The browser's own parts (scrollbars, form controls) and the window's colour follow.
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', display.theme);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', display.theme === 'light' ? '#f3efe6' : '#15171a');
  root.dataset.textSize = display.textSize;
  root.dataset.colours = display.colours;
}

/** Applies the saved choices to the page; call before the first render. */
export function applyDisplay(): void {
  apply(current);
}

export function setDisplay(change: Partial<Display>): void {
  current = { ...current, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Applied for now, if not remembered.
  }
  apply(current);
  for (const listener of listeners) listener();
}

/** The choices as they stand, for code outside React's rendering (event handlers). */
export function currentDisplay(): Display {
  return current;
}

export function useDisplay(): Display {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
