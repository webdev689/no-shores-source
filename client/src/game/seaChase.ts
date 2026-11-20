// The chase: the player's course set to intercept a sighted hostile ship, planned again each half second round the
// land as any route is, until she is met, lost from sight, or another course is set. The voyage's line says whom the
// ship chases meanwhile.
import type { SeenPirate } from '../network/messages.ts';
import type { Point2 } from '../overworld/ground.ts';
import { SHIP_SPEED } from '../overworld/voyage.ts';
import { hostileName, sightedHostiles } from './seaHostiles.ts';

/** Within this of her she is met (crates/naval/src/captain `ENGAGE_RANGE`), metres. */
export const MET_M = 750;
/** Seconds between the chase's plans. */
export const CHASE_EVERY_S = 0.5;
/** A hostile ship's way at sea by her rank, 1 Minor to 5 Boss, metres a second at the world's own time
 *  (crates/room/src/sighting.rs `way_of`): she sails on the clock of the player she sails by, as the player does. */
const RANK_WAYS = [2.16, 2.4, 2.64, 2.88, 2.4] as const;

/** Where a ship sailing from `from` at `speed` meets one at `there` sailing at `velocity` (east and south, metres a
 *  second), soonest: lead pursuit. Where she is, if she cannot be reached. */
export function interceptPoint(from: Point2, speed: number, there: Point2, velocity: Point2): Point2 {
  const gap = [there[0] - from[0], there[1] - from[1]] as const;
  const square = velocity[0] ** 2 + velocity[1] ** 2 - speed ** 2;
  const linear = 2 * (gap[0] * velocity[0] + gap[1] * velocity[1]);
  const constant = gap[0] ** 2 + gap[1] ** 2;
  let time = 0;
  if (Math.abs(square) < 1e-12) time = linear < 0 ? -constant / linear : 0;
  else {
    const room = linear * linear - 4 * square * constant;
    if (room >= 0) {
      const roots = [(-linear - Math.sqrt(room)) / (2 * square), (-linear + Math.sqrt(room)) / (2 * square)];
      time = Math.min(...roots.filter((root) => root > 0), Infinity);
      if (!Number.isFinite(time)) time = 0;
    }
  }
  return [there[0] + velocity[0] * time, there[1] + velocity[1] * time];
}

/** Where the player's ship at `ship` meets `pirate`: both on the same clock, so at their ways at the world's own time. */
export function meetingPoint(ship: Point2, pirate: SeenPirate): Point2 {
  const way = RANK_WAYS[pirate.rank - 1] ?? RANK_WAYS[1];
  const velocity: Point2 = [Math.sin(pirate.heading) * way, -Math.cos(pirate.heading) * way];
  return interceptPoint(ship, SHIP_SPEED, [pirate.x, pirate.y], velocity);
}

/** The ship's chase, if any: whom, and the seconds since its last plan. */
export class Chase {
  private quarry: { readonly id: number; readonly name: string } | null = null;
  private since = 0;

  /** Chases `pirate` from the ship at `ship`: where to plan her course for now. */
  start(pirate: SeenPirate, ship: Point2): Point2 {
    [this.quarry, this.since] = [{ id: pirate.id, name: hostileName(pirate) }, 0];
    return meetingPoint(ship, pirate);
  }

  /** Ends the chase: met, lost, or another course set. */
  stop(): void {
    this.quarry = null;
  }

  /** The id of the ship chased, if any. */
  get chasing(): number | null {
    return this.quarry?.id ?? null;
  }

  /** Steps `seconds` on among `pirates` round the ship at `ship`: where to plan her course for, each half second,
   *  while she is still sighted; none otherwise, the chase ended once she is lost. */
  step(seconds: number, pirates: readonly SeenPirate[], ship: Point2): Point2 | null {
    if (!this.quarry) return null;
    const id = this.quarry.id;
    const pirate = sightedHostiles(pirates, ship).find((each) => each.id === id);
    // Lost from sight, or met: within a captain's 750 m a bold one takes the ship on, and a wary one is caught up.
    if (!pirate || Math.hypot(pirate.x - ship[0], pirate.y - ship[1]) <= MET_M) {
      this.stop();
      return null;
    }
    this.since += seconds;
    if (this.since < CHASE_EVERY_S) return null;
    this.since = 0;
    return meetingPoint(ship, pirate);
  }

  /** The voyage's line while chasing: "Chasing the Tithe Brig."; null otherwise. */
  get words(): string | null {
    return this.quarry ? `Chasing the ${this.quarry.name}.` : null;
  }
}
