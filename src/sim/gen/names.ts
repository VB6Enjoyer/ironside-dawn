import { CULTURES, type CultureId } from '../../content';
import type { Rng } from '../core/rng';

export interface PersonName {
  readonly givenName: string;
  readonly familyName: string;
}

const MAX_ATTEMPTS = 50;

/**
 * A name from the culture's tables. Avoids full names already in `taken`
 * when it can, and adds the new name to it.
 */
export function generateName(rng: Rng, cultureId: CultureId, taken: Set<string>): PersonName {
  const culture = CULTURES[cultureId];
  let name: PersonName | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    name = {
      givenName: rng.pick(culture.givenNames),
      familyName: rng.pick(culture.familyNamePrefixes) + rng.pick(culture.familyNameSuffixes),
    };
    if (!taken.has(fullName(name))) break;
  }
  taken.add(fullName(name!));
  return name!;
}

function fullName(name: PersonName): string {
  return `${name.givenName} ${name.familyName}`;
}

/**
 * A child's name: a given name of their culture with the family's name. If
 * every given name is taken in the family, they are "the Younger", and so on.
 */
export function generateChildName(
  rng: Rng,
  cultureId: CultureId,
  familyName: string,
  taken: Set<string>,
): PersonName {
  const culture = CULTURES[cultureId];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const name = { givenName: rng.pick(culture.givenNames), familyName };
    if (!taken.has(fullName(name))) {
      taken.add(fullName(name));
      return name;
    }
  }
  const base = rng.pick(culture.givenNames);
  let n = 2;
  while (taken.has(`${base} ${ORDINALS[n] ?? n} ${familyName}`)) n++;
  const name = { givenName: `${base} ${ORDINALS[n] ?? n}`, familyName };
  taken.add(fullName(name));
  return name;
}

const ORDINALS = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
