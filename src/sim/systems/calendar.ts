import { schedule } from '../core/scheduler';
import { startOfNextSeason, toCalendar } from '../core/time';
import type { SimContext } from '../context';

export function scheduleNextSeason(ctx: SimContext): void {
  schedule(ctx.world.scheduler, startOfNextSeason(ctx.world.time), { kind: 'calendar.season' });
}

export function beginSeason(ctx: SimContext): void {
  const { year, season } = toCalendar(ctx.world.time);
  ctx.emit({ type: 'calendar.season', data: { year, season } }, [], null);
  scheduleNextSeason(ctx);
}
