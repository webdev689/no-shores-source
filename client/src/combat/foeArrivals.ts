// How a foe arriving is drawn (crates/room/src/arrivals.rs): not at all before it is let down from its airship or
// begins forming under its crown; then built in its look, a Grey Tithe foe from the feet up as a player arriving is,
// a Lattice foe from the head down in its crystal; whole once it has landed. The room's ticks run on between its
// snapshots by the page's clock (`RoomTicks`), so a build runs smoothly whatever the snapshots' pace.
import { ARRIVING } from '../player/cardLooks.ts';
import { BRINGER, type FoeArrival } from '../network/arrivalMessages.ts';

/** The Lattice's faction's number in the rules' roster. */
const LATTICE_FACTION = 3;
/** How far the page runs the room's ticks on past its last snapshot, at most: a stalled room holds still soon. */
const RUN_ON_MOST = 12;
const TICKS_A_SECOND = 60;

/** The room's ticks as the page draws them: its last snapshot's, run on by the page's clock since it came. */
export class RoomTicks {
  private tick = -1;
  private since = 0;

  /** The room's tick, whole or between, at the page's `clock` (seconds), its last snapshot at `roomTick`. */
  now(roomTick: number, clock: number): number {
    if (roomTick !== this.tick) [this.tick, this.since] = [roomTick, clock];
    return roomTick + Math.min(RUN_ON_MOST, Math.max(0, (clock - this.since) * TICKS_A_SECOND));
  }
}

/** A foe as drawn at room tick `tick`: hidden before it is let down or begins forming; built, `share` of it still to
 *  come (1 none to 0 whole) in `look` (`cardLooks.ts` ARRIVING), until it lands; else as any foe. */
export type ArrivalLook =
  { readonly hidden: true } | { readonly hidden: false; readonly share?: number; readonly look?: number };

export function arrivalLook(arrival: FoeArrival | null | undefined, faction: number, tick: number): ArrivalLook {
  if (!arrival || tick >= arrival.lands) return { hidden: false };
  if (tick < arrival.drops) return { hidden: true };
  const lattice = arrival.kind === BRINGER.crown || faction === LATTICE_FACTION;
  const share = 1 - (tick - arrival.drops) / Math.max(1, arrival.lands - arrival.drops);
  return {
    hidden: false,
    share: Math.min(1, Math.max(1e-3, share)),
    look: lattice ? ARRIVING.lattice : ARRIVING.tithe,
  };
}
