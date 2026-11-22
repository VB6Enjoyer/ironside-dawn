import { creatureDef, LANGUAGES, type CreatureId, type LanguageId } from '../content';
import {
  toCalendar,
  type Character,
  type CharacterId,
  type DeathCause,
  type CrimeKind,
  type Judgment,
  type LocationId,
  type OutlawReason,
  type SimEvent,
} from '../sim';
import { seasonName } from './calendar';
import { GIFT_BORN, type Segment } from './describe';

/** The gift, for one born to it in the world (0.3.2). */
const GIFT_FAMILY: Segment = { text: 'family gift for magic', mark: 'magic' };
import { faithWord, type FaithWord } from '../sim';
import { spellName } from './items';
import { chargesPhrase, EXECUTED, SENTENCED_TO, withMeans } from './justice';
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
      return [
        { text: cause.murder ? 'murdered by ' : 'killed by ' },
        person(cause.characterId, names),
        { text: withMeans(cause) },
      ];
    case 'trap':
      return [{ text: `killed by ${article(TRAP_NAMES[cause.trap])} ${TRAP_NAMES[cause.trap]}` }];
    case 'magic':
      return [{ text: `killed by their own backfiring ${spellName(cause.spell)}` }];
    case 'age':
      return [{ text: `of old age, ${cause.age} years old` }];
    case 'executed':
      return [{ text: `${EXECUTED[cause.method ?? 'hanging']} for murder` }];
    case 'prison':
      return [{ text: 'in prison' }];
    case 'departed':
      return [{ text: cause.fled ? 'fled for distant lands' : 'left for distant lands' }];
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

/** A life's faith, as its story tells it (0.4.0). */
const FAITH_PHRASES: Record<FaithWord, (alive: boolean) => string> = {
  devout: (alive) => (alive ? 'They are devout.' : 'They were devout to the end.'),
  believer: (alive) => (alive ? 'They are a believer.' : 'They were a believer.'),
  doubter: (alive) =>
    alive ? 'In matters of faith, they doubt.' : 'In matters of faith, they doubted.',
  skeptic: (alive) => (alive ? 'They are a skeptic.' : 'They were a skeptic.'),
  faithless: (alive) =>
    alive ? 'They have lost the faith they once had.' : 'They lost the faith they once had.',
  corrupted: (alive) =>
    alive
      ? 'What faith they had is gone, corrupted by what they have done.'
      : 'What faith they had was gone, corrupted by what they had done.',
};

