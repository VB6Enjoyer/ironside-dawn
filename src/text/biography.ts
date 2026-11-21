import { creatureDef, LANGUAGES, type CreatureId, type LanguageId } from '../content';
import {
  toCalendar,
  type Character,
  type CharacterId,
  type DeathCause,
  type CrimeKind,
  type LocationId,
  type OutlawReason,
  type SimEvent,
} from '../sim';
import { seasonName } from './calendar';
import type { Segment } from './describe';
import { spellName } from './items';
import { personalitySummary } from './mind';
import { SPECIES_NAMES, type NameResolver } from './names';
import { aCreature, article, capitalize, countWord, listOf, TRAP_NAMES } from './words';

/**
 * A life story in a few paragraphs, for the profile page (ROADMAP.md
 * Phase 6): where they came from, what they did, whom they loved and hated,
 * what they did wrong, and how it ended.
 */

const OCCUPATION_PHRASES = {
  innkeeper: 'an innkeeper',
  smith: 'a smith',
  trainer: 'a weapons master',
  farmer: 'a farmer',
  clerk: 'a clerk of the trading house',
} as const;

/** "the Harvest of Year 3", or before the chronicle began. */
export function whenIn(time: number): string {
  if (time < 0) return 'the years before the chronicle begins';
  const c = toCalendar(time);
  return `the ${seasonName(c.season)} of Year ${c.year}`;
}

function place(id: LocationId, names: NameResolver): Segment {
  const location = names.location(id);
  if (!location) return { text: 'the wilds' };
  return {
    text: location.article ? `${location.article} ${location.name}` : location.name,
    ref: { kind: 'location', id },
  };
}

function person(id: CharacterId, names: NameResolver): Segment {
  return { text: names.character(id)?.name ?? 'someone', ref: { kind: 'character', id } };
}

function people(ids: readonly CharacterId[], names: NameResolver): Segment[] {
  const out: Segment[] = [];
  ids.forEach((id, i) => {
    if (i > 0) out.push({ text: i === ids.length - 1 ? ' and ' : ', ' });
    out.push(person(id, names));
  });
  return out;
}

/** How someone died, without the place: "slain by an enraged warg". */
export function causeOfDeath(cause: DeathCause, names: NameResolver): Segment[] {
  switch (cause.kind) {
    case 'creature':
      return [{ text: `slain by ${aCreature(cause.creature)}` }];
    case 'character':
      return [{ text: 'killed by ' }, person(cause.characterId, names)];
    case 'trap':
      return [{ text: `killed by ${article(TRAP_NAMES[cause.trap])} ${TRAP_NAMES[cause.trap]}` }];
    case 'magic':
      return [{ text: `killed by their own backfiring ${spellName(cause.spell)}` }];
    case 'age':
      return [{ text: `of old age, ${cause.age} years old` }];
    case 'departed':
      return [{ text: 'left for distant lands' }];
  }
}

/** "Slain by an enraged warg in Gorefang Caves". */
export function deathLine(
  cause: DeathCause,
  locationId: LocationId,
  names: NameResolver,
): Segment[] {
  const [first, ...rest] = causeOfDeath(cause, names);
  return [{ text: capitalize(first!.text) }, ...rest, { text: ' in ' }, place(locationId, names)];
}

