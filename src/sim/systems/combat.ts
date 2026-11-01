import { AFFIX_CHANCE, AFFIXES, creatureDef, spellDef, type CreatureId } from '../../content';
import { schedule } from '../core/scheduler';
import { MINUTE } from '../core/time';
import type { SimContext } from '../context';
import type {
  Character,
  CharacterId,
  Combatant,
  CreatureRef,
  DelveProgress,
  Encounter,
  EncounterId,
  FighterState,
  Herd,
  Location,
  Side,
} from '../model';
import { fightRound, fightWinner, type FightAction } from './combat-core';
import { adventurerFighter } from './condition';
import { die } from './death';
import { dreadFell, dreadKilled } from './dread';
import { exitDelve, resumeDelve } from './delve';
import { weaponSkillOf } from './items';
import { mint } from './ledger';
import { rollLootItem } from './loot';
import { cast, chooseSpell, type SpellChoice } from './magic';
import { nudgeTrait, remember, satisfy } from './mind';
import { onCharacterKilled } from './outlaws';
import { endRaid } from './raids';
import { adjustOpinion, partyOf } from './social';
import { addDeed, gainXp, practice } from './progress';
import { cancelWake, wakeAt } from './wake';
import { moveTo } from './whereabouts';

/**
 * Fights between two sides (ROADMAP.md Phases 2 and 5): a party against a
 * dungeon's creatures, outlaws against travelers, hunters against an outlaw.
 * Each round is its own scheduled job, a few in-game seconds apart.
 */

/** Seconds between rounds: blows land a few seconds apart in real-time view. */
const ROUND_GAP: readonly [number, number] = [3, 6];
/** A fight this long ends with side 0 breaking away. */
const MAX_ROUNDS = 40;
const XP_PER_CREATURE_LEVEL = 8;
/** Party members who didn't land the killing blow still learn something. */
const PARTY_XP_SHARE = 0.5;
/** Weapon skill practiced per swing, hit or miss. */
const WEAPON_PRACTICE = 0.1;
/** Kills of creatures this strong (or with an affix) are remembered as deeds. */
const MEMORABLE_LEVEL = 4;
/** Below this fraction of hit points, surviving a fight is remembered as a near-death. */
const NEAR_DEATH = 0.2;
const GLORY_PER_KILL_LEVEL = 0.02;
/** Each chamber deeper raises the chance of an affix by this fraction. */
const AFFIX_DEPTH_BONUS = 0.15;

/** A party, led by `leaderId`, meets creatures in a dungeon chamber. */
/** Below this share of their health, a fighter drinks a healing draught. */
const POTION_BELOW = 0.35;
/** A draught restores this share of health. */
const POTION_HEALS = 0.35;

export function startDelveFight(
  ctx: SimContext,
  party: readonly Character[],
  location: Location,
  delve: { readonly leaderId: CharacterId; readonly progress: DelveProgress },
  species: CreatureId,
  count: number,
  /** One of the dread, met in its lair with `species` at its side. */
  master: Character | null = null,
): void {
  // Deeper chambers hold stranger, stronger things.
  const room = delve.progress.room;
  const affixChance = Math.min(0.5, AFFIX_CHANCE * (1 + AFFIX_DEPTH_BONUS * (room - 1)));
  startCreatureFight(
    ctx,
    'delve',
    party,
    location,
    [{ species, count }],
    { locationId: location.id, pool: 'dungeon' },
    { delve, affixChance, leaders: master ? [master] : [] },
  );
}

/** Creatures of one kind, so many of them. */
export interface Horde {
  readonly species: CreatureId;
  readonly count: number;
}

/**
 * Characters against creatures (and maybe the dread who leads them): a delve,
 * beasts on the road, a raid on a town, a lord's patrol.
 */
