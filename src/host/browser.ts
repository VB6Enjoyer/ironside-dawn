import type { ClientMessage, EngineMessage, InitOptions, Port } from './protocol';
import { createRemoteHost, type SimHost } from './remote-host';

/** Starts a world in a Web Worker of its own. */
export function createWorkerHost(init: InitOptions): SimHost {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'simulation',
  });
  return createRemoteHost(worker as unknown as Port<EngineMessage, ClientMessage>, init, {
    onDispose: () => worker.terminate(),
  });
}