export function biography(
  c: Character,
  events: readonly SimEvent[],
  names: NameResolver,
  /** The great dead, to say so of a parent. */
  heroes: ReadonlySet<CharacterId> = new Set(),
): Segment[][] {
  const alive = c.death === null;
  const was = alive ? 'is' : 'was';
  const name = `${c.givenName} ${c.familyName}`;
  const species = SPECIES_NAMES[c.species].singular;
  const paragraphs: Segment[][] = [];

  // Origins.
  const character = listOf(personalitySummary(c.traits).split(', ').filter(Boolean).slice(0, 3));
  const calledThem = character ? ` Those who knew them called them ${character}.` : '';
  if (c.parents.length > 0) {
    const legendary = c.parents.filter((p) => heroes.has(p));
    paragraphs.push([
      { text: `${name} was born in ${whenIn(c.born)} in ` },
      place(c.homeId, names),
      { text: ', to ' },
      ...people(c.parents, names),
      ...(legendary.length > 0
        ? [{ text: ', of whom ' }, ...people(legendary, names), { text: ' is remembered in song' }]
        : []),
      { text: `${c.gifted ? ', with the family gift for magic' : ''}.${calledThem}` },
    ]);
  } else {
    paragraphs.push([
      { text: `${name} ${was} ${article(species)} ${species} of ` },
      place(c.homeId, names),
      {
        text: `, who took up the ${c.calling === 'merchant' ? "merchant's" : "adventurer's"} life in ${whenIn(c.arrivedAt)}${
          c.gifted ? ', born with the gift for magic' : ''
        }.${calledThem}`,
      },
    ]);
  }

  // The career: a merchant's is in their ledger and their tongues.
  if (c.calling === 'merchant') {
    const runs = events.filter(
      (e) => e.type === 'trade.unload' && e.data.characterId === c.id,
    ).length;
    const tongues = (Object.entries(c.languages) as [LanguageId, number][])
      .filter(([, level]) => level >= 70)
      .map(([id]) => LANGUAGES[id].name);
    paragraphs.push([
      {
        text: `${alive ? 'They have hauled' : 'They hauled'} goods between the towns${
          runs > 0
            ? `, ${runs} ${runs === 1 ? 'load' : 'loads'} that the chronicle still recalls,`
            : ''
        } and cleared `,
      },
      { text: `${c.goldEarned.toLocaleString('en-US')} gold`, mark: 'wealth' },
      { text: ` in profit. They ${alive ? 'haggle' : 'haggled'} in ${listOf(tongues)}.` },
    ]);
  }

  // The career.
  const kills = Object.entries(c.kills) as [CreatureId, number][];
  const totalKills = kills.reduce((n, [, k]) => n + k, 0);
  const favorite = kills.sort((a, b) => b[1] - a[1])[0];
  const delves = Object.values(c.expectations).reduce((n, e) => n + (e?.trips ?? 0), 0);
  const career: Segment[][] = [];
  // The living have done these things so far; the dead did them.
  const [reached, went, slew, earned] = alive
    ? ['They have reached', 'been into the dungeons', 'slain', 'earned']
    : ['They reached', 'went into the dungeons', 'slew', 'earned'];
  career.push([{ text: `${reached} level ${c.level}` }]);
  if (delves > 0) {
    career.push([
      { text: `${went} ` },
      {
        text: delves === 1 ? 'once' : `${delves.toLocaleString('en-US')} times`,
        mark: 'delve',
      },
    ]);
  }
  if (totalKills > 0 && favorite) {
    const def = creatureDef(favorite[0]);
    career.push([
      { text: `${slew} ` },
      {
        text: `${totalKills.toLocaleString('en-US')} ${totalKills === 1 ? 'foe' : 'foes'}`,
        mark: 'death',
      },
      ...(totalKills > 1 ? [{ text: `, most of them ${def.plural}` }] : []),
    ]);
  }
  if (c.goldEarned > 0) {
    career.push([
      { text: `${earned} ` },
      { text: `${c.goldEarned.toLocaleString('en-US')} gold`, mark: 'wealth' },
    ]);
  }
  const legends = c.deeds.filter((d) => d.kind === 'legend').map((d) => d.name);
  const sentence: Segment[] = [...joinClauses(career), { text: '.' }];
  if (legends.length > 0) {
    const shown = legends.slice(0, 3);
    const more = legends.length - shown.length;
    sentence.push({
      text: ` They found ${listOf(more > 0 ? [...shown, `${countWord(more)} more legendary pieces`] : shown)}.`,
    });
  }
  if (c.spells.length > 0) {
    sentence.push({ text: ' They learned to cast ' });
    c.spells.forEach((spell, i) => {
      sentence.push(
        { text: spellName(spell), mark: 'magic' },
        { text: listGlue(i, c.spells.length) },
      );
    });
    sentence.push({ text: '.' });
  }
  if (c.calling !== 'merchant') paragraphs.push(sentence);

  // Bonds.
  const opinions = Object.entries(c.opinions) as [
    CharacterId,
    NonNullable<Character['opinions'][CharacterId]>,
  ][];
  const friends = opinions
    .filter(([, o]) => o.bond === 'friend')
    .sort((a, b) => b[1].affinity - a[1].affinity)
    .map(([id]) => id);
  const rivals = opinions.filter(([, o]) => o.bond === 'rival').map(([id]) => id);
  const mourned = c.memories.flatMap((m) => (m.kind === 'grief' ? [m.characterId] : []));
  const bonds: Segment[] = [];
  if (friends.length > 0) {
    const closest = friends.slice(0, 3);
    bonds.push(
      { text: closest.length === 1 ? 'Their closest friend was ' : 'Their closest friends were ' },
      ...people(closest, names),
      { text: friends.length > 3 ? `, among ${friends.length} friends. ` : '. ' },
    );
  } else {
    bonds.push({ text: 'They made no close friends. ' });
  }
  if (rivals.length > 0) {
    bonds.push({ text: 'They had no love for ' }, ...people(rivals.slice(0, 3), names), {
      text: '. ',
    });
  }
  if (mourned.length > 0) {
    bonds.push({ text: 'They mourned ' }, ...people([...new Set(mourned)].slice(0, 3), names), {
      text: '.',
    });
  }
  paragraphs.push(bonds);

  // Crime and justice.
  const justice: Segment[] = [];
  if (c.outlaw) {
    const { since, crimes, murders } = c.outlaw;
    const record =
      crimes === 0
        ? 'Nothing has come of it yet.'
        : `${capitalize(countWord(crimes))} ${crimes === 1 ? 'crime' : 'crimes'}${
            murders > 0
              ? `, ${countWord(murders)} of them ${murders === 1 ? 'a murder' : 'murders'},`
              : ''
          } followed.`;
    justice.push(
      { text: `In ${whenIn(since)} they ` },
      { text: 'turned outlaw', mark: 'crime' },
      { text: `${TURNED_FOR[c.outlaw.reason ?? 'want']}. ${record} ` },
    );
  }
  // What their crimes were, besides robbing and killing named folk.
  const deeds = crimeDeeds(c);
  if (deeds) {
    justice.push({
      text: c.outlaw
        ? `They ${deeds}. `
        : `Though never an outlaw, now and then they ${deeds}${
            c.crimes.length > 1 ? `, ${countWord(c.crimes.length)} times in all` : ''
          }. `,
    });
  }
  const barred = (Object.keys(c.notoriety) as LocationId[]).filter(
    (id) => (c.notoriety[id]?.murders ?? 0) > 0,
  );
  if (barred.length > 0) {
    justice.push(
      { text: 'Word of their bloody deeds ' },
      { text: 'barred', mark: 'crime' },
      {
        text: ` them from ${barred.length === 1 ? '' : `${countWord(barred.length)} towns, among them `}`,
      },
      ...barred
        .slice(0, 2)
        .flatMap((id, i): Segment[] => [...(i > 0 ? [{ text: ' and ' }] : []), place(id, names)]),
      { text: '. ' },
    );
  }
  const claims = events.filter((e) => e.type === 'bounty.claim' && e.data.characterId === c.id);
  if (claims.length > 0) {
    const outlaws = claims.flatMap((e) => (e.type === 'bounty.claim' ? [e.data.outlawId] : []));
    justice.push(
      {
        text: `They brought ${claims.length === 1 ? 'an outlaw' : `${countWord(claims.length)} outlaws`} to justice: `,
      },
      ...people(outlaws.slice(0, 3), names),
      { text: '. ' },
    );
  }
  // Taken alive, jailed, escaped (0.3.0).
  for (const e of events) {
    if (e.type === 'capture.attempt' && e.data.outlawId === c.id && e.data.success) {
      justice.push(
        { text: `In ${whenIn(e.t)} ` },
        person(e.data.characterId, names),
        { text: ' ' },
        { text: 'took them alive', mark: 'crime' },
        { text: '. ' },
      );
    } else if (e.type === 'capture.escape' && e.data.characterId === c.id) {
      justice.push({ text: 'They got away from ' }, person(e.data.captorId, names), {
        text: ', with nothing but the clothes on their back. ',
      });
    } else if (e.type === 'outlaw.jailed' && e.data.characterId === c.id) {
      const years = Math.max(1, Math.round((e.data.until - e.t) / (360 * 86_400)));
      justice.push(
        { text: `They were ` },
        { text: 'jailed', mark: 'crime' },
        { text: ` in ` },
        place(e.data.locationId, names),
        { text: ` for ${countWord(years)} ${years === 1 ? 'year' : 'years'}. ` },
      );
    } else if (e.type === 'outlaw.freed' && e.data.characterId === c.id) {
      justice.push({ text: `They came out in ${whenIn(e.t)}, no outlaw any more. ` });
    }
  }
  const reform = events.find((e) => e.type === 'outlaw.reform' && e.data.characterId === c.id);
  if (reform?.type === 'outlaw.reform') {
    justice.push({
      text:
        reform.data.paid !== undefined && reform.data.paid > 0
          ? `They paid back what they took, ${reform.data.paid} gold with interest and fines, and went straight.`
          : 'They paid for their crimes and went straight.',
    });
  }
  if (justice.length > 0) paragraphs.push(justice);

  // Family, and settling down.
  const family: Segment[] = [];
  if (c.spouseId) {
    family.push(
      { text: 'They ' },
      { text: 'married', mark: 'love' },
      { text: ' ' },
      person(c.spouseId, names),
      { text: '. ' },
    );
  }
  if (c.children.length > 0) {
    family.push(
      {
        text: `${c.children.length === 1 ? 'Their child is' : `Their ${countWord(c.children.length)} children are`} `,
      },
      ...people(c.children, names),
      { text: '. ' },
    );
  }
  if (c.calling === 'townsfolk' && c.occupation) {
    family.push({ text: `In time they settled in ` }, place(c.homeId, names), {
      text: ` as ${OCCUPATION_PHRASES[c.occupation]}.`,
    });
  }
  if (family.length > 0) paragraphs.push(family);

  // The end.
  if (c.death?.cause.kind === 'departed') {
    paragraphs.push([
      { text: `In ${whenIn(c.death.at)}, ${c.givenName} left ` },
      place(c.death.locationId, names),
      { text: ' for distant lands, and was not heard of again.' },
    ]);
  } else if (c.death) {
    paragraphs.push([
      { text: `${c.givenName} ` },
      { text: 'died', mark: 'death' },
      { text: ` in ${whenIn(c.death.at)}, ` },
      ...causeOfDeath(c.death.cause, names),
      { text: ' in ' },
      place(c.death.locationId, names),
      { text: `, at level ${c.level}.` },
    ]);
  }
  return paragraphs.map(trimEnd);
}

