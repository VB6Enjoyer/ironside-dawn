import { createEngine, type Timer } from './engine';
import type { ClientMessage, EngineMessage, InitOptions, Port } from './protocol';
import { createRemoteHost, type RemoteHostOptions, type SimHost } from './remote-host';

/**
 * A host and its engine in the same thread, joined by ports that copy every
 * message the way a worker would. For tests and tools.
 */
export function createInProcessHost(
  init: InitOptions,
  { timer, now, ...options }: RemoteHostOptions & { timer: Timer; now: () => number },
): SimHost {
  const client: Port<EngineMessage, ClientMessage> = {
    onmessage: null,
    postMessage: (message) => engine.receive(structuredClone(message)),
  };
  const engine = createEngine({
    post: (message) => client.onmessage?.({ data: structuredClone(message) }),
    timer,
    now,
  });
  return createRemoteHost(client, init, options);
}
