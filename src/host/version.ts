import { version } from '../../package.json';

/** This build's version (package.json), shown in the app and stamped into saves and links. */
export const APP_VERSION: string = version;

/**
 * The first release. Saves and links that don't say which version made their
 * world are from it: earlier test versions' saves can't be loaded anyway.
 */
export const FIRST_RELEASE = '0.1.0';

/**
 * The last release that changed how a world turns out from its seed. A link
 * made with it, or with any later version up to this one, replays the same
 * history here. Move it to the coming version whenever a change alters
 * history: `src/sim/history.test.ts` fails until it is moved.
 */
export const SAME_HISTORY_SINCE = '0.3.1';

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Versions released under one number and later renumbered. The release made
 * as 0.1.2 is 0.1.1 (no 0.1.1 had gone out), but saves and links from its
 * builds say 0.1.2; they are read as what the release is now called.
 */
const RENUMBERED: Readonly<Record<string, string>> = { '0.1.2': '0.1.1' };

/** A version as it is known now, for one read from a save or a link. */
export function currentName(version: string): string {
  return RENUMBERED[version] ?? version;
}

export function isVersion(text: string): boolean {
  return VERSION.test(text);
}

/** Orders two versions like `0.2.0`: negative if `a` is the earlier. */
export function compareVersions(a: string, b: string): number {
  const pa = VERSION.exec(a)?.slice(1).map(Number) ?? [0, 0, 0];
  const pb = VERSION.exec(b)?.slice(1).map(Number) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!;
  return 0;
}

/**
 * The version whose rules this build plays worlds by: its own, or, between
 * releases, the coming one, when a change to how worlds turn out has come in
 * ahead of its release. Worlds begun here are stamped with it, so their links
 * aren't mistaken for the last release's.
 */
export const HISTORY_VERSION =
  compareVersions(SAME_HISTORY_SINCE, APP_VERSION) > 0 ? SAME_HISTORY_SINCE : APP_VERSION;

/** Whether a world begun in `madeWith` follows the same history from its seed in this version. */
export function replaysHere(madeWith: string): boolean {
  return (
    compareVersions(madeWith, SAME_HISTORY_SINCE) >= 0 &&
    compareVersions(madeWith, HISTORY_VERSION) <= 0
  );
}