/** Each kind of crime against the nameless, as a life story tells it. */
const CRIME_DEEDS: Partial<Record<CrimeKind, string>> = {
  waylay: 'held up caravans',
  burglary: 'broke into houses',
  theft: 'stole from shops',
  holdup: 'robbed trading houses at blade point',
  extortion: 'made farmers pay',
  vandalism: 'spoiled stores out of spite',
};

/** "held up caravans, broke into houses and stole from shops", most often first. */
function crimeDeeds(c: Character): string | null {
  const counts = new Map<CrimeKind, number>();
  for (const crime of c.crimes) {
    if (crime.foiled || !CRIME_DEEDS[crime.kind]) continue;
    counts.set(crime.kind, (counts.get(crime.kind) ?? 0) + 1);
  }
  const kinds = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return kinds.length > 0 ? listOf(kinds.map(([k]) => CRIME_DEEDS[k]!)) : null;
}

/** Why someone turned outlaw, as a life story puts it. */
const TURNED_FOR: Record<OutlawReason, string> = {
  want: ', broke and desperate',
  ambition: ', wanting more than honest work would pay',
  skill: ', putting a thief’s skills to a thief’s use',
  company: ', following outlaw friends',
  grudge: ', over an old wrong',
};

function trimEnd(paragraph: Segment[]): Segment[] {
  const last = paragraph.at(-1);
  if (!last || 'ref' in last) return paragraph;
  return [...paragraph.slice(0, -1), { ...last, text: last.text.trimEnd() }];
}

/** "They reached level 9, went into the dungeons 40 times, and slew 120 foes". */
function joinClauses(clauses: readonly (readonly Segment[])[]): Segment[] {
  return clauses.flatMap((clause, i) => [
    ...clause,
    ...(i < clauses.length - 1 ? [{ text: clauseGlue(i, clauses.length) }] : []),
  ]);
}

/** What follows clause `i` of `n`: ", " between, then ", and " (" and " for two) before the last. */
function clauseGlue(i: number, n: number): string {
  if (i === n - 2) return n > 2 ? ', and ' : ' and ';
  return ', ';
}

/** What follows item `i` of a list of `n` ("a, b and c"): nothing after the last. */
function listGlue(i: number, n: number): string {
  if (i === n - 1) return '';
  return i === n - 2 ? ' and ' : ', ';
}
