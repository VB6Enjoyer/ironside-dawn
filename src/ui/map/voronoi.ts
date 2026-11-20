/** Plain geometry for the map's lands, kept apart from the drawing so it can be tested. */

/** A point on the map, in leagues. */
export type Point = [number, number];

/**
 * The part of `frame` nearer to `site` than to any other: the frame cut by
 * the line halfway between the site and each of the others.
 */
export function voronoiCell(
  site: { readonly x: number; readonly y: number },
  sites: readonly { readonly x: number; readonly y: number }[],
  frame: readonly Point[],
): Point[] {
  let cell: Point[] = [...frame];
  for (const other of sites) {
    if (other === site) continue;
    // Nearer to `site` than `other`: a·p <= b.
    const a: Point = [other.x - site.x, other.y - site.y];
    const b = (other.x ** 2 + other.y ** 2 - site.x ** 2 - site.y ** 2) / 2;
    cell = clip(cell, a, b);
    if (cell.length === 0) break;
  }
  return cell;
}

/** The polygon's part where a·p <= b (one step of Sutherland–Hodgman). */
function clip(polygon: readonly Point[], a: Point, b: number): Point[] {
  const out: Point[] = [];
  const side = (p: Point) => a[0] * p[0] + a[1] * p[1] - b;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp < 0 !== sq < 0 && sp !== sq) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}
