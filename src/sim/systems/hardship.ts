import type { World } from '../model';

/**
 * The world's hardship (0.4.0, step 9), as a multiplier on how often
 * sickness, plague and curses strike: gentle halves them, harsh brings more.
 */
const HARDSHIP = { gentle: 0.5, normal: 1, harsh: 1.6 } as const;

export function hardshipOf(world: World): number {
  return HARDSHIP[world.settings.hardship ?? 'normal'];
}
