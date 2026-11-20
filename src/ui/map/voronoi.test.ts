import { describe, expect, it } from 'vitest';

import { voronoiCell, type Point } from './voronoi';

const frame: Point[] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

const area = (poly: readonly Point[]) =>
  Math.abs(
    poly.reduce((sum, [x, y], i) => {
      const [nx, ny] = poly[(i + 1) % poly.length]!;
      return sum + x * ny - nx * y;
    }, 0),
  ) / 2;

describe('the lands of the map', () => {
  it('split the map between two hearts down the middle', () => {
    const west = { x: 2, y: 5 };
    const east = { x: 8, y: 5 };
    const cell = voronoiCell(west, [west, east], frame);
    expect(area(cell)).toBeCloseTo(50);
    expect(Math.max(...cell.map(([x]) => x))).toBeCloseTo(5);
  });

  it('cover the whole map between them, whatever the hearts', () => {
    const sites = [
      { x: 1, y: 1 },
      { x: 9, y: 2 },
      { x: 5, y: 5 },
      { x: 2, y: 8 },
      { x: 8, y: 9 },
    ];
    const total = sites.reduce((sum, s) => sum + area(voronoiCell(s, sites, frame)), 0);
    expect(total).toBeCloseTo(100);
  });

  it('give a lone heart the whole map', () => {
    const only = { x: 3, y: 3 };
    expect(area(voronoiCell(only, [only], frame))).toBeCloseTo(100);
  });
});
