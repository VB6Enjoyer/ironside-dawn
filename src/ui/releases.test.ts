import { describe, expect, it } from 'vitest';

import { APP_VERSION, compareVersions, isVersion } from '../host/version';
import { RELEASES } from './releases';

describe('release notes', () => {
  it('cover this version, so no release ships without them', () => {
    expect(RELEASES[0]?.version).toBe(APP_VERSION);
  });

  it('run newest first, each with a version, date, title and changes', () => {
    for (const [i, release] of RELEASES.entries()) {
      expect(isVersion(release.version)).toBe(true);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(release.title.length).toBeGreaterThan(0);
      expect(release.changes.length).toBeGreaterThan(0);
      const older = RELEASES[i + 1];
      if (older) {
        expect(compareVersions(release.version, older.version)).toBeGreaterThan(0);
        expect(release.date >= older.date).toBe(true);
      }
    }
  });
});
