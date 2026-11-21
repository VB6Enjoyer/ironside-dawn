import type { Charges, CrimeKind, ExecutionMethod } from '../sim';
import { weaponName } from './items';
import { article, countWord, listOf } from './words';

/**
 * Words for justice (0.3.0): how towns put murderers to death, and what
 * courts charge people with.
 */

/** A death sentence, by the town's way of it: "to hang", "to be beheaded". */
export const SENTENCED_TO: Record<ExecutionMethod, string> = {
  hanging: 'to hang',
  beheading: 'to be beheaded',
  axe: 'to lose their head to the axe',
  arrows: 'to be shot with arrows',
  chasm: 'to be cast into the chasm',
  stoning: 'to be stoned to death',
};

/** How someone was put to death: "hanged", "beheaded with an axe". */
export const EXECUTED: Record<ExecutionMethod, string> = {
  hanging: 'hanged',
  beheading: 'beheaded',
  axe: 'beheaded with an axe',
  arrows: 'shot with arrows',
  chasm: 'cast into the chasm',
  stoning: 'stoned to death',
};

/** Each kind of crime, as charges: [one, many]. */
const CHARGES: Record<CrimeKind, readonly [string, string]> = {
  murder: ['murder', 'murders'],
  robbery: ['a robbery on the road', 'robberies on the road'],
  waylay: ['a caravan held up', 'caravans held up'],
  burglary: ['a burglary', 'burglaries'],
  theft: ['a theft', 'thefts'],
  holdup: ['a robbery at blade point', 'robberies at blade point'],
  extortion: ['extortion', 'extortion'],
  vandalism: ['vandalism', 'vandalism'],
};

/** "two murders, three burglaries and a theft", gravest first; or empty. */
export function chargesPhrase(charges: Charges): string {
  const order: CrimeKind[] = [
    'murder',
    'robbery',
    'holdup',
    'waylay',
    'burglary',
    'extortion',
    'theft',
    'vandalism',
  ];
  const parts = order.flatMap((kind) => {
    const n = charges[kind] ?? 0;
    if (n <= 0) return [];
    const [one, many] = CHARGES[kind];
    if (n === 1 || one === many) return [one];
    return [`${countWord(n)} ${many}`];
  });
  return listOf(parts);
}

/** "with a katana", from a weapon base, if it can be named. */
export function withWeapon(base: string | undefined): string {
  if (!base) return '';
  const name = weaponName(base);
  return name ? ` with ${article(name)} ${name}` : '';
}
