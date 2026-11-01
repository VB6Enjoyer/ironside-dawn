import { describe, expect, it } from 'vitest';

import { GOODS, PROFESSIONS, SHOCKS } from './economy';
import { LOOT } from './loot';
import { STARTER_MAP } from './starter-map';

const goods = new Set<string>(GOODS.map((g) => g.id));

describe('economy content', () => {
  it('gives every town a workforce that adds up', () => {
    for (const town of STARTER_MAP.locations.filter((l) => l.kind === 'town')) {
      const shares = Object.values(town.economy?.workforce ?? {});
      expect(
        shares.reduce((a, b) => a + b, 0),
        town.id,
      ).toBeCloseTo(1, 6);
      if (town.economy?.workforce.miners) expect(town.economy.mine, town.id).toBe(true);
    }
  });

  it('only makes and uses goods that exist', () => {
    for (const p of PROFESSIONS) {
      for (const r of p.recipes) {
        for (const g of [...Object.keys(r.inputs), ...Object.keys(r.outputs)]) {
          expect(goods.has(g), `${p.id}: ${g}`).toBe(true);
        }
      }
    }
    for (const l of LOOT) if ('good' in l) expect(goods.has(l.good), l.id).toBe(true);
  });

  it('lets shocks last a sensible while', () => {
    for (const s of SHOCKS) expect(s.days[0]).toBeLessThanOrEqual(s.days[1]);
  });
});
