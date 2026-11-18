import { Bleeding, type BodySeen } from './blood/bleeding.ts';
import { BloodMarks, GORE_NORMAL, type SurfaceHit, type Surfaces, bloodOn } from './blood/marks.ts';
import { type Vector, swingThrow } from './blood/spray.ts';
import { type BloodCamera, BloodView } from './blood/view.ts';
import { EVENT } from './cues.ts';
import type { Fighting } from './fighting.ts';
import { REVERSED_DEPTH } from '../editor/orbit.ts';
import type { Gpu } from '../gpu.ts';
import type { FightEvent } from '../network/messages.ts';
import { type FighterView, fighterView } from '../rules/fighters.ts';
import type { Block } from '../rules/movementRules.ts';
import { BODY_HEIGHT } from '../player/crosshair.ts';

/** The arms code's melee byte for a warhammer (combat's WeaponClass), whose overkill takes DFO's heavy branch. */
const WARHAMMER = 6;

/** A body bleeds at five eighths of its height, its capsule's middle and an eighth more. */
export const chestOf = (view: FighterView): Vector => [view.x, view.y, view.z + (BODY_HEIGHT * 5) / 8];

/** How finely a ray is walked over land, and how far apart the ground is sampled for its slope, in metres. */
const LAND_STEP = 0.05;
const SLOPE_SPAN = 0.25;

/** Where a ray first goes under the land `groundAt` gives (world metres), walked in short steps up to `reach`, with
 *  the land's normal there; null if it never does. */
function landHit(groundAt: (x: number, y: number) => number, from: Vector, direction: Vector, reach: number) {
  const point = (distance: number) => [0, 1, 2].map((axis) => (from[axis] ?? 0) + (direction[axis] ?? 0) * distance);
  const under = (distance: number) => {
    const [x = 0, y = 0, z = 0] = point(distance);
    return z <= groundAt(x, y);
  };
  if (under(0)) return null;
  for (let walked = LAND_STEP; walked < reach + LAND_STEP; walked += LAND_STEP) {
    const distance = Math.min(walked, reach);
    if (!under(distance)) continue;
    const [x = 0, y = 0] = point(distance);
    // The land's fall each way across twice the span, and twice the span upward: its normal, unscaled.
    const east = groundAt(x - SLOPE_SPAN, y) - groundAt(x + SLOPE_SPAN, y);
    const south = groundAt(x, y - SLOPE_SPAN) - groundAt(x, y + SLOPE_SPAN);
    const length = Math.hypot(east, south, 2 * SLOPE_SPAN);
    return { distance, normal: [east / length, south / length, (2 * SLOPE_SPAN) / length] as const };
  }
  return null;
}

/** The ground and the course's blocks as boxes up to their tops: the nearest surface a ray meets entering it, with
 *  that face's normal. The ground is open ground at height zero, or the land `groundAt` gives. A ray starting inside a
 *  box does not meet it. */
export function surfacesOf(blocks: readonly Block[], groundAt?: (x: number, y: number) => number): Surfaces {
  return (from, direction, reach) => {
    let nearest: SurfaceHit | null = null;
    const keep = (distance: number, normal: Vector) => {
      if (distance >= 0 && distance <= reach && (!nearest || distance < nearest.distance))
        nearest = { distance, normal };
    };
    const land = groundAt && landHit(groundAt, from, direction, reach);
    if (land) keep(land.distance, land.normal);
    else if (!groundAt && direction[2] < 0 && from[2] >= 0) keep(from[2] / -direction[2], [0, 0, 1]);
    for (const block of blocks) {
      const low = [block.minX, block.minY, 0];
      const high = [block.maxX, block.maxY, block.top];
      let enter = -Infinity;
      let leave = Infinity;
      let axisEntered = -1;
      for (let axis = 0; axis < 3; axis++) {
        const start = from[axis] ?? 0;
        const step = direction[axis] ?? 0;
        const [lowEdge, highEdge] = [low[axis] ?? 0, high[axis] ?? 0];
        if (Math.abs(step) < 1e-12) {
          if (start < lowEdge || start > highEdge) leave = -Infinity;
          continue;
        }
        const [near, far] = [(lowEdge - start) / step, (highEdge - start) / step].sort((a, b) => a - b) as [
          number,
          number,
        ];
        if (near > enter) [enter, axisEntered] = [near, axis];
        leave = Math.min(leave, far);
      }
      if (axisEntered < 0 || enter > leave || enter < 0) continue;
      const normal: [number, number, number] = [0, 0, 0];
      normal[axisEntered] = (direction[axisEntered] ?? 0) > 0 ? -1 : 1;
      keep(enter, normal);
    }
    return nearest;
  };
}

