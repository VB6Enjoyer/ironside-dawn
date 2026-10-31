import { Fragment, useEffect } from 'react';

import type { SimHost, WorldSlice } from '../../host';

import {
  creatureDef,
  LANGUAGES,
  SKILLS,
  STATS,
  TRAIT_POLES,
  TRAITS,
  type CreatureId,
  type LanguageId,
  type StatId,
} from '../../content';
import {
  conditionsOf,
  fearOf,
  roleOf,
  vividMemories,
  vividness,
  statValue,
  xpForLevel,
  type Character,
  type Expectation,
  type Item,
  type LocationId,
  type Opinion,
  type CharacterId,
} from '../../sim';
import {
  describeGoal,
  describeMemory,
  describeWhy,
  personalitySummary,
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
import { useQuery } from '../useHost';
import { Prose, type ProseLinks } from './Prose';

const STAT_LABELS: Record<StatId, string> = {
  might: 'Might',
  agility: 'Agility',
  toughness: 'Toughness',
  wits: 'Wits',
  spirit: 'Spirit',
  presence: 'Presence',
};

const RECENT_EVENTS = 8;

interface Props extends ProseLinks {
  host: SimHost;
  characterId: CharacterId;
  /** Changes whenever the world moves on, to fetch the character again. */
  refresh: unknown;
  names: NameResolver;
  following: boolean;
  onCharacter(id: CharacterId): void;
  onFollow(follow: boolean): void;
  onProfile(): void;
  onClose(): void;
}

export function CharacterCard({
  host,
  characterId,
  refresh,
  names,
  following,
  onCharacter: onSelect,
  onLocation,
  onFollow,
  onProfile,
  onClose,
}: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const view = useQuery(host, { kind: 'character', id: characterId }, refresh);
  if (!view) {
    return (
      <aside className="character-card" aria-busy="true">
        <p className="muted">Looking for them…</p>
      </aside>
    );
  }
  const { character, slice: world } = view;

  const home = world.locations.get(character.homeId);
  const species = SPECIES_NAMES[character.species].singular;
  const dead = character.death !== null;
  const recent = view.events.slice(-RECENT_EVENTS).reverse();

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

      <div className="card-actions">
        <button type="button" onClick={onProfile}>
          Life story
        </button>
        {!dead && (
          <button
            type="button"
            aria-pressed={following}
            onClick={() => onFollow(!following)}
            title="Log everything they do, blow by blow"
          >
            {following ? 'Following' : 'Follow'}
          </button>
        )}
      </div>

      <p className={`card-status${dead ? ' card-status-dead' : ''}`}>
        <Prose segments={describeActivity(character, names)} onLocation={onLocation} />
        {dead && character.death && <> · {formatTimestamp(character.death.at)}</>}
      </p>
      {!dead && character.goal && (
        <p className="card-goal">
          {describeGoal(character.goal, names)}{' '}
          <span className="aside">{describeWhy(character.goal.why, names)}</span>
        </p>
      )}

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
        <h3>Personality</h3>
        <p className="card-summary">{personalitySummary(character.traits)}</p>
        <dl className="traits">
          {TRAITS.map((trait) => (
            <div key={trait}>
              <dt>{TRAIT_POLES[trait][0]}</dt>
              <dd>
                <span className="trait-track">
                  <span
                    className="trait-marker"
                    style={{ left: `${character.traits[trait] * 100}%` }}
                  />
                </span>
              </dd>
              <dt>{TRAIT_POLES[trait][1]}</dt>
            </div>
          ))}
        </dl>
      </section>

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

      <Bonds character={character} world={world} onSelect={onSelect} />
      <Memories character={character} now={world.time} names={names} />
      <Places character={character} now={world.time} names={names} />

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
                  <Prose
                    segments={describeEvent(event, names)}
                    onCharacter={onSelect}
                    onLocation={onLocation}
                  />
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}

/** Party, friends, rivals, languages, and any criminal record. */
function Bonds({
  character,
  world,
  onSelect,
}: {
  character: Character;
  world: WorldSlice;
  onSelect(id: CharacterId): void;
}) {
  const link = (id: CharacterId) => {
    const other = world.characters.get(id);
    if (!other) return null;
    return (
      <button
        type="button"
        className={`ref ref-character${other.dead ? ' ref-dead' : ''}`}
        onClick={() => onSelect(id)}
      >
        {other.name}
      </button>
    );
  };
  const list = (ids: readonly CharacterId[]) =>
    ids.map((id, i) => (
      <Fragment key={id}>
        {i > 0 && ', '}
        {link(id)}
      </Fragment>
    ));
  const party = character.partyId ? world.parties.get(character.partyId) : undefined;
  const bonds = Object.entries(character.opinions) as [CharacterId, Opinion][];
  const friends = bonds.filter(([, o]) => o.bond === 'friend').map(([id]) => id);
  const rivals = bonds.filter(([, o]) => o.bond === 'rival').map(([id]) => id);
  const languages = (Object.entries(character.languages) as [LanguageId, number][])
    .filter(([, level]) => level >= 5)
    .sort((a, b) => b[1] - a[1]);
  const record = character.outlaw;
  const bounty = world.bounties.get(character.id);
  const standing = (Object.entries(character.reputation) as [LocationId, number][]).filter(
    ([, r]) => Math.abs(r) >= 0.2,
  );
  const leader = party ? world.characters.get(party.leaderId) : undefined;

  return (
    <section className="card-section">
      <h3>Bonds</h3>
      <dl className="facts">
        {party && (
          <>
            <dt>{record ? 'Gang' : 'Party'}</dt>
            <dd>
              {list(party.members.filter((id) => id !== character.id))}
              <span className="muted">
                {party.leaderId === character.id
                  ? ' (they lead)'
                  : ` (led by ${leader?.name.split(' ')[0]})`}
              </span>
            </dd>
          </>
        )}
        <dt>Friends</dt>
        <dd>{friends.length > 0 ? list(friends) : <span className="muted">none yet</span>}</dd>
        {rivals.length > 0 && (
          <>
            <dt>Rivals</dt>
            <dd>{list(rivals)}</dd>
          </>
        )}
        <dt>Speaks</dt>
        <dd>
          {languages
            .map(([language, level]) => `${LANGUAGES[language].name}${fluency(level)}`)
            .join(', ')}
        </dd>
        {record && (
          <>
            <dt>Outlaw</dt>
            <dd className="outlaw">
              since {formatTimestamp(record.since)}; {record.crimes}{' '}
              {record.crimes === 1 ? 'crime' : 'crimes'}
              {record.murders > 0 &&
                `, ${record.murders} ${record.murders === 1 ? 'murder' : 'murders'}`}
              {bounty && `; ${bounty.amount} gold on their head`}
            </dd>
          </>
        )}
        {standing.length > 0 && (
          <>
            <dt>Standing</dt>
            <dd>
              {standing
                .map(
                  ([id, r]) =>
                    `${world.locations.get(id)?.name ?? id}: ${r > 0 ? 'welcome' : 'wanted'}`,
                )
                .join(', ')}
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

function fluency(level: number): string {
  if (level >= 100) return '';
  if (level >= 70) return ' (fluent)';
  if (level >= 30) return ' (conversational)';
  return ' (a little)';
}

function Memories({
  character,
  now,
  names,
}: {
  character: Character;
  now: number;
  names: NameResolver;
}) {
  const memories = vividMemories(character, now, 5);
  if (memories.length === 0) return null;
  return (
    <section className="card-section">
      <h3>Remembers</h3>
      <ul className="memories">
        {memories.map((memory, i) => (
          <li key={i} style={{ opacity: 0.45 + 0.55 * vividness(memory, now) }}>
            {describeMemory(memory, names)}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What each dungeon has been like for them: their favorite, and the one they fear. */
function Places({
  character,
  now,
  names,
}: {
  character: Character;
  now: number;
  names: NameResolver;
}) {
  const entries = Object.entries(character.expectations) as [LocationId, Expectation][];
  if (entries.length === 0) return null;
  return (
    <section className="card-section">
      <h3>Dungeons, in their experience</h3>
      <dl className="facts">
        {entries
          .sort((a, b) => b[1].reward - a[1].reward)
          .map(([id, e]) => {
            const place = names.location(id);
            const fear = fearOf(character, id, now);
            return (
              <Fragment key={id}>
                <dt>{place?.name ?? id}</dt>
                <dd>
                  {e.trips} {e.trips === 1 ? 'trip' : 'trips'}, about {Math.round(e.reward)} gold
                  each
                  {fear >= 0.5 ? (
                    <span className="muted"> · feared</span>
                  ) : fear >= 0.25 ? (
                    <span className="muted"> · wary of it</span>
                  ) : null}
                </dd>
              </Fragment>
            );
          })}
      </dl>
    </section>
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