export function startCreatureFight(
  ctx: SimContext,
  kind: 'delve' | 'waylay' | 'raid' | 'patrol',
  sideZero: readonly Character[],
  location: Location,
  hordes: readonly Horde[],
  herd: Herd | null,
  options: {
    readonly delve?: Encounter['delve'];
    readonly affixChance?: number;
    readonly leaders?: readonly Character[];
  } = {},
): void {
  const rng = ctx.rng.combat;
  const affixChance = options.affixChance ?? AFFIX_CHANCE;
  const rolled = hordes.flatMap(({ species, count }) => {
    const def = creatureDef(species);
    return Array.from({ length: count }, () => {
      const affix = rng.chance(affixChance)
        ? rng.weighted(AFFIXES.map((a) => [a, a.weight] as const))
        : null;
      const hp = Math.max(1, Math.round(rng.roll(def.hp) * (affix?.hpMultiplier ?? 1)));
      const fighter: FighterState = {
        side: 1,
        attack: def.attack + (affix?.attack ?? 0),
        damage: def.damage,
        damageBonus: affix?.damageBonus ?? 0,
        defense: def.defense + (affix?.defense ?? 0),
        agility: def.agility + (affix?.agility ?? 0),
        fleeBelow: def.fleeBelow,
        hp,
        maxHp: hp,
        stamina: null,
        ward: 0,
        out: null,
      };
      return { species, affix: affix?.id ?? null, fighter };
    });
  });
  // Ordinals tell apart foes that would otherwise share a name ("the second skeleton").
  const creatures = rolled.map(({ species, affix, fighter }, i) => {
    const same = (r: (typeof rolled)[number]) => r.species === species && r.affix === affix;
    const twins = rolled.filter(same).length;
    const ordinal = twins > 1 ? rolled.slice(0, i + 1).filter(same).length : 0;
    const ref: CreatureRef = { species, affix, ordinal };
    return { ref, fighter };
  });

  const encounter = createEncounter(
    ctx,
    kind,
    location,
    [
      { characters: sideZero.map((c) => c.id), creatures: [] },
      { characters: (options.leaders ?? []).map((c) => c.id), creatures },
    ],
    options.delve ?? null,
    herd,
  );
  begin(ctx, encounter);
}

/** Characters against characters: an ambush on the road, or hunters finding their quarry. */
export function startBrawl(
  ctx: SimContext,
  kind: 'ambush' | 'hunt',
  sideZero: readonly Character[],
  sideOne: readonly Character[],
  location: Location,
): void {
  const encounter = createEncounter(ctx, kind, location, [
    { characters: sideZero.map((c) => c.id), creatures: [] },
    { characters: sideOne.map((c) => c.id), creatures: [] },
  ]);
  begin(ctx, encounter);
}

function createEncounter(
  ctx: SimContext,
  kind: Encounter['kind'],
  location: Location,
  sides: Encounter['sides'],
  delve: Encounter['delve'] = null,
  herd: Herd | null = null,
): Encounter {
  return {
    id: `e${ctx.world.nextEncounterNumber++}` as EncounterId,
    kind,
    locationId: location.id,
    sides,
    round: 0,
    startedAt: ctx.world.time,
    out: {},
    quickened: {},
    wards: {},
    delve,
    spoils: { gold: 0, items: [] },
    herd,
  };
}

function begin(ctx: SimContext, encounter: Encounter): void {
  ctx.world.encounters.set(encounter.id, encounter);
  for (const side of encounter.sides) {
    for (const id of side.characters) {
      const c = ctx.world.characters.get(id)!;
      c.activity = { kind: 'fighting', encounterId: encounter.id };
      moveTo(ctx.world, c, encounter.locationId);
      cancelWake(c);
    }
  }
  const [zero, one] = encounter.sides;
  ctx.emit(
    {
      type: 'combat.start',
      data: {
        characterId: zero.characters[0]!,
        characterIds: zero.characters,
        locationId: encounter.locationId,
        foes: [
          ...one.characters.map((id): Combatant => ({ kind: 'character', id })),
          ...one.creatures.map((c): Combatant => ({ kind: 'creature', ref: c.ref })),
        ],
        kind: encounter.kind,
      },
    },
    [...zero.characters, ...one.characters],
    encounter.locationId,
  );
  scheduleRound(ctx, encounter);
}

/** A combatant's place in this round: a character, or a creature on a side. */
type Slot =
  | { readonly kind: 'character'; readonly id: CharacterId; readonly side: Side }
  | { readonly kind: 'creature'; readonly side: Side; readonly index: number };

