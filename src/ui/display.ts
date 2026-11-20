import { useSyncExternalStore } from 'react';

/**
 * How the app is shown: choices made under Display settings, kept in this
 * browser and applied to the page as data attributes on <html>, which the
 * styles key on. More are added as the interface grows.
 */
export interface Display {
  /** The whole width of the window, with room for side columns, or the narrow column of 0.1. */
  readonly layout: 'wide' | 'compact';
  readonly textSize: 'small' | 'normal' | 'large';
  /** Colour for what things are about: deaths, wealth, dungeons, love, crime, magic. */
  readonly colours: 'on' | 'off';
}

export const DISPLAY_DEFAULTS: Display = { layout: 'wide', textSize: 'normal', colours: 'on' };

const CHOICES: { readonly [K in keyof Display]: readonly Display[K][] } = {
  layout: ['wide', 'compact'],
  textSize: ['small', 'normal', 'large'],
  colours: ['on', 'off'],
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
  root.dataset.layout = display.layout;
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

export function useDisplay(): Display {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
