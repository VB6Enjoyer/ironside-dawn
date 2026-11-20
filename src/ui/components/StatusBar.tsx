import type { HostSnapshot } from '../../host';
import { formatCount, formatRate } from '../format';

export function StatusBar({ snapshot }: { snapshot: HostSnapshot }) {
  const { livingCount, fallenCount, eventCount, hiddenCount, measuredRate, running } = snapshot;
  return (
    <footer className="status-bar">
      <span className="mark mark-living">{formatCount(livingCount)} living</span>
      {fallenCount > 0 && <span className="mark mark-death">{formatCount(fallenCount)} gone</span>}
      <span>{formatCount(eventCount)} events</span>
      {hiddenCount > 0 && <span>{formatCount(hiddenCount)} below detail level</span>}
      <span>{running ? formatRate(measuredRate) : 'Paused'}</span>
    </footer>
  );
}
