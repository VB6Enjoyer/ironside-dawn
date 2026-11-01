import { goodDef, type GoodId, type Goods, type ShockId } from '../content';
import { listOf } from './words';

/** "12 loads of iron ore", "a load of iron ore", "a little iron ore". */
export function goodsAmount(good: GoodId, units: number): string {
  const def = goodDef(good);
  const n = Math.round(units);
  if (n <= 0) return `a little ${def.name}`;
  if (n === 1) return `${/^[aeiou]/i.test(def.plural) ? 'an' : 'a'} ${singular(def.plural)}`;
  return `${n} ${def.plural}`;
}

/** "a load of iron ore" from "loads of iron ore". */
function singular(plural: string): string {
  const [first, ...rest] = plural.split(' ');
  const one =
    first!.endsWith('es') && /(ch|sh|x|s)es$/.test(first!)
      ? first!.slice(0, -2)
      : first!.replace(/s$/, '');
  return [one, ...rest].join(' ');
}

/** Several goods in a phrase: "12 loads of iron ore and 3 bundles of hides". */
export function goodsList(goods: Goods): string {
  const parts = (Object.entries(goods) as [GoodId, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([g, n]) => goodsAmount(g, n));
  return listOf(parts) || 'nothing';
}

/** What a trouble is called, in a few words. */
export const SHOCK_NAMES: Record<ShockId, string> = {
  'failed-harvest': 'a failed harvest',
  'mine-collapse': 'a collapsed mine',
  'rich-vein': 'a rich new vein of iron',
  blight: 'a blight on the herb gardens',
  blockade: 'wargs holding the road',
};