export function runRound(ctx: SimContext, encounter: Encounter): void {
  const world = ctx.world;
  const characterOf = (id: CharacterId) => world.characters.get(id)!;
  const everyone = encounter.sides.flatMap((side) => side.characters);
  const actors = [...everyone];
  const isIn = (id: CharacterId) => !encounter.out[id];

  // Spells first: a caster who casts doesn't swing this round.
  const casters = new Set<CharacterId>();
  for (const sideIndex of [0, 1] as const) {
    for (const id of encounter.sides[sideIndex].characters) {
      if (!isIn(id)) continue;
      const caster = characterOf(id);
      const enemies = enemySlots(encounter, sideIndex)
        .map((slot) => ({ slot, ...vitals(world, encounter, slot) }))
        .filter((e) => e.hp > 0);
      if (enemies.length === 0) break;
      const choice = chooseSpell(ctx, caster, {
        round: encounter.round,
        warded: (encounter.wards[id] ?? 0) > 0,
        quickened: Boolean(encounter.quickened[id]),
        enemies: enemies.map((e) => ({
          target: combatantOf(encounter, e.slot),
          hp: e.hp,
          level: e.level,
        })),
      });
      if (!choice) continue;
      casters.add(id);
      const result = cast(ctx, caster, choice.spell, encounter.locationId, choice.target);
      if (result.fatal) {
        encounter.out[id] = 'dead';
        continue;
      }
      applySpell(ctx, caster, encounter, choice, result.amount, sideIndex);
    }
  }

  // The badly hurt drink a healing draught, if they have one; it takes their turn.
  for (const id of everyone) {
    if (!isIn(id) || casters.has(id)) continue;
    const c = characterOf(id);
    if (c.potions <= 0 || c.hp >= c.maxHp * POTION_BELOW) continue;
    c.potions--;
    c.hp = Math.min(c.maxHp, c.hp + Math.round(c.maxHp * POTION_HEALS));
    casters.add(id);
    ctx.emit(
      {
        type: 'item.potion',
        data: { characterId: id, locationId: encounter.locationId, hp: c.hp, maxHp: c.maxHp },
      },
      [id],
      encounter.locationId,
    );
  }

  // Then everyone still standing fights.
  const slots: Slot[] = [];
  const fighters: FighterState[] = [];
  const idle = new Set<number>();
  for (const sideIndex of [0, 1] as const) {
    const side = encounter.sides[sideIndex];
    const enemiesStanding = enemySlots(encounter, sideIndex).length;
    for (const id of side.characters) {
      if (!isIn(id)) continue;
      if (casters.has(id)) idle.add(fighters.length);
      slots.push({ kind: 'character', id, side: sideIndex });
      fighters.push(
        adventurerFighter(characterOf(id), world.time, encounter, sideIndex, enemiesStanding),
      );
    }
    side.creatures.forEach((creature, index) => {
      if (creature.fighter.out !== null) return;
      slots.push({ kind: 'creature', side: sideIndex, index });
      fighters.push(creature.fighter);
    });
  }

  encounter.round++;
  const actions =
    fightWinner(fighters) === null
      ? fightRound(ctx.rng.combat, fighters, {
          idle,
          // Hunted outlaws are cornered.
          cornered: encounter.kind === 'hunt' ? 1 : null,
        })
      : [];

  // Bring the characters' bodies up to date.
  slots.forEach((slot, i) => {
    if (slot.kind !== 'character') return;
    const c = characterOf(slot.id);
    const f = fighters[i]!;
    c.hp = f.hp;
    c.stamina = f.stamina ?? c.stamina;
    encounter.wards[slot.id] = f.ward;
  });

  for (const action of actions) {
    if (action.kind === 'flee') {
      const slot = slots[action.who]!;
      ctx.emit(
        {
          type: 'combat.flee',
          data: { who: combatantOf(encounter, slot), success: action.success },
        },
        actors.filter((id) => encounter.out[id] !== 'dead'),
        encounter.locationId,
      );
      if (action.success && slot.kind === 'character') {
        encounter.out[slot.id] = 'fled';
        const c = characterOf(slot.id);
        ctx.emit(
          {
            type: 'combat.escape',
            data: {
              characterId: c.id,
              locationId: encounter.locationId,
              hp: c.hp,
              maxHp: c.maxHp,
            },
          },
          [c.id],
          encounter.locationId,
        );
      }
      continue;
    }
    reportAttack(ctx, encounter, slots, fighters, action, actors);
  }

  let winner = fightWinner(fighters);
  if (winner === null && encounter.round >= MAX_ROUNDS) {
    // Too long: side 0 breaks away.
    for (const id of encounter.sides[0].characters) {
      if (!isIn(id)) continue;
      encounter.out[id] = 'fled';
      const c = characterOf(id);
      ctx.emit(
        {
          type: 'combat.escape',
          data: { characterId: id, locationId: encounter.locationId, hp: c.hp, maxHp: c.maxHp },
        },
        [id],
        encounter.locationId,
      );
    }
    winner = 1;
  }
  if (winner === null) {
    scheduleRound(ctx, encounter);
    return;
  }
  end(ctx, encounter, winner === 'none' ? null : winner);
}