export function biography(
  c: Character,
  events: readonly SimEvent[],
  names: NameResolver,
  /** The great dead, to say so of a parent. */
  heroes: ReadonlySet<CharacterId> = new Set(),
  /** The world's time now, to tell how much of a sentence is left. */
  now?: number,
): Segment[][] {
  const alive = c.death === null;
  const was = alive ? 'is' : 'was';
  const name = `${c.givenName} ${c.familyName}`;
  const species = SPECIES_NAMES[c.species].singular;
  const paragraphs: Segment[][] = [];

  // Origins.
  const character = listOf(personalitySummary(c.traits).split(', ').filter(Boolean).slice(0, 3));
  // Faith, in a word (0.4.0): never a number.
  const faith = faithWord(c);
  const believed = faith ? ` ${FAITH_PHRASES[faith](alive)}` : '';
  const calledThem = `${character ? ` Those who knew them called them ${character}.` : ''}${believed}`;
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
      ...(c.gifted ? [{ text: ', with the ' }, GIFT_FAMILY] : []),
      { text: `.${calledThem}` },
    ]);
  } else {
    paragraphs.push([
      { text: `${name} ${was} ${article(species)} ${species} of ` },
      place(c.homeId, names),
      {
        text: `, who took up the ${c.calling === 'merchant' ? "merchant's" : "adventurer's"} life in ${whenIn(c.arrivedAt)}`,
      },
      ...(c.gifted ? [{ text: ', ' }, GIFT_BORN] : []),
      { text: `.${calledThem}` },
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
  const turns = c.justice.filter((j) => j.kind === 'turned');
  // Outlaws from before 0.3.0 have no record of turning; their outlaw record says when.
  if (turns.length === 0 && c.outlaw) {
    turns.push({ kind: 'turned', at: c.outlaw.since, reason: c.outlaw.reason ?? 'want' });
  }
  // Outlaws from before 0.3.0 have no record of turning: told first, as it came first.
  if (!c.justice.some((j) => j.kind === 'turned')) {
    for (const turn of turns) {
      justice.push(
        { text: `In ${whenIn(turn.at)} they ` },
        { text: 'turned outlaw', mark: 'crime' },
        { text: `${TURNED_FOR[turn.reason]}. ` },
      );
    }
  }
  // Their dealings with justice, in the order they came (0.3.0).
  const head = c.justice.find((j) => j.kind === 'head');
  let turned = 0;
  // What came of the latest turn is told right after it.
  const lastTurn = c.justice.map((j) => j.kind).lastIndexOf('turned');
  const sinceTurning: Segment[] = [];
  if (c.outlaw) {
    const { crimes, murders } = c.outlaw;
    sinceTurning.push({
      text:
        crimes === 0
          ? 'Nothing has come of it yet. '
          : `${capitalize(countWord(crimes))} ${crimes === 1 ? 'crime' : 'crimes'}${
              murders > 0
                ? `, ${countWord(murders)} of them ${murders === 1 ? 'a murder' : 'murders'},`
                : ''
            } followed. `,
    });
  }
  if (lastTurn < 0) justice.push(...sinceTurning);
  c.justice.forEach((j, i) => {
    justice.push(...judgment(c, j, head, turned, names, now, () => turned++));
    if (i === lastTurn) justice.push(...sinceTurning);
  });
  // What their crimes were, besides robbing and killing named folk.
  const deeds = crimeDeeds(c);
  if (deeds) {
    justice.push({
      text:
        c.outlaw || turns.length > 0
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
  // Those they murdered, and the bodies they hid.
  const hid = events.flatMap((e) =>
    e.type === 'crime.conceal' && e.data.characterId === c.id ? [e.data.victimId] : [],
  );
  const murdered = [
    ...new Set([
      ...c.crimes.flatMap((k) => (k.kind === 'murder' && k.victimId ? [k.victimId] : [])),
      ...hid,
    ]),
  ];
  if (murdered.length > 0) {
    justice.push({ text: 'They ' }, { text: 'murdered', mark: 'death' }, { text: ' ' });
    justice.push(...people(murdered.slice(0, 4), names));
    justice.push({ text: murdered.length > 4 ? ', among others' : '' });
    if (hid.length > 0) {
      justice.push(
        { text: hid.length === 1 ? ', and hid the body of ' : ', and hid the bodies of ' },
        ...people(hid.slice(0, 3), names),
      );
    }
    justice.push({ text: '. ' });
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
  // Restitution from before 0.3.0 kept no record but the event.
  const reform = events.find((e) => e.type === 'outlaw.reform' && e.data.characterId === c.id);
  if (reform && !c.justice.some((j) => j.kind === 'reformed')) {
    justice.push({ text: 'They paid for their crimes and went straight.' });
  }
  if (justice.length > 0) paragraphs.push(justice);

  // Family, and settling down.
  const family: Segment[] = [];
  // Whom they loved (0.3.0): lovers first, then marriage, if it came to that.
  const loved = (
    Object.entries(c.opinions) as [CharacterId, NonNullable<Character['opinions'][CharacterId]>][]
  )
    .filter(([, o]) => o.lovers !== undefined)
    .sort((a, b) => a[1].lovers! - b[1].lovers!);
  for (const [id, o] of loved) {
    family.push(
      { text: `In ${whenIn(o.lovers!)} they ` },
      { text: 'fell in love', mark: 'love' },
      { text: ' with ' },
      person(id, names),
      { text: id === c.spouseId ? ', and in time married them. ' : '. ' },
    );
  }
  if (c.spouseId && !loved.some(([id]) => id === c.spouseId)) {
    family.push(
      { text: 'They ' },
      { text: 'married', mark: 'love' },
      { text: ' ' },
      person(c.spouseId, names),
      { text: '. ' },
    );
  }
  if (c.expecting && !c.death) {
    family.push({ text: 'They and ' }, person(c.expecting.withId, names), {
      text: ` are expecting a child, due in ${whenIn(c.expecting.dueAt)}. `,
    });
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
      { text: `In ${whenIn(c.death.at)}, ${c.givenName} ${c.death.cause.fled ? 'fled' : 'left'} ` },
      place(c.death.locationId, names),
      {
        text: c.death.cause.fled
          ? ' for distant lands with a price on their head, beyond the reach of the law, and was not heard of again.'
          : ' for distant lands, and was not heard of again.',
      },
    ]);
  } else if (c.death) {
    paragraphs.push([
      { text: `${c.givenName} ` },
      { text: 'died', mark: 'death' },
      { text: ` in ${whenIn(c.death.at)}, ` },
      ...causeOfDeath(c.death.cause, names),
      { text: ' in ' },
      place(c.death.locationId, names),
      { text: `, at level ${c.level}. ` },
      ...bodyOf(c, names),
    ]);
  }
  return paragraphs.map(trimEnd);
}

const YEAR = 360 * 86_400;

/** One step in someone's dealings with justice, told for their life story. */
function judgment(
  c: Character,
  j: Judgment,
  head: Judgment | undefined,
  turned: number,
  names: NameResolver,
  now: number | undefined,
  onTurn: () => void,
): Segment[] {
  const out: Segment[] = [];
  switch (j.kind) {
    case 'reformed':
      if (j.paid <= 0) {
        out.push(
          { text: `In ${whenIn(j.at)}, in ` },
          place(j.townId, names),
          { text: ', they ' },
          { text: 'gave up the outlaw life', mark: 'crime' },
          { text: ', with nothing anyone could pin on them. ' },
        );
        break;
      }
      out.push(
        { text: `In ${whenIn(j.at)} they went before the court of ` },
        place(j.townId, names),
        { text: ' and ' },
        { text: 'paid back what they took', mark: 'crime' },
        {
          text: `, ${j.paid} gold with interest and fines, and gave up the outlaw life; it would be a while before the towns trusted them again. `,
        },
      );
      break;
    case 'captured':
      out.push(
        { text: `In ${whenIn(j.at)} ` },
        person(j.byId, names),
        { text: ' ' },
        { text: 'took them alive', mark: 'crime' },
        { text: ' in ' },
        place(j.locationId, names),
        { text: j.how === 'trap' ? ', with a trap. ' : ', after beating them in a fight. ' },
      );
      break;
    case 'escaped':
      out.push(
        { text: 'They got away from ' },
        person(j.fromId, names),
        { text: ' in ' },
        place(j.locationId, names),
        { text: ', with nothing but the clothes on their back. ' },
      );
      break;
    case 'delivered':
      out.push(
        person(j.byId, names),
        { text: ' handed them over to the watch of ' },
        place(j.townId, names),
        { text: `, and was paid ${j.amount} gold for it. ` },
      );
      // Still waiting for the court.
      if (
        c.activity.kind === 'jailed' &&
        c.activity.sentence === 'trial' &&
        c.justice.at(-1) === j
      ) {
        out.push({
          text: `They wait in its jail for their trial, set for ${whenIn(c.activity.until)}. `,
        });
      }
      break;
    case 'sentenced': {
      const charges = chargesPhrase(j.charges);
      // Tried before: word of something worse brought them back to court.
      const again = c.justice.slice(0, c.justice.indexOf(j)).some((k) => k.kind === 'sentenced');
      out.push(
        { text: again ? 'When word of worse got out, they were tried again in ' : 'Tried in ' },
        place(j.townId, names),
        {
          text: again
            ? charges
              ? ` for ${charges}, and `
              : ', and '
            : charges
              ? ` for ${charges}, they were `
              : ', they were ',
        },
      );
      if (j.sentence === 'death') {
        out.push(
          { text: `sentenced ${SENTENCED_TO[j.method ?? 'hanging']}`, mark: 'death' },
          { text: '. ' },
        );
        break;
      }
      const years = Math.max(1, Math.round((j.until - j.at) / YEAR));
      out.push(
        { text: 'sentenced', mark: 'crime' },
        { text: ` to ${countWord(years)} ${years === 1 ? 'year' : 'years'} in prison` },
      );
      // Still inside: how long is left.
      const inside = c.activity.kind === 'jailed' && c.activity.since === j.at && now !== undefined;
      if (inside) {
        const left = Math.max(0, (j.until - now) / YEAR);
        out.push({
          text:
            left < 1
              ? ', and will be out within the year. '
              : `, and have ${countWord(Math.round(left))} ${Math.round(left) === 1 ? 'year' : 'years'} left to serve. `,
        });
      } else {
        out.push({ text: '. ' });
      }
      break;
    }
    case 'freed':
      out.push({ text: `They came out of the jail of ` }, place(j.townId, names), {
        text: ` in ${whenIn(j.at)}, no outlaw any more. `,
      });
      break;
    case 'head':
      out.push(person(j.byId, names), { text: ' took their head for the bounty' });
      if (!c.justice.some((k) => k.kind === 'claimed' || k.kind === 'lost')) {
        out.push({ text: '; it has yet to be claimed. ' });
      }
      break;
    case 'claimed':
      out.push(
        ...(head?.kind === 'head' && head.byId === j.byId
          ? [{ text: ', and' }]
          : [{ text: head ? ', and ' : '' }, person(j.byId, names)]),
        { text: ` claimed the ${j.amount}-gold bounty on it in ` },
        place(j.townId, names),
        { text: ` in ${whenIn(j.at)}. ` },
      );
      break;
    case 'lost':
      out.push({
        text: head
          ? ', but the head was lost before anyone could claim the bounty. '
          : 'Their head was lost before anyone could claim the bounty. ',
      });
      break;
    case 'turned':
      out.push(
        { text: `In ${whenIn(j.at)} they ` },
        { text: turned === 0 ? 'turned outlaw' : 'turned outlaw again', mark: 'crime' },
        { text: `${TURNED_FOR[j.reason]}. ` },
      );
      onTurn();
      break;
  }

  return out;
}

/** What became of a murder victim's body, and of the secret. */
function bodyOf(c: Character, names: NameResolver): Segment[] {
  const death = c.death;
  if (!death || death.cause.kind !== 'character' || !death.cause.murder) return [];
  const told: Segment[] = death.hidden
    ? [
        {
          text: 'Their killer hid the body, and it was never found; folk thought they had simply vanished, or left for distant lands.',
        },
      ]
    : [{ text: 'Their body was found where they fell.' }];
  if (death.pinnedAt !== undefined) {
    told.push(
      { text: ` In ${whenIn(death.pinnedAt)} word got out at last that ` },
      person(death.cause.characterId, names),
      { text: ' had killed them.' },
    );
  }
  return told;
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
