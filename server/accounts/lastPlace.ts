// Where a character logs back in, as its kept body says it (crates/gear/src/last.rs): the sea, or a social space's
// node and where they stood in it. The page asks for it with `/v1/me` to know where to go after the title; the rooms
// still stand the player there by their own word on the character.
import type { Db } from './database.ts';

/** Where a character logs back in: at sea, or on foot in a social space (its node, feet in metres, facing in radians);
 *  null for one never kept in either. */
export type LastPlace =
  | { readonly kind: 'sea' }
  | { readonly kind: 'social'; readonly node: string; readonly at: readonly number[]; readonly facing: number }
  | null;

/** The place a kept body names, read leniently: anything that is not one is none. */
export function lastPlaceOf(body: string | null): LastPlace {
  let read: unknown = null;
  try {
    read = body === null ? null : (JSON.parse(body) as { last?: unknown }).last;
  } catch {
    return null;
  }
  if (typeof read !== 'object' || read === null) return null;
  const last = read as { kind?: unknown; node?: unknown; at?: unknown; facing?: unknown };
  if (last.kind === 'sea') return { kind: 'sea' };
  const whole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);
  const feet = Array.isArray(last.at) && last.at.length === 3 && last.at.every(whole) ? (last.at as number[]) : null;
  if (last.kind !== 'social' || typeof last.node !== 'string' || !feet || !whole(last.facing)) return null;
  return {
    kind: 'social',
    node: last.node,
    at: feet.map((centimetres) => centimetres / 100),
    facing: last.facing / 1000,
  };
}

/** Where an account's character logs back in. */
export async function lastPlace(database: Db, account: string): Promise<LastPlace> {
  const kept = await database
    .prepare('SELECT body FROM characters WHERE account_id = ?1')
    .bind(account)
    .first<{ body: string | null }>();
  return lastPlaceOf(kept?.body ?? null);
}
