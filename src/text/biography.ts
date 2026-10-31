import { creatureDef, type CreatureId } from '../content';
import {
  toCalendar,
  type Character,
  type CharacterId,
  type DeathCause,
  type LocationId,
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

/** "the Harvest of Year 3". */
export function whenIn(time: number): string {
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
): Segment[][] {
  const alive = c.death === null;
  const was = alive ? 'is' : 'was';
  const name = `${c.givenName} ${c.familyName}`;
  const species = SPECIES_NAMES[c.species].singular;
  const paragraphs: Segment[][] = [];

  // Origins.
  const character = listOf(personalitySummary(c.traits).split(', ').filter(Boolean).slice(0, 3));
  paragraphs.push([
    { text: `${name} ${was} ${article(species)} ${species} of ` },
    place(c.homeId, names),
    {
      text: `, who took up the adventurer's life in ${whenIn(c.arrivedAt)}${
        c.gifted ? ', born with the gift for magic' : ''
      }. ${character ? `Those who knew them called them ${character}.` : ''}`,
    },
  ]);

  // The career.
  const kills = Object.entries(c.kills) as [CreatureId, number][];
  const totalKills = kills.reduce((n, [, k]) => n + k, 0);
  const favorite = kills.sort((a, b) => b[1] - a[1])[0];
  const delves = Object.values(c.expectations).reduce((n, e) => n + (e?.trips ?? 0), 0);
  const career: string[] = [];
  // The living have done these things so far; the dead did them.
  const [reached, went, slew, earned] = alive
    ? ['They have reached', 'been into the dungeons', 'slain', 'earned']
    : ['They reached', 'went into the dungeons', 'slew', 'earned'];
  career.push(`${reached} level ${c.level}`);
  if (delves > 0) {
    career.push(`${went} ${delves === 1 ? 'once' : `${delves.toLocaleString('en-US')} times`}`);
  }
  if (totalKills > 0 && favorite) {
    const def = creatureDef(favorite[0]);
    career.push(
      `${slew} ${totalKills.toLocaleString('en-US')} ${totalKills === 1 ? 'foe' : 'foes'}${
        totalKills > 1 ? `, most of them ${def.plural}` : ''
      }`,
    );
  }
  if (c.goldEarned > 0) career.push(`${earned} ${c.goldEarned.toLocaleString('en-US')} gold`);
  const legends = c.deeds.filter((d) => d.kind === 'legend').map((d) => d.name);
  let sentence = `${joinClauses(career)}.`;
  if (legends.length > 0) {
    const shown = legends.slice(0, 3);
    const more = legends.length - shown.length;
    sentence += ` They found ${listOf(more > 0 ? [...shown, `${countWord(more)} more legendary pieces`] : shown)}.`;
  }
  if (c.spells.length > 0) {
    sentence += ` They learned to cast ${listOf(c.spells.map(spellName))}.`;
  }
  paragraphs.push([{ text: sentence }]);

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
    justice.push({ text: `In ${whenIn(since)} they turned outlaw. ${record} ` });
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
  const reformed = events.some((e) => e.type === 'outlaw.reform' && e.data.characterId === c.id);
  if (reformed) justice.push({ text: 'They paid for their crimes and went straight.' });
  if (justice.length > 0) paragraphs.push(justice);

  // The end.
  if (c.death) {
    paragraphs.push([
      { text: `${c.givenName} died in ${whenIn(c.death.at)}, ` },
      ...causeOfDeath(c.death.cause, names),
      { text: ' in ' },
      place(c.death.locationId, names),
      { text: `, at level ${c.level}.` },
    ]);
  }
  return paragraphs.map(trimEnd);
}

function trimEnd(paragraph: Segment[]): Segment[] {
  const last = paragraph.at(-1);
  if (!last || 'ref' in last) return paragraph;
  return [...paragraph.slice(0, -1), { ...last, text: last.text.trimEnd() }];
}

/** "They reached level 9, went into the dungeons 40 times and slew 120 foes". */
function joinClauses(clauses: readonly string[]): string {
  if (clauses.length <= 1) return clauses[0] ?? '';
  const [first, ...rest] = clauses;
  const last = rest.pop()!;
  return [first, ...rest].join(', ') + `${rest.length > 0 ? ',' : ''} and ${last}`;
}
