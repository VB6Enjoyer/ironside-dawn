/**
 * Languages (WORLD.md §5). Each people has a native tongue; others are learned
 * by living among speakers and from friends. There is no common trade tongue
 * yet: "Common" is simply what humans call their own language.
 */
export const LANGUAGES = {
  common: { name: 'Common' },
  sylvan: { name: 'Sylvan' },
  deeptongue: { name: 'Deeptongue' },
} as const satisfies Record<string, { readonly name: string }>;

export type LanguageId = keyof typeof LANGUAGES;

/** Proficiency milestones, announced when crossed. */
export const LANGUAGE_LEVELS = [
  { at: 30, name: 'conversational' },
  { at: 70, name: 'fluent' },
] as const;
