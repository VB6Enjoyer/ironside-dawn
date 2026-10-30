import { AFFIX_CHANCE, AFFIXES, creatureDef, spellDef, type CreatureId } from '../../content';
import { schedule } from '../core/scheduler';
import type { SimContext } from '../context';
import type {
  Character,
  Combatant,
  CreatureRef,
  DelveProgress,
  Encounter,
  EncounterId,
  FighterState,
  Location,
} from '../model';
import { adventurerFighter } from './condition';
import { fightOutcome, fightRound } from './combat-core';
import { die } from './death';
import { exitDelve, resumeDelve } from './delve';
import { weaponSkillOf } from './items';
import { rollLootItem } from './loot';
import { cast, chooseSpell, type SpellChoice } from './magic';
import { addDeed, gainXp, practice } from './progress';

/** Seconds between rounds: blows land a few seconds apart in real-time view. */
const ROUND_GAP: readonly [number, number] = [3, 6];
/** A fight this long ends with the adventurer breaking away. */
const MAX_ROUNDS = 40;
const XP_PER_CREATURE_LEVEL = 8;
/** Weapon skill practiced per swing, hit or miss. */
const WEAPON_PRACTICE = 0.1;
/** Kills of creatures this strong (or with an affix) are remembered as deeds. */
const MEMORABLE_LEVEL = 4;
/** Each chamber deeper raises the chance of an affix by this fraction. */
const AFFIX_DEPTH_BONUS = 0.15;

