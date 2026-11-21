// What a sea room tells of its fights beside the World Editor's events, and the one mapping that hands each to the
// fight's feel (`ships/fightFeel.ts`): the sea room's decode, the fleet room's session and the feel all read these.
import type { FightEvent, Point } from './fightRules.ts';

/** The part of a ship a ball struck, and what floats looks like (crates/naval/src/fight_events.rs). */
export const PARTS = ['hull', 'sail', 'rig'] as const;
export const PIECES = ['crate', 'barrel', 'chest'] as const;

/** What the sea's fights tell beside the World Editor's events, each on the fight's tick it happened on: a ball's
 *  splash (x, y), a ball that struck a ship (where, in its own frame), a sail torn away (its sail index, as its
 *  manifest lists them), a mast fallen (0 fore to aft), its colours struck, its going down, a piece of what floats laid
 *  (by its number) or gathered (by a player's number), and players gone aboard it. Ships go by the view's numbers. */
export type NavalEvent =
  | { kind: 'Splash'; tick: number; at: [number, number] }
  | { kind: 'Hit'; tick: number; ship: number; at: Point; part: (typeof PARTS)[number] }
  | { kind: 'SailLost'; tick: number; ship: number; sail: number }
  | { kind: 'MastFell'; tick: number; ship: number; mast: number }
  | { kind: 'Struck'; tick: number; ship: number }
  | { kind: 'Sinking'; tick: number; ship: number }
  | { kind: 'Flotsam'; tick: number; id: number; at: [number, number]; kind_of: (typeof PIECES)[number] }
  | { kind: 'Gathered'; tick: number; id: number; by: number }
  | { kind: 'Boarding'; tick: number; ship: number };

/** The room's own events the feel reads, by the room's names: a ball's splash and hit come with its shot's events. */
export type RoomEvent = Exclude<NavalEvent, { kind: 'Splash' | 'Hit' }>;

/** One of the room's events as the feel reads it among the fight's: the sea room's and the fleet room's hand theirs
 *  through here, and the World Editor's fight names its own the same. None for a ball's splash and hit, which its
 *  shot's own events carry. */
export function feelOf(event: NavalEvent): FightEvent | null {
  if (event.kind === 'Splash' || event.kind === 'Hit') return null;
  // The fight's view carries its events as the World Editor's; the feel tells these from them by their kinds.
  return event as unknown as FightEvent;
}
