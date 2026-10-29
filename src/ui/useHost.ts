import { useSyncExternalStore } from 'react';

import type { HostSnapshot, SimHost } from '../host';

export function useHostSnapshot(host: SimHost): HostSnapshot {
  return useSyncExternalStore(host.subscribe, host.getSnapshot);
}
