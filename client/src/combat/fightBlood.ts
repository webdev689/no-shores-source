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

/** The land's height at a place, felt from a height `z` there where the land has storeys (a dungeon's). */
type LandAt = (x: number, y: number, z?: number) => number;

/** Where a ray first goes under the land `groundAt` gives at the ray's height (world metres), walked in short steps up
 *  to `reach`, with the land's normal there; null if it never does. */
function landHit(groundAt: LandAt, from: Vector, direction: Vector, reach: number) {
  const point = (distance: number) => [0, 1, 2].map((axis) => (from[axis] ?? 0) + (direction[axis] ?? 0) * distance);
  const under = (distance: number) => {
    const [x = 0, y = 0, z = 0] = point(distance);
    return z <= groundAt(x, y, z);
  };
  if (under(0)) return null;
  for (let walked = LAND_STEP; walked < reach + LAND_STEP; walked += LAND_STEP) {
    const distance = Math.min(walked, reach);
    if (!under(distance)) continue;
    const [x = 0, y = 0, z = 0] = point(distance);
    // The land's fall each way across twice the span, and twice the span upward: its normal, unscaled.
    const east = groundAt(x - SLOPE_SPAN, y, z) - groundAt(x + SLOPE_SPAN, y, z);
    const south = groundAt(x, y - SLOPE_SPAN, z) - groundAt(x, y + SLOPE_SPAN, z);
    const length = Math.hypot(east, south, 2 * SLOPE_SPAN);
    return { distance, normal: [east / length, south / length, (2 * SLOPE_SPAN) / length] as const };
  }
  return null;
}

/** The ground and the course's blocks as boxes from their undersides to their tops: the nearest surface a ray meets
 *  entering it, with that face's normal. The ground is open ground at height zero, or the land `groundAt` gives. A ray
 *  starting inside a box does not meet it. */
export function surfacesOf(blocks: readonly Block[], groundAt?: LandAt): Surfaces {
  return (from, direction, reach) => {
    let nearest: SurfaceHit | null = null;
    const keep = (distance: number, normal: Vector) => {
      if (distance >= 0 && distance <= reach && (!nearest || distance < nearest.distance))
        nearest = { distance, normal };
    };
    const land = groundAt && landHit(groundAt, from, direction, reach);
    if (land) keep(land.distance, land.normal);
    else if (!groundAt && direction[2] < 0 && from[2] >= 0) keep(from[2] / -direction[2], [0, 0, 1]);
    const [fromX, fromY, fromZ] = [from[0] ?? 0, from[1] ?? 0, from[2] ?? 0];
    const [stepX, stepY, stepZ] = [direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0];
    // The box the ray sweeps within its reach: a block wholly outside it is never met, and is passed over at once.
    const [toX, toY, toZ] = [fromX + stepX * reach, fromY + stepY * reach, fromZ + stepZ * reach];
    const [westmost, eastmost] = [Math.min(fromX, toX), Math.max(fromX, toX)];
    const [northmost, southmost] = [Math.min(fromY, toY), Math.max(fromY, toY)];
    const [lowest, highest] = [Math.min(fromZ, toZ), Math.max(fromZ, toZ)];
    let [enter, leave, axisEntered] = [0, 0, -1];
    // One axis's slab: where the ray enters and leaves it, kept as the latest entry and earliest exit.
    const slab = (start: number, step: number, lowEdge: number, highEdge: number, axis: number) => {
      if (Math.abs(step) < 1e-12) {
        if (start < lowEdge || start > highEdge) leave = -Infinity;
        return;
      }
      const one = (lowEdge - start) / step;
      const other = (highEdge - start) / step;
      const near = Math.min(one, other);
      if (near > enter) {
        enter = near;
        axisEntered = axis;
      }
      leave = Math.min(leave, Math.max(one, other));
    };
    for (const block of blocks) {
      if (block.maxX < westmost || block.minX > eastmost || block.maxY < northmost || block.minY > southmost) continue;
      if (block.top < lowest || block.bottom > highest) continue;
      enter = -Infinity;
      leave = Infinity;
      axisEntered = -1;
      slab(fromX, stepX, block.minX, block.maxX, 0);
      slab(fromY, stepY, block.minY, block.maxY, 1);
      slab(fromZ, stepZ, block.bottom, block.top, 2);
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
  private fighters(fight: Fighting): Map<number, { key: string; view: FighterView; player: boolean }> {
    const seen = new Map<number, { key: string; view: FighterView; player: boolean }>();
    const own = fight.own;
    if (own) seen.set(fight.player, { key: `player ${fight.player}`, view: own, player: true });
    for (const other of fight.others.values())
      if (other.fighter)
        seen.set(other.player, { key: `player ${other.player}`, view: fighterView(other.fighter), player: true });
    // A crewman on the players' side is a foe of the room's, and his blood is a foe's.
    for (const foe of fight.foes.values()) seen.set(foe.id, { key: `foe ${foe.id}`, view: foe.view, player: false });
    return seen;
  }

  /** This frame's blood, `seconds` long, from the events the fight handed over, drawn from `camera`, which is measured
   *  from the blood's origin. */
  frame(seconds: number, events: readonly FightEvent[], fight: Fighting, camera: BloodCamera): void {
    if (!this.view) return;
    const fighters = this.fighters(fight);
    for (const event of events) {
      const defender = fighters.get(event.defender)?.view;
      if (event.kind !== EVENT.hit || event.amount <= 0 || !defender) continue;
      const striking = fighters.get(event.striker);
      const striker = striking?.view;
      const player = !!striker && !!striking?.player;
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
