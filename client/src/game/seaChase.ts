// The chase: the player's course set to intercept a hostile ship drawn at sea, planned again each half second round
// the land as any route is, until it is met, no longer drawn, or another course is set. The voyage's line says whom the
// ship chases meanwhile.
import type { SeenHostile } from '../network/messages.ts';
import type { Point2 } from '../overworld/ground.ts';
import { SHIP_SPEED } from '../overworld/voyage.ts';
import { HOSTILE_PREFIX, hostileName } from './seaHostiles.ts';

/** Seconds between the chase's plans. */
export const CHASE_EVERY_S = 0.5;

/** Where a ship sailing from `from` at `speed` meets one at `there` sailing at `velocity` (east and south, metres a
 *  second), soonest: lead pursuit. Where it is, if it cannot be reached. */
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

/** Where the player's ship at `ship`, sailing `speed` m/s, meets `hostile`: both on the same clock, so at their ways at
 *  the world's own time, the hostile's as the room sends it (none from a room that sends none: where it is). */
export function meetingPoint(ship: Point2, hostile: SeenHostile, speed = SHIP_SPEED): Point2 {
  const way = hostile.way ?? 0;
  const velocity: Point2 = [Math.sin(hostile.heading) * way, -Math.cos(hostile.heading) * way];
  return interceptPoint(ship, speed, [hostile.x, hostile.y], velocity);
}

/** What a chase is told by: `tell` tells the sea room whom it chases (null none), so the one chased is met within
 *  750 m whatever its temper; `speed` is the ship's way at the world's own time, m/s. */
interface ChaseHooks {
  readonly tell?: (ship: number | null) => void;
  readonly speed?: () => number;
}

/** The ship's chase, if any: whom, and the seconds since its last plan. */
export class Chase {
  private quarry: { readonly id: number; readonly name: string } | null = null;
  private since = 0;
  /** Within this the one chased is met, metres: the rules' meeting reach (`Sea.facts`); none known, none met here. */
  metM = 0;
  private readonly tell: (ship: number | null) => void;
  /** The ship's way at the world's own time, m/s: the Sloop's, whole, until said. */
  private readonly speed: () => number;

  constructor({ tell = () => undefined, speed = () => SHIP_SPEED }: ChaseHooks = {}) {
    [this.tell, this.speed] = [tell, speed];
  }

  /** Chases the ship of the mark `markId`, if it is among `hostiles` drawn round the ship at `ship`, sighted or not
   *  (by night a dark one is drawn past its sight): where to plan its course for now; null for no such ship. */
  begin(markId: string, hostiles: readonly SeenHostile[], ship: Point2): Point2 | null {
    const hostile = hostiles.find((each) => `${HOSTILE_PREFIX}${each.id}` === markId);
    if (!hostile) return null;
    [this.quarry, this.since] = [{ id: hostile.id, name: hostileName(hostile) }, 0];
    this.tell(hostile.id);
    return meetingPoint(ship, hostile, this.speed());
  }

  /** Ends the chase for another course set, telling the room. */
  stop(): void {
    if (this.quarry) this.tell(null);
    this.quarry = null;
  }

  /** The id of the ship chased, if any. */
  get chasing(): number | null {
    return this.quarry?.id ?? null;
  }

  /** Steps `seconds` on among `hostiles` round the ship at `ship`: where to plan its course for, each half second,
   *  while it is still drawn; none otherwise, the chase ended once it is lost. */
  step(seconds: number, hostiles: readonly SeenHostile[], ship: Point2): Point2 | null {
    if (!this.quarry) return null;
    const id = this.quarry.id;
    const hostile = hostiles.find((each) => each.id === id);
    // Lost, no longer drawn, or met: within a captain's reach a bold one takes the ship on, and a wary one is caught up.
    // Lost, the room is told; met, the room meets it itself, so it is not told to let it go first.
    if (!hostile) this.stop();
    if (!hostile || Math.hypot(hostile.x - ship[0], hostile.y - ship[1]) <= this.metM) {
      this.quarry = null;
      return null;
    }
    this.since += seconds;
    if (this.since < CHASE_EVERY_S) return null;
    this.since = 0;
    // Told again with each plan, so a room joined again after its link was lost learns it too.
    this.tell(id);
    return meetingPoint(ship, hostile, this.speed());
  }

  /** The voyage's line while chasing: "Chasing the Tithe Brig."; null otherwise. */
  get words(): string | null {
    return this.quarry ? `Chasing the ${this.quarry.name}.` : null;
  }
}
