import type { HostSnapshot } from '../../host';
import { formatCount, formatRate } from '../format';

export function StatusBar({ snapshot }: { snapshot: HostSnapshot }) {
  const { characterCount, eventCount, hiddenCount, measuredRate, running } = snapshot;
  return (
    <footer className="status-bar">
      <span>{formatCount(characterCount)} adventurers</span>
      <span>{formatCount(eventCount)} events</span>
      {hiddenCount > 0 && <span>{formatCount(hiddenCount)} below detail level</span>}
      <span>{running ? formatRate(measuredRate) : 'Paused'}</span>
    </footer>
  );
}
