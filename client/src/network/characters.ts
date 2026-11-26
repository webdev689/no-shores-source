// An account's four characters as the accounts answer for them (`GET /v1/characters`), read defensively: a page made
// before a newer answer meets fields it does not know, or misses some it does, and reads what it can, so the character
// screen still draws. A slot the page cannot read is an empty one; an answer it cannot read at all is none.
import type { LastPlace } from '../../../server/accounts/lastPlace.ts';
import type { Details } from './accounts.ts';

/** How many characters an account keeps. */
export const SLOTS = 4;

/** A kept character as its slot shows it: what its room kept for others to see (null for one never kept), the house it
 *  is pledged to (null for none), its look as the helm made it (unread: `prologue/look.ts` reads it), where it logs
 *  back in, whether it has played the prologue through, and when it was last kept, in milliseconds. */
export interface Slot {
  readonly slot: number;
  readonly shown: Details['shown'];
  readonly pledge: number | null;
  readonly look: unknown;
  readonly place: LastPlace;
  readonly prologue: boolean;
  readonly saved: number;
}

/** The accounts' words while the character in play is still held by a room (409), which a moment later may pass. */
export interface Held {
  readonly held: string;
}

/** The four slots, which is in play, whether the account is a developer's, and the account's Aurem. */
export interface Characters {
  readonly playing: number;
  readonly developer: boolean;
  readonly aurem: number;
  readonly slots: readonly (Slot | null)[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const whole = (value: unknown, least: number, most: number): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most ? value : null;

/** What a room kept to show, if it has its level, Defense, Attack, emblem and worn pieces; else none. */
function shownOf(value: unknown): Details['shown'] {
  if (!isRecord(value)) return null;
  const { level, defense, attack, emblem, worn } = value;
  if (typeof level !== 'number' || typeof defense !== 'number' || typeof attack !== 'number') return null;
  if (typeof emblem !== 'string' || !Array.isArray(worn)) return null;
  return { ...(value as NonNullable<Details['shown']>), worn: worn.filter(isRecord) as never };
}

/** A place to log back in, as `/v1/me` answers it; anything else is none. */
function placeOf(value: unknown): LastPlace {
  if (!isRecord(value)) return null;
  if (value['kind'] === 'sea') return { kind: 'sea' };
  const { node, at, facing } = value;
  const point = Array.isArray(at) && at.every((each) => typeof each === 'number');
  if (value['kind'] !== 'social' || typeof node !== 'string' || !point || typeof facing !== 'number') return null;
  return { kind: 'social', node, at: at as number[], facing };
}

/** A slot as the accounts answer it; an empty or unreadable one is null. */
function slotOf(value: unknown, place: number): Slot | null {
  if (!isRecord(value)) return null;
  return {
    slot: place,
    shown: shownOf(value['shown']),
    pledge: whole(value['pledge'], 1, Number.MAX_SAFE_INTEGER),
    look: value['look'] ?? null,
    place: placeOf(value['place']),
    prologue: value['prologue'] === true,
    saved: typeof value['saved'] === 'number' ? value['saved'] : 0,
  };
}

/** The accounts' answer, read: always four slots, the one in play among them; null for an answer that is no list of
 *  characters at all. */
export function charactersOf(answer: unknown): Characters | null {
  if (!isRecord(answer) || !Array.isArray(answer['slots'])) return null;
  const given: unknown[] = answer['slots'];
  return {
    playing: whole(answer['playing'], 0, SLOTS - 1) ?? 0,
    developer: answer['developer'] === true,
    aurem: whole(answer['aurem'], 0, Number.MAX_SAFE_INTEGER) ?? 0,
    slots: Array.from({ length: SLOTS }, (_unread, place) => slotOf(given[place], place)),
  };
}

/** What the page keeps by account is kept by account and character: the first slot's under the account's id alone,
 *  as it was kept before an account had four, and each other's under the id and its slot. */
export const keptFor = (account: string | null, slot: number | null): string | null =>
  account === null ? null : slot === null || slot === 0 ? account : `${account}#${slot}`;
