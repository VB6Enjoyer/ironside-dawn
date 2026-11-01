import { useEffect, useState, useSyncExternalStore } from 'react';

import type { HostSnapshot, Request, RequestOf, Responses, SimHost } from '../host';

export function useHostSnapshot(host: SimHost): HostSnapshot {
  return useSyncExternalStore(host.subscribe, host.getSnapshot);
}

/**
 * Asks the world a question and keeps the latest answer. Asks again whenever
 * `refresh` changes; until the new answer arrives the old one stays, so views
 * hold still instead of flickering.
 */
export function useQuery<K extends Request['kind']>(
  host: SimHost,
  request: RequestOf<K> | null,
  refresh: unknown = null,
): Responses[K] | undefined {
  const key = request ? JSON.stringify(request) : null;
  const [answer, setAnswer] = useState<{ key: string; value: Responses[K] }>();

  useEffect(() => {
    if (key === null) return;
    let current = true;
    host.request(JSON.parse(key) as RequestOf<K>).then(
      (value) => current && setAnswer({ key, value }),
      () => undefined, // the world was closed
    );
    return () => {
      current = false;
    };
  }, [host, key, refresh]);

  return answer && answer.key === key ? answer.value : undefined;
}