export function startFight(
  ctx: SimContext,
  character: Character,
  location: Location,
  delve: DelveProgress,
  species: CreatureId,
  count: number,
): void {
  const rng = ctx.rng.combat;
  const def = creatureDef(species);
  // Deeper chambers hold stranger, stronger things.
  const affixChance = Math.min(0.5, AFFIX_CHANCE * (1 + AFFIX_DEPTH_BONUS * (delve.room - 1)));
  const rolled = Array.from({ length: count }, () => {
    const affix = rng.chance(affixChance)
      ? rng.weighted(AFFIXES.map((a) => [a, a.weight] as const))
      : null;
    const hp = Math.max(1, Math.round(rng.roll(def.hp) * (affix?.hpMultiplier ?? 1)));
    const fighter: FighterState = {
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
    return { affix: affix?.id ?? null, fighter };
  });
  // Ordinals tell apart foes that would otherwise share a name ("the second skeleton").
  const foes = rolled.map(({ affix, fighter }, i) => {
    const twins = rolled.filter((r) => r.affix === affix);
    const ordinal =
      twins.length > 1 ? rolled.slice(0, i + 1).filter((r) => r.affix === affix).length : 0;
    const ref: CreatureRef = { species, affix, ordinal };
    return { ref, fighter };
  });

  const encounter: Encounter = {
    id: `e${ctx.world.nextEncounterNumber++}` as EncounterId,
    characterId: character.id,
    locationId: location.id,
    foes,
    round: 0,
    startedAt: ctx.world.time,
    quickened: null,
    ward: 0,
    spoils: { gold: 0, items: [] },
  };
  ctx.world.encounters.set(encounter.id, encounter);
  character.activity = { kind: 'fighting', encounterId: encounter.id, delve };

  ctx.emit(
    {
      type: 'combat.start',
      data: { characterId: character.id, locationId: location.id, foes: foes.map((f) => f.ref) },
    },
    [character.id],
    location.id,
  );
  scheduleRound(ctx, encounter);
}

export function runRound(ctx: SimContext, encounter: Encounter): void {
  const world = ctx.world;
  const character = world.characters.get(encounter.characterId)!;
  const activity = character.activity;
  if (activity.kind !== 'fighting') throw new Error(`${character.id} is not fighting`);

  // A spell instead of a swing, if the odds look good.
  const choice = chooseSpell(ctx, character, encounter);
  if (choice) {
    const result = cast(
      ctx,
      character,
      choice.spell,
      encounter.locationId,
      encounter,
      choice.target,
    );
    if (result.fatal) {
      world.encounters.delete(encounter.id);
      return;
    }
    applySpell(ctx, character, encounter, choice, result.amount);
  }

  const self = adventurerFighter(character, world.time, encounter);
  const fighters = [self, ...encounter.foes.map((f) => f.fighter)];
  const combatant = (index: number): Combatant =>
    index === 0
      ? { kind: 'character', id: character.id }
      : { kind: 'creature', ref: encounter.foes[index - 1]!.ref };

  encounter.round++;
  const actions =
    fightOutcome(fighters) === null
      ? fightRound(ctx.rng.combat, fighters, { adventurerActs: !choice })
      : [];
  character.hp = self.hp;
  character.stamina = self.stamina ?? character.stamina;
  encounter.ward = self.ward;

  let killer: CreatureRef | null = null;
  for (const action of actions) {
    if (action.kind === 'flee') {
      ctx.emit(
        { type: 'combat.flee', data: { who: combatant(action.who), success: action.success } },
        [character.id],
        encounter.locationId,
      );
      continue;
    }
    const target = fighters[action.target]!;
    ctx.emit(
      {
        type: 'combat.attack',
        data: {
          attacker: combatant(action.attacker),
          target: combatant(action.target),
          hit: action.hit,
          critical: action.critical,
          damage: action.damage,
          absorbed: action.absorbed,
          targetHp: action.targetHp,
          targetMaxHp: target.maxHp,
        },
      },
      [character.id],
      encounter.locationId,
    );
    if (action.attacker === 0) {
      const skill = weaponSkillOf(character.equipment.weapon);
      if (skill) practice(ctx, character, skill, WEAPON_PRACTICE, encounter.locationId);
    }
    if (action.targetHp > 0 || !action.hit) continue;
    if (action.target === 0) killer = encounter.foes[action.attacker - 1]!.ref;
    else slay(ctx, character, encounter, action.target - 1);
  }

  let outcome = fightOutcome(fighters);
  if (outcome === null && encounter.round >= MAX_ROUNDS) outcome = 'fled';

  switch (outcome) {
    case null:
      scheduleRound(ctx, encounter);
      return;
    case 'won':
      win(ctx, character, encounter, activity.delve);
      return;
    case 'lost':
      world.encounters.delete(encounter.id);
      die(ctx, character, { kind: 'creature', creature: killer! });
      return;
    case 'fled':
      world.encounters.delete(encounter.id);
      ctx.emit(
        {
          type: 'combat.escape',
          data: {
            characterId: character.id,
            locationId: encounter.locationId,
            hp: character.hp,
            maxHp: character.maxHp,
          },
        },
        [character.id],
        encounter.locationId,
      );
      exitDelve(ctx, character, activity.delve, true);
      return;
  }
}

function slay(ctx: SimContext, character: Character, encounter: Encounter, foeIndex: number): void {
  const foe = encounter.foes[foeIndex]!;
  const species = foe.ref.species;
  const def = creatureDef(species);

  const dungeon = ctx.world.locations.get(encounter.locationId)?.dungeon;
  if (dungeon) dungeon.population[species] = Math.max(0, (dungeon.population[species] ?? 0) - 1);
  character.kills[species] = (character.kills[species] ?? 0) + 1;
  if (def.level >= MEMORABLE_LEVEL || foe.ref.affix) {
    addDeed(character, { kind: 'slay', at: ctx.world.time, creature: foe.ref });
  }

  const rng = ctx.rng.loot;
  if (def.gold && rng.chance(def.gold.chance)) encounter.spoils.gold += rng.roll(def.gold.dice);
  for (const drop of def.drops) {
    if (rng.chance(drop.chance)) encounter.spoils.items.push(rollLootItem(rng, drop.loot));
  }

  ctx.emit(
    {
      type: 'combat.kill',
      data: { characterId: character.id, locationId: encounter.locationId, foe: foe.ref },
    },
    [character.id],
    encounter.locationId,
  );
  const xp = Math.round(def.level * XP_PER_CREATURE_LEVEL * (foe.ref.affix ? 1.5 : 1));
  gainXp(ctx, character, xp, encounter.locationId);
}

/** Puts a cast spell's effect into the fight. */
function applySpell(
  ctx: SimContext,
  character: Character,
  encounter: Encounter,
  choice: SpellChoice,
  amount: number,
): void {
  if (amount <= 0) return;
  const effect = spellDef(choice.spell).effect;
  switch (effect.kind) {
    case 'damage': {
      const foe = encounter.foes[choice.target!]!;
      foe.fighter.hp = Math.max(0, foe.fighter.hp - amount);
      if (foe.fighter.hp === 0) {
        foe.fighter.out = 'dead';
        slay(ctx, character, encounter, choice.target!);
      }
      return;
    }
    case 'heal':
      character.hp = Math.min(character.maxHp, character.hp + amount);
      return;
    case 'quicken':
      encounter.quickened = { attack: amount, defense: amount };
      return;
    case 'ward':
      encounter.ward += amount;
      return;
  }
}

function win(ctx: SimContext, character: Character, encounter: Encounter, delve: DelveProgress) {
  ctx.world.encounters.delete(encounter.id);
  const { gold, items } = encounter.spoils;
  character.gold += gold;
  character.goldEarned += gold;
  character.pack.push(...items);

  ctx.emit(
    {
      type: 'combat.victory',
      data: {
        characterId: character.id,
        locationId: encounter.locationId,
        foes: encounter.foes.map((f) => f.ref),
        hp: character.hp,
        maxHp: character.maxHp,
        gold,
        items,
      },
    },
    [character.id],
    encounter.locationId,
  );
  resumeDelve(ctx, character, {
    ...delve,
    goldFound: delve.goldFound + gold,
    itemsFound: delve.itemsFound + items.length,
  });
}

function scheduleRound(ctx: SimContext, encounter: Encounter): void {
  const gap = ctx.rng.combat.int(...ROUND_GAP);
  schedule(ctx.world.scheduler, ctx.world.time + gap, {
    kind: 'combat.round',
    encounterId: encounter.id,
  });
}