function reportAttack(
  ctx: SimContext,
  encounter: Encounter,
  slots: readonly Slot[],
  fighters: readonly FighterState[],
  action: Extract<FightAction, { kind: 'attack' }>,
  actors: readonly CharacterId[],
): void {
  const world = ctx.world;
  const attacker = slots[action.attacker]!;
  const target = slots[action.target]!;
  ctx.emit(
    {
      type: 'combat.attack',
      data: {
        attacker: combatantOf(encounter, attacker),
        target: combatantOf(encounter, target),
        hit: action.hit,
        critical: action.critical,
        damage: action.damage,
        absorbed: action.absorbed,
        targetHp: action.targetHp,
        targetMaxHp: fighters[action.target]!.maxHp,
      },
    },
    actors.filter((id) => encounter.out[id] !== 'dead'),
    encounter.locationId,
  );
  if (attacker.kind === 'character') {
    const c = world.characters.get(attacker.id)!;
    const skill = weaponSkillOf(c.equipment.weapon);
    if (skill) practice(ctx, c, skill, WEAPON_PRACTICE, encounter.locationId);
  }
  if (!action.hit || action.targetHp > 0) return;

  if (target.kind === 'creature') {
    if (attacker.kind === 'character') {
      slay(ctx, world.characters.get(attacker.id)!, encounter, target.side, target.index);
    }
    return;
  }
  const victim = world.characters.get(target.id)!;
  encounter.out[victim.id] = 'dead';
  if (attacker.kind === 'creature') {
    const ref = encounter.sides[attacker.side].creatures[attacker.index]!.ref;
    die(ctx, victim, { kind: 'creature', creature: ref });
  } else {
    killCharacter(ctx, victim, world.characters.get(attacker.id)!, encounter);
  }
}

/** One character kills another: the killer takes their purse, and the law takes note. */
function killCharacter(
  ctx: SimContext,
  victim: Character,
  killer: Character,
  encounter: Encounter,
): void {
  killer.gold += victim.gold;
  victim.gold = 0;
  killer.slain++;
  // Those who stood with the killer share in destroying one of the dread.
  const side = encounter.sides.find((s) => s.characters.includes(killer.id));
  const slayers = (side?.characters ?? [])
    .filter((id) => encounter.out[id] !== 'dead')
    .map((id) => ctx.world.characters.get(id)!);
  die(ctx, victim, { kind: 'character', characterId: killer.id });
  onCharacterKilled(ctx, victim, killer);
  if (killer.calling === 'dread') dreadKilled(ctx, killer, victim, encounter.locationId);
  if (victim.calling === 'dread') dreadFell(ctx, victim, slayers, encounter.locationId);
}

function slay(
  ctx: SimContext,
  killer: Character,
  encounter: Encounter,
  side: Side,
  index: number,
): void {
  const foe = encounter.sides[side].creatures[index]!;
  const species = foe.ref.species;
  const def = creatureDef(species);

  thinHerd(ctx, encounter, species);
  killer.kills[species] = (killer.kills[species] ?? 0) + 1;
  if (def.level >= MEMORABLE_LEVEL || foe.ref.affix) {
    addDeed(killer, { kind: 'slay', at: ctx.world.time, creature: foe.ref });
  }

  const rng = ctx.rng.loot;
  if (def.gold && rng.chance(def.gold.chance)) encounter.spoils.gold += rng.roll(def.gold.dice);
  for (const drop of def.drops) {
    if (rng.chance(drop.chance)) encounter.spoils.items.push(rollLootItem(rng, drop.loot));
  }

  ctx.emit(
    {
      type: 'combat.kill',
      data: { characterId: killer.id, locationId: encounter.locationId, foe: foe.ref },
    },
    [killer.id],
    encounter.locationId,
  );
  const xp = Math.round(def.level * XP_PER_CREATURE_LEVEL * (foe.ref.affix ? 1.5 : 1));
  const killerSide = side === 0 ? 1 : 0;
  for (const id of encounter.sides[killerSide].characters) {
    if (encounter.out[id]) continue;
    const c = ctx.world.characters.get(id)!;
    gainXp(ctx, c, id === killer.id ? xp : Math.round(xp * PARTY_XP_SHARE), encounter.locationId);
  }
  satisfy(killer, 'glory', GLORY_PER_KILL_LEVEL * def.level);
}

