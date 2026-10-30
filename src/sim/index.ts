// Public entry point of the simulation core. The UI, host and tools import
// from here rather than reaching into subfolders.
export { EventStore } from './core/event-store';
export type { EventListener } from './core/event-store';
export { StreamHash } from './core/hash';
export { createRng, restoreRng } from './core/rng';
export type { Rng, RngState } from './core/rng';
export * from './core/time';
export { WORLD_START } from './gen/world';
export * from './model';
export { createSimulation } from './simulation';
export type { AdvanceOptions, AdvanceResult, Simulation, SimulationOptions } from './simulation';
