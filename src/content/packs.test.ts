import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { createSimulation } from '../sim';
import { CREATURES, creatureDef, CULTURES, installedPacks, installPack, packCultures } from '.';

const slavic = JSON.parse(
  readFileSync(new URL('../../packs/slavic.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

describe('content packs', () => {
  it('refuse what is malformed or names what does not exist, adding nothing', () => {
    const before = CREATURES.length;
    expect(() => installPack({ ...slavic, format: 'something-else' })).toThrow(/format/);
    expect(() => installPack({ ...slavic, id: 'Not An Id' })).toThrow(/id/);
    const badDrop = structuredClone(slavic) as { creatures: { drops: { loot: string }[] }[] };
    badDrop.creatures[0]!.drops[0]!.loot = 'no-such-loot';
    expect(() => installPack(badDrop)).toThrow(/unknown loot "no-such-loot"/);
    const clash = structuredClone(slavic) as { creatures: { id: string }[] };
    clash.creatures[0]!.id = 'wolf';
    expect(() => installPack(clash)).toThrow(/creature "wolf" already exists/);
    expect(CREATURES.length).toBe(before);
  });

  it('add their creatures, arms and culture, once', () => {
    installPack(slavic);
    installPack(slavic);
    expect(creatureDef('leshy' as never).plural).toBe('leshies');
    expect('slavic' in CULTURES).toBe(true);
    expect(packCultures()).toContain('slavic');
    expect(installedPacks().map((p) => p.id)).toEqual(['slavic']);
    expect(() => installPack({ ...slavic, name: 'Something else' })).toThrow(/already in use/);
  });

  it('give worlds their lands, and go with them into saves', () => {
    const sim = createSimulation({ seed: 'slav', characterCount: 60, packs: [slavic as never] });
    const lands = [...sim.world.regions.values()].filter((r) => r.culture === ('slavic' as never));
    expect(lands.length).toBeGreaterThan(0);
    const save = sim.save();
    expect(save.packs.map((p) => p.id)).toEqual(['slavic']);
    const again = createSimulation({ seed: 'slav', restore: save });
    expect(again.world.regions.size).toBe(sim.world.regions.size);
  });
});
