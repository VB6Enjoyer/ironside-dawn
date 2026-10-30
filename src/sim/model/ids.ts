declare const brand: unique symbol;

/** A string that can't be mixed up with other kinds of IDs by accident. */
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type CharacterId = Brand<string, 'CharacterId'>;
export type LocationId = Brand<string, 'LocationId'>;
export type RouteId = Brand<string, 'RouteId'>;
export type EncounterId = Brand<string, 'EncounterId'>;
export type EntityId = CharacterId | LocationId;

/** Event IDs are sequential integers, starting at 1. */
export type EventId = number;
