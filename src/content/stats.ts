/** The six attributes every character has (ROADMAP.md Phase 2). Average is 10. */
export const STATS = ['might', 'agility', 'toughness', 'wits', 'spirit', 'presence'] as const;
export type StatId = (typeof STATS)[number];
export type Stats = Readonly<Record<StatId, number>>;