/**
 * A fight's blood, on any page: each hit in the fight's events marks the struck body's chest, a player's swing throwing
 * it the way its blade went; every fighter, foes and players alike, is seen each frame by its health and feet for its
 * trail, its prints and, once dead, its pool, on the page's `surfaces` (world metres). `?blood=off` turns it all off.
 * Its marks are kept from `origin`, near the fight, so they stay exact far out in the world; `samples` is the pass's
 * multisampling.
 */
export class FightBlood {
  private readonly marks: BloodMarks;
  private readonly bleeding = new Bleeding(Math.random);
  private readonly view: BloodView | null;
  private readonly origin: Vector;

  constructor(gpu: Gpu, surfaces: Surfaces, search: string, origin: Vector = [0, 0, 0], samples = 1) {
    const enabled = bloodOn(search);
    this.origin = origin;
    const [east, south, up] = origin;
    const fromOrigin: Surfaces = (from, direction, reach) =>
      surfaces([from[0] + east, from[1] + south, from[2] + up], direction, reach);
    this.marks = new BloodMarks({ surfaces: fromOrigin, enabled });
    this.view = enabled ? new BloodView(gpu, GORE_NORMAL.capacity, REVERSED_DEPTH, samples) : null;
  }

  /** A point of the world (metres) as the blood keeps it, from its origin. */
  private local(point: Vector): Vector {
    return [point[0] - this.origin[0], point[1] - this.origin[1], point[2] - this.origin[2]];
  }

  /** Every fighter the page knows, keyed by who it is, with the id the room's events name it by. */
  private fighters(fight: Fighting): Map<number, { key: string; view: FighterView }> {
    const seen = new Map<number, { key: string; view: FighterView }>();
    const own = fight.own;
    if (own) seen.set(fight.player, { key: `player ${fight.player}`, view: own });
    for (const other of fight.others.values())
      if (other.fighter) seen.set(other.player, { key: `player ${other.player}`, view: fighterView(other.fighter) });
    for (const foe of fight.foes.values()) seen.set(foe.id, { key: `foe ${foe.id}`, view: foe.view });
    return seen;
  }

  /** This frame's blood, `seconds` long, from the events the fight handed over, drawn from `camera`, which is measured
   *  from the blood's origin. */
  frame(seconds: number, events: readonly FightEvent[], fight: Fighting, camera: BloodCamera): void {
    if (!this.view) return;
    const fighters = this.fighters(fight);
    for (const event of events) {
      const defender = fighters.get(event.defender)?.view;
      if (event.kind !== EVENT.hit || !defender) continue;
      const striker = fighters.get(event.striker)?.view;
      const player = striker?.side === 'players';
      const heavy = player && (striker.arms & 0xff) === WARHAMMER;
      // Only a player's swing throws its spray, the way its blade went (DFO's swingThrow); a shot's or a foe's lands
      // where it struck. The way it struck is from the striker to the struck.
      const thrown: readonly [number, number] = player
        ? swingThrow(event.stroke, [defender.x - striker.x, defender.y - striker.y])
        : [0, 0];
      this.marks.place(this.local(chestOf(defender)), {
        damage: event.amount,
        healthMax: defender.healthMax,
        heavy,
        thrown,
      });
    }
    const bodies: BodySeen[] = [...fighters.values()].map(({ key, view }) => ({
      key,
      feet: this.local([view.x, view.y, view.z]),
      health: view.health,
      healthMax: view.healthMax,
      dead: view.action.kind === 'dead',
    }));
    for (const due of this.bleeding.tick(seconds, bodies)) {
      if (due.kind === 'drip') this.marks.drip(due.at, due.count);
      else if (due.kind === 'pool') this.marks.spreadPool(due.at);
      else this.marks.step(due.key, due.at, due.forward);
    }
    this.marks.tick(seconds);
    this.view.update(this.marks, camera);
  }

  /** Lets go of what the blood draws with, once its place is left. */
  destroy(): void {
    this.view?.destroy();
  }

  draw(pass: GPURenderPassEncoder): void {
    this.view?.draw(pass);
  }
}