/** One fewer of the creatures where they came from. */
function thinHerd(ctx: SimContext, encounter: Encounter, species: CreatureId): void {
  const herd = encounter.herd;
  const place = herd ? ctx.world.locations.get(herd.locationId) : undefined;
  if (!herd || !place) return;
  if (herd.pool === 'garrison') {
    if (place.fortress) place.fortress.garrison = Math.max(0, place.fortress.garrison - 1);
    return;
  }
  const pool = herd.pool === 'dungeon' ? place.dungeon?.population : place.roaming;
  if (!pool) return;
  const left = Math.max(0, (pool[species] ?? 0) - 1);
  if (left > 0 || herd.pool === 'dungeon') pool[species] = left;
  else delete pool[species];
}

/** Puts a cast spell's effect into the fight. */
function applySpell(
  ctx: SimContext,
  caster: Character,
  encounter: Encounter,
  choice: SpellChoice,
  amount: number,
  casterSide: Side,
): void {
  if (amount <= 0) return;
  const effect = spellDef(choice.spell).effect;
  switch (effect.kind) {
    case 'damage': {
      const target = choice.target;
      if (!target) return;
      if (target.kind === 'creature') {
        const enemySide = encounter.sides[casterSide === 0 ? 1 : 0];
        const index = enemySide.creatures.findIndex((c) => sameRef(c.ref, target.ref));
        const foe = enemySide.creatures[index];
        if (!foe) return;
        foe.fighter.hp = Math.max(0, foe.fighter.hp - amount);
        if (foe.fighter.hp === 0) {
          foe.fighter.out = 'dead';
          slay(ctx, caster, encounter, casterSide === 0 ? 1 : 0, index);
        }
      } else {
        const victim = ctx.world.characters.get(target.id)!;
        victim.hp = Math.max(0, victim.hp - amount);
        if (victim.hp === 0) {
          encounter.out[victim.id] = 'dead';
          killCharacter(ctx, victim, caster, encounter);
        }
      }
      return;
    }
    case 'heal':
      caster.hp = Math.min(caster.maxHp, caster.hp + amount);
      return;
    case 'quicken':
      encounter.quickened[caster.id] = { attack: amount, defense: amount };
      return;
    case 'ward':
      encounter.wards[caster.id] = (encounter.wards[caster.id] ?? 0) + amount;
      return;
  }
}

