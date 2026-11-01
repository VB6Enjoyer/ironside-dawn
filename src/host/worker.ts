import { createEngine, type Timer } from './engine';
import type { ClientMessage, EngineMessage, Port } from './protocol';

/** The Web Worker the simulation runs in. All the logic is in the engine. */

const scope = self as unknown as Port<ClientMessage, EngineMessage>;

/**
 * Zero-delay callbacks through a message channel: nested `setTimeout(…, 0)`
 * calls are slowed to 4 ms each, which would idle a flat-out run for no reason.
 */
function workerTimer(): Timer {
  const channel = new MessageChannel();
  const queue = new Map<number, () => void>();
  let next = 1;
  channel.port1.onmessage = (event: MessageEvent<number>) => {
    const callback = queue.get(event.data);
    queue.delete(event.data);
    callback?.();
  };
  return {
    set(callback, ms) {
      if (ms > 0) return setTimeout(callback, ms);
      const id = next++;
      queue.set(id, callback);
      channel.port2.postMessage(id);
      return { zero: id };
    },
    clear(handle) {
      if (typeof handle === 'object' && handle !== null) {
        queue.delete((handle as { zero: number }).zero);
      } else {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      }
    },
  };
}

const engine = createEngine({
  post: (message) => scope.postMessage(message),
  timer: workerTimer(),
  now: () => performance.now(),
});
scope.onmessage = (event) => engine.receive(event.data);
