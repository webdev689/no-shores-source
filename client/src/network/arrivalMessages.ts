// What brings foes, as the room sends it (crates/room/src/arrivals.rs): each Grey Tithe airship and Lattice crown in
// a snapshot, and a foe's own arrival among its packed numbers. The page draws them from these alone.
import type { Snapshot } from '../../../generated/messages/ts/overlook/wire/snapshot.ts';

/** What brings a foe: a Grey Tithe airship, a Lattice crown, or a Boss's call (`room::Bringer`). */
export const BRINGER = { airship: 1, crown: 2, called: 3 } as const;

/** An airship or a crown bringing foes: its number; what it is; the point on the ground it brings them to; the way an
 *  airship comes in (radians clockwise from north; a crown's turn); how high an airship hangs over that ground; and
 *  the room ticks it set out (a crown began forming), hangs there (a crown stands whole), lets its last foe go (a crown
 *  breaks) and is gone. */
export interface ArrivalSeen {
  readonly id: number;
  readonly kind: number;
  readonly at: readonly [number, number, number];
  readonly heading: number;
  readonly high: number;
  readonly began: number;
  readonly hangs: number;
  readonly leaves: number;
  readonly gone: number;
}

/** A foe arriving: what brings it, the number of what brings it (0 for a call), the room tick it is let down (it is
 *  not seen before) and the tick it lands, whole. */
export interface FoeArrival {
  readonly kind: number;
  readonly from: number;
  readonly drops: number;
  readonly lands: number;
}

/** A foe's arrival from its last four packed numbers: none once it has landed (all 0). */
export function foeArrivalOf([kind = 0, from = 0, drops = 0, lands = 0]: readonly number[]): FoeArrival | null {
  return kind > 0 ? { kind, from, drops, lands } : null;
}

/** Every airship and crown a snapshot carries. */
export function arrivalsOf(snapshot: Snapshot): ArrivalSeen[] {
  return Array.from({ length: snapshot.arrivalsLength() }, (unused, index) => {
    const seen = snapshot.arrivals(index);
    const [x = 0, y = 0, z = 0] = seen?.atArray() ?? [];
    const tick = (value: bigint | undefined) => Number(value ?? 0n);
    return {
      id: seen?.id() ?? 0,
      kind: seen?.kind() ?? 0,
      at: [x, y, z] as const,
      heading: seen?.heading() ?? 0,
      high: seen?.high() ?? 0,
      began: tick(seen?.began()),
      hangs: tick(seen?.hangs()),
      leaves: tick(seen?.leaves()),
      gone: tick(seen?.gone()),
    };
  });
}
