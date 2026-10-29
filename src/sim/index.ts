// Public entry point of the simulation core. The UI, host and tools import
// from here rather than reaching into subfolders.
export { createRng, restoreRng } from './core/rng';
export type { Rng, RngState } from './core/rng';
