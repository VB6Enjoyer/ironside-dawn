import { useEffect } from 'react';

import { creatureDef, SKILLS, STATS, type CreatureId, type StatId } from '../../content';
import {
  conditionsOf,
  roleOf,
  statValue,
  xpForLevel,
  type Character,
  type Item,
  type CharacterId,
  type SimEvent,
  type World,
} from '../../sim';
import {
  braveryWord,
  anItem,
  describeActivity,
  describeDeed,
  describeEvent,
  formatTimestamp,
  lootList,
  SKILL_NAMES,
  SPECIES_NAMES,
  spellName,
  type NameResolver,
} from '../../text';
import { formatCount } from '../format';
import { Prose } from './Prose';

const STAT_LABELS: Record<StatId, string> = {
  might: 'Might',
  agility: 'Agility',
  toughness: 'Toughness',
  wits: 'Wits',
  spirit: 'Spirit',
  presence: 'Presence',
};

const RECENT_EVENTS = 8;

interface Props {
  world: World;
  characterId: CharacterId;
  /** The host's log, for recent events. Changes whenever the world moves on. */
  log: readonly SimEvent[];
  names: NameResolver;
  onSelect(id: CharacterId): void;
  onClose(): void;
}

export function CharacterCard({ world, characterId, log, names, onSelect, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const character = world.characters.get(characterId);
  if (!character) return null;

  const home = world.locations.get(character.homeId);
  const species = SPECIES_NAMES[character.species].singular;
  const dead = character.death !== null;
  const recent = recentEvents(log, characterId);

  return (
    <aside className="character-card" aria-label={`${character.givenName} ${character.familyName}`}>
      <header className="card-header">
        <div>
          <h2>
            {character.givenName} {character.familyName}
          </h2>
          <p className="card-subtitle">
            Level {character.level} {roleOf(character)} · {species} of {home?.name ?? 'nowhere'}
            {character.gifted && ' · gifted'}
          </p>
        </div>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <p className={`card-status${dead ? ' card-status-dead' : ''}`}>
        <Prose segments={describeActivity(character, world)} />
        {dead && character.death && <> · {formatTimestamp(character.death.at)}</>}
      </p>

      {!dead && (
        <section className="card-section" aria-label="Condition">
          <Bar label="Health" value={character.hp} max={character.maxHp} kind="hp" />
          <Bar
            label="Stamina"
            value={character.stamina}
            max={character.maxStamina}
            kind="stamina"
          />
          <Bar
            label="Experience"
            value={character.xp - xpForLevel(character.level)}
            max={xpForLevel(character.level + 1) - xpForLevel(character.level)}
            kind="xp"
          />
          <Conditions character={character} now={world.time} />
        </section>
      )}

      <section className="card-section">
        <h3>Attributes</h3>
        <dl className="stat-grid">
          {STATS.map((stat) => (
            <div key={stat}>
              <dt>{STAT_LABELS[stat]}</dt>
              <dd>
                {statValue(character, stat)}
                {statValue(character, stat) !== character.stats[stat] && (
                  <span className="muted"> ({character.stats[stat]})</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card-section">
        <h3>Equipment</h3>
        <dl className="facts">
          <dt>Weapon</dt>
          <dd>
            <ItemName item={character.equipment.weapon} />
          </dd>
          <dt>Armor</dt>
          <dd>
            {character.equipment.armor ? (
              <ItemName item={character.equipment.armor} />
            ) : (
              <span className="muted">none</span>
            )}
          </dd>
          <dt>Trinket</dt>
          <dd>
            {character.equipment.trinket ? (
              <ItemName item={character.equipment.trinket} />
            ) : (
              <span className="muted">none</span>
            )}
          </dd>
        </dl>
      </section>

      <section className="card-section">
        <h3>Skills</h3>
        <dl className="skills">
          {SKILLS.filter((skill) => character.skills[skill] >= 1).map((skill) => (
            <div key={skill}>
              <dt>{SKILL_NAMES[skill]}</dt>
              <dd>
                <span className="skill-track">
                  <span className="skill-fill" style={{ width: `${character.skills[skill]}%` }} />
                </span>
                {Math.floor(character.skills[skill])}
              </dd>
            </div>
          ))}
        </dl>
        {character.spells.length > 0 && (
          <p className="spells">Spells: {character.spells.map(spellName).join(', ')}</p>
        )}
      </section>

      <section className="card-section">
        <dl className="facts">
          <dt>Temper</dt>
          <dd>{braveryWord(character.bravery)}</dd>
          <dt>Gold</dt>
          <dd>
            {formatCount(character.gold)}{' '}
            <span className="muted">({formatCount(character.goldEarned)} earned)</span>
          </dd>
          <dt>Pack</dt>
          <dd>
            {character.pack.length > 0 ? (
              lootList(character.pack)
            ) : (
              <span className="muted">empty</span>
            )}
          </dd>
          <dt>Kills</dt>
          <dd>
            <Kills kills={character.kills} />
          </dd>
        </dl>
      </section>

      {character.deeds.length > 0 && (
        <section className="card-section">
          <h3>Deeds</h3>
          <ol className="card-recent">
            {[...character.deeds]
              .reverse()
              .slice(0, 10)
              .map((deed, i) => (
                <li key={i}>
                  <time>{formatTimestamp(deed.at)}</time>
                  <span>{describeDeed(deed)}</span>
                </li>
              ))}
          </ol>
        </section>
      )}

      {recent.length > 0 && (
        <section className="card-section">
          <h3>Recently</h3>
          <ol className="card-recent">
            {recent.map((event) => (
              <li key={event.id}>
                <time>{formatTimestamp(event.t)}</time>
                <span>
                  <Prose segments={describeEvent(event, names)} onCharacter={onSelect} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}

function ItemName({ item }: { item: Item }) {
  return <span className={`rarity-${item.rarity}`}>{anItem(item)}</span>;
}

function Bar({
  label,
  value,
  max,
  kind,
}: {
  label: string;
  value: number;
  max: number;
  kind: 'hp' | 'stamina' | 'xp';
}) {
  const shown = Math.max(0, Math.ceil(value));
  const fraction = Math.max(0, Math.min(1, value / max));
  return (
    <div className="bar">
      <div className="bar-label">
        <span>{label}</span>
        <span>
          {shown} / {max}
        </span>
      </div>
      <div
        className={`bar-track bar-${kind}`}
        role="img"
        aria-label={`${label}: ${shown} of ${max}`}
      >
        <div className="bar-fill" style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}

function Conditions({ character, now }: { character: Character; now: number }) {
  const conditions = conditionsOf(character, now);
  if (conditions.length === 0) return null;
  return (
    <ul className="chips" aria-label="Conditions">
      {conditions.map((c) => (
        <li key={c} className="chip">
          {c}
        </li>
      ))}
    </ul>
  );
}

function Kills({ kills }: { kills: Character['kills'] }) {
  const entries = (Object.entries(kills) as [CreatureId, number][]).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <span className="muted">none yet</span>;
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  return (
    <>
      {total}{' '}
      <span className="muted">
        (
        {entries
          .map(([id, n]) => `${n} ${n === 1 ? creatureDef(id).name : creatureDef(id).plural}`)
          .join(', ')}
        )
      </span>
    </>
  );
}

function recentEvents(log: readonly SimEvent[], id: CharacterId): SimEvent[] {
  const found: SimEvent[] = [];
  for (let i = log.length - 1; i >= 0 && found.length < RECENT_EVENTS; i--) {
    if (log[i]!.actors.includes(id)) found.push(log[i]!);
  }
  return found;
}