/** The fight is over. `winner` is the side left standing, or null if nobody is. */
function end(ctx: SimContext, encounter: Encounter, winner: Side | null): void {
  const world = ctx.world;
  world.encounters.delete(encounter.id);
  const now = world.time;
  const alive = (id: CharacterId) => encounter.out[id] !== 'dead';
  const standingOn = (side: Side) =>
    encounter.sides[side].characters.filter((id) => !encounter.out[id]);

  // Everyone who lived remembers it.
  for (const side of [0, 1] as const) {
    for (const id of encounter.sides[side].characters) {
      if (!alive(id)) continue;
      const c = world.characters.get(id)!;
      rememberFight(ctx, c, encounter, side, encounter.out[id] === 'fled' ? 'fled' : 'won');
    }
  }

  if (encounter.kind === 'delve' && encounter.delve) {
    const { leaderId } = encounter.delve;
    const standing = standingOn(0).map((id) => world.characters.get(id)!);
    const lowest = Math.min(
      encounter.delve.progress.lowestHp,
      ...encounter.sides[0].characters
        .filter(alive)
        .map((id) => world.characters.get(id)!)
        .map((c) => c.hp / c.maxHp),
    );
    let progress: DelveProgress = { ...encounter.delve.progress, lowestHp: lowest };

    if (winner === 0) {
      // The spoils go to whoever leads now, to share out at the end.
      const holder = standing.find((c) => c.id === leaderId) ?? standing[0]!;
      const { gold, items } = encounter.spoils;
      holder.gold += gold;
      holder.goldEarned += gold;
      mint(world, 'treasure', gold);
      holder.pack.push(...items);
      ctx.emit(
        {
          type: 'combat.victory',
          data: {
            characterId: holder.id,
            characterIds: standing.map((c) => c.id),
            locationId: encounter.locationId,
            foes: encounter.sides[1].creatures.map((c): Combatant => ({
              kind: 'creature',
              ref: c.ref,
            })),
            hp: holder.hp,
            maxHp: holder.maxHp,
            gold,
            items,
          },
        },
        standing.map((c) => c.id),
        encounter.locationId,
      );
      progress = {
        ...progress,
        goldFound: progress.goldFound + gold,
        itemsFound: progress.itemsFound + items.length,
        valueFound: progress.valueFound + items.reduce((sum, i) => sum + i.value, 0),
      };
    }

    // The dread in its lair, if it lives, goes back to brooding.
    for (const id of encounter.sides[1].characters) {
      if (alive(id)) settleAfterFight(ctx, world.characters.get(id)!);
    }
    const leaderStanding = standing.some((c) => c.id === leaderId);
    for (const id of encounter.sides[0].characters) {
      if (!alive(id)) continue;
      const c = world.characters.get(id)!;
      if (id === leaderId) {
        if (winner === 0 && leaderStanding) resumeDelve(ctx, c, progress);
        else exitDelve(ctx, c, progress, encounter.out[id] === 'fled');
      } else if (
        winner === 0 &&
        leaderStanding &&
        !encounter.out[id] &&
        partyOf(ctx, c)?.leaderId === leaderId
      ) {
        c.activity = { kind: 'accompanying', leaderId };
      } else {
        // Fled, or the leader is gone: out of the dungeon on their own.
        c.activity = { kind: 'idle' };
        wakeAt(ctx, c, now + MINUTE);
      }
    }
    return;
  }

  // Everywhere else, survivors pick up their lives where they are. A hunt,
  // won or not, scratches the same itch as a delve.
  for (const id of everyoneIn(encounter)) {
    if (!alive(id)) continue;
    const c = world.characters.get(id)!;
    if (encounter.kind === 'hunt') satisfy(c, 'purpose', 0.6);
    if (settleAfterFight(ctx, c)) continue;
    c.activity = { kind: 'idle' };
    moveTo(world, c, encounter.locationId);
    wakeAt(ctx, c, now + MINUTE);
  }
  // Beaten creatures leave what they carried to the winners.
  const { gold, items } = encounter.spoils;
  const keeper = winner === 0 ? standingOn(0).map((id) => world.characters.get(id)!)[0] : undefined;
  if (keeper && (gold > 0 || items.length > 0)) {
    keeper.gold += gold;
    keeper.goldEarned += gold;
    mint(world, 'treasure', gold);
    keeper.pack.push(...items);
  }
  if (encounter.kind === 'raid') endRaid(ctx, encounter, winner);
  if (winner !== null) {
    const winners = standingOn(winner).map((id) => world.characters.get(id)!);
    const foes = encounter.sides[winner === 0 ? 1 : 0].characters.map((id): Combatant => ({
      kind: 'character',
      id,
    }));
    const first = winners[0];
    if (first) {
      ctx.emit(
        {
          type: 'combat.victory',
          data: {
            characterId: first.id,
            characterIds: winners.map((c) => c.id),
            locationId: encounter.locationId,
            foes: [
              ...foes,
              ...encounter.sides[winner === 0 ? 1 : 0].creatures.map((c): Combatant => ({
                kind: 'creature',
                ref: c.ref,
              })),
            ],
            hp: first.hp,
            maxHp: first.maxHp,
            gold: winner === 0 ? gold : 0,
            items: winner === 0 ? items : [],
          },
        },
        winners.map((c) => c.id),
        encounter.locationId,
      );
    }
  }
}

/**
 * Those who don't decide moment to moment go back to their lives: townsfolk
 * and lords to living, the dread to their lairs. Returns false for everyone
 * else, who decide what next.
 */
