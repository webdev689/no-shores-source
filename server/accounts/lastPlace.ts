// Where a character logs back in, as its kept body says it (crates/gear/src/last.rs): the sea, or a social space's
// node and where they stood in it; or the passage zone of its dive, when that zone's room held it last or, for a public
// dive, when the zone it went on from did. The page asks
// for it with `/v1/me` to know where to go after the title; the rooms still stand the player there by their own word
// on the character.
import type { Db } from './database.ts';
import { passageRoom, passageRoomName } from '../roomNames.ts';
import { weekOf } from '../../client/src/game/guild/guildLaw.ts';

/** Where a character logs back in: at sea, on foot in a social space (its node, feet in metres, facing in radians),
 *  or in its dive's passage zone (its room: the zone's first public room, or its company's route's); null for one
 *  never kept in any. */
export type LastPlace =
  | { readonly kind: 'sea' }
  | { readonly kind: 'social'; readonly node: string; readonly at: readonly number[]; readonly facing: number }
  | { readonly kind: 'passage'; readonly room: string }
  | null;

/** The zone a dive kept in `body` stands in, when `room`, the room that held the character last, is a room of its web
 *  (the zone's own, or for a public dive the zone it went on from), of this `week`, and the dive has not turned home:
 *  a reload or a closed tab costs no more than a death would. */
function diveRoom(read: { passage?: unknown }, room: string | null, week: number): LastPlace {
  const zone = passageRoom(room);
  if (zone?.week !== week) return null;
  const dive = read.passage as { island?: unknown; week?: unknown; zone?: unknown; homeward?: unknown } | null;
  if (!zone || !dive || dive.homeward === true) return null;
  if (dive.island !== zone.island || dive.week !== zone.week || typeof dive.zone !== 'number') return null;
  const base = passageRoomName(zone.island, zone.week, dive.zone);
  if (dive.zone === zone.zone) return { kind: 'passage', room: zone.run === null ? base : (room ?? base) };
  // Gone on from the zone that held it last, before the next kept it (a reload on the way between): a public dive's
  // zone gone to; a company's route there is a room its company found, which this does not know.
  return zone.run === null ? { kind: 'passage', room: base } : null;
}

/** The place a kept body names, read leniently: anything that is not one is none. `room` is the room that held it
 *  last, which names its dive's zone, and `week` the week it is now (`weekOf`). */
export function lastPlaceOf(body: string | null, room: string | null = null, week = weekOf(Date.now())): LastPlace {
  let read: unknown = null;
  try {
    const whole = body === null ? null : (JSON.parse(body) as { last?: unknown; passage?: unknown } | null);
    const diving = whole && diveRoom(whole, room, week);
    if (diving) return diving;
    read = whole?.last;
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
export async function lastPlace(database: Db, account: string, now = Date.now()): Promise<LastPlace> {
  const kept = await database
    .prepare('SELECT body, room FROM characters WHERE account_id = ?1')
    .bind(account)
    .first<{ body: string | null; room: string | null }>();
  return lastPlaceOf(kept?.body ?? null, kept?.room ?? null, weekOf(now));
}
