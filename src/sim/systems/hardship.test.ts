import { describe, expect, it } from 'vitest';

import { testContext } from '../test-support';
import { hardshipOf } from './hardship';

describe('hardship', () => {
  it('scales sickness, plague and curses, and reads as normal for older worlds', () => {
    const ctx = testContext('hardship');
    const settings = ctx.world.settings as { hardship?: string };
    expect(hardshipOf(ctx.world)).toBe(1);
    settings.hardship = 'gentle';
    expect(hardshipOf(ctx.world)).toBeLessThan(1);
    settings.hardship = 'harsh';
    expect(hardshipOf(ctx.world)).toBeGreaterThan(1);
    delete settings.hardship;
    expect(hardshipOf(ctx.world)).toBe(1);
  });
});