function settleAfterFight(ctx: SimContext, c: Character): boolean {
  switch (c.calling) {
    case 'townsfolk':
    case 'child':
    case 'lord':
      c.activity = { kind: 'living' };
      cancelWake(c);
      return true;
    case 'dread':
      c.activity = { kind: 'living' };
      cancelWake(c);
      moveTo(ctx.world, c, c.homeId);
      return true;
    default:
      return false;
  }
}

/**
 * Fights leave marks: a close call is remembered and makes a character warier;
 * besting something fearsome makes them bolder; fleeing stings. Being set
 * upon by other people is remembered as a wrong.
 */
function rememberFight(
  ctx: SimContext,
  character: Character,
  encounter: Encounter,
  side: Side,
  outcome: 'won' | 'fled',
): void {
  const now = ctx.world.time;
  const locationId = encounter.locationId;
  const enemies = encounter.sides[side === 0 ? 1 : 0];
  if (character.hp < character.maxHp * NEAR_DEATH) {
    const creature = enemies.creatures[0]?.ref ?? null;
    remember(character, now, { kind: 'near-death', locationId, creature }, 0.9);
    nudgeTrait(character, 'bravery', -0.03);
  }
  // Being set upon by people is remembered as a wrong: by travelers ambushed,
  // and by outlaws run to ground. A hunter who comes away empty-handed
  // is less keen to try again.
  if ((encounter.kind === 'ambush' && side === 0) || (encounter.kind === 'hunt' && side === 1)) {
    for (const id of enemies.characters) {
      remember(character, now, { kind: 'wronged', characterId: id, locationId }, 0.8);
    }
  }
  if (encounter.kind === 'hunt' && side === 0) {
    for (const id of enemies.characters) {
      if (encounter.out[id] === 'dead') continue;
      const opinion = adjustOpinion(character, id, {}, now);
      opinion.hunted = (opinion.hunted ?? 0) + 1;
    }
  }
  if (outcome === 'fled') {
    if (enemies.creatures.length > 0) {
      const creatures = enemies.creatures.map((f) => f.ref);
      remember(character, now, { kind: 'fled', locationId, creatures }, 0.6);
    }
    nudgeTrait(character, 'bravery', -0.01);
    return;
  }
  const fearsome = enemies.creatures.find(
    (f) => creatureDef(f.ref.species).level >= MEMORABLE_LEVEL || f.ref.affix,
  );
  if (fearsome) {
    remember(character, now, { kind: 'triumph', locationId, creature: fearsome.ref }, 0.7);
    nudgeTrait(character, 'bravery', 0.01);
  }
}

function everyoneIn(encounter: Encounter): CharacterId[] {
  return encounter.sides.flatMap((side) => side.characters);
}

function enemySlots(encounter: Encounter, side: Side): Slot[] {
  const enemy: Side = side === 0 ? 1 : 0;
  const slots: Slot[] = encounter.sides[enemy].characters
    .filter((id) => !encounter.out[id])
    .map((id) => ({ kind: 'character', id, side: enemy }));
  encounter.sides[enemy].creatures.forEach((c, index) => {
    if (c.fighter.out === null) slots.push({ kind: 'creature', side: enemy, index });
  });
  return slots;
}

/** Hit points, and a rough level comparable to a creature's, for spell choice. */
function vitals(
  world: SimContext['world'],
  encounter: Encounter,
  slot: Slot,
): { hp: number; level: number } {
  if (slot.kind === 'character') {
    const c = world.characters.get(slot.id)!;
    return { hp: c.hp, level: 1 + c.level / 2 };
  }
  const creature = encounter.sides[slot.side].creatures[slot.index]!;
  return { hp: creature.fighter.hp, level: creatureDef(creature.ref.species).level };
}

function combatantOf(encounter: Encounter, slot: Slot): Combatant {
  return slot.kind === 'character'
    ? { kind: 'character', id: slot.id }
    : { kind: 'creature', ref: encounter.sides[slot.side].creatures[slot.index]!.ref };
}

function sameRef(a: CreatureRef, b: CreatureRef): boolean {
  return a.species === b.species && a.affix === b.affix && a.ordinal === b.ordinal;
}

function scheduleRound(ctx: SimContext, encounter: Encounter): void {
  const gap = ctx.rng.combat.int(...ROUND_GAP);
  schedule(ctx.world.scheduler, ctx.world.time + gap, {
    kind: 'combat.round',
    encounterId: encounter.id,
  });
}
