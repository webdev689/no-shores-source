import { Bleeding, type BodySeen } from '../combat/blood/bleeding.ts';
import { BloodMarks, GORE_NORMAL, type SurfaceHit, type Surfaces, bloodOn } from '../combat/blood/marks.ts';
import { type Vector, thrownAway } from '../combat/blood/spray.ts';
import { BloodView } from '../combat/blood/view.ts';
import { EVENT } from '../combat/cues.ts';
import type { Fighting } from '../combat/fighting.ts';
import { type Orbit, REVERSED_DEPTH, cameraOf, viewProjection } from '../editor/orbit.ts';
import type { Gpu } from '../gpu.ts';
import type { FightEvent } from '../network/messages.ts';
import { type FighterView, fighterView } from '../rules/fighters.ts';
import type { Block } from '../rules/movementRules.ts';

/** A body's height (combat's tuning); a body bleeds at five eighths of it, its capsule's middle and an eighth more. */
export const BODY_HEIGHT = 1.8;
/** The arms code's melee byte for a warhammer (combat's WeaponClass), whose overkill takes DFO's heavy branch. */
const WARHAMMER = 6;

export const chestOf = (view: FighterView): Vector => [view.x, view.y, view.z + (BODY_HEIGHT * 5) / 8];

/** The ground at height zero and the course's blocks as boxes from the ground to their tops: the nearest surface a ray
 *  meets entering it, with that face's normal. A ray starting inside a box does not meet it. */
export function surfacesOf(blocks: readonly Block[]): Surfaces {
  return (from, direction, reach) => {
    let nearest: SurfaceHit | null = null;
    const keep = (distance: number, normal: Vector) => {
      if (distance >= 0 && distance <= reach && (!nearest || distance < nearest.distance))
        nearest = { distance, normal };
    };
    if (direction[2] < 0 && from[2] >= 0) keep(from[2] / -direction[2], [0, 0, 1]);
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
 * The Test Ground's blood: each hit in the fight's events marks the struck body's chest, thrown away from its
 * striker; every fighter, foes and players alike, is seen each frame by its health and feet for its trail, its prints
 * and, once dead, its pool. `?blood=off` turns it all off.
 */
export class TestgroundBlood {
  private readonly marks: BloodMarks;
  private readonly bleeding = new Bleeding(Math.random);
  private readonly view: BloodView | null;

  constructor(gpu: Gpu, blocks: readonly Block[], search: string) {
    const enabled = bloodOn(search);
    this.marks = new BloodMarks({ surfaces: surfacesOf(blocks), enabled });
    this.view = enabled ? new BloodView(gpu, GORE_NORMAL.capacity, REVERSED_DEPTH) : null;
  }

  /** Every fighter the page knows, keyed by who it is, with the id the room's events name it by. */
  private fighters(fight: Fighting): Map<number, { key: string; view: FighterView }> {
    const seen = new Map<number, { key: string; view: FighterView }>();
    const own = fight.own;
    if (own) seen.set(fight.player, { key: `player ${fight.player}`, view: own });
    for (const other of fight.others.values())
      seen.set(other.player, { key: `player ${other.player}`, view: fighterView(other.fighter) });
    for (const foe of fight.foes.values()) seen.set(foe.id, { key: `foe ${foe.id}`, view: foe.view });
    return seen;
  }

  /** This frame's blood, `seconds` long, from the events the fight handed over, drawn from `orbit`. */
  frame(seconds: number, events: readonly FightEvent[], fight: Fighting, orbit: Orbit, aspect: number): void {
    if (!this.view) return;
    const fighters = this.fighters(fight);
    for (const event of events) {
      const defender = fighters.get(event.defender)?.view;
      if (event.kind !== EVENT.hit || !defender) continue;
      const striker = fighters.get(event.striker)?.view;
      const heavy = striker?.side === 'players' && (striker.arms & 0xff) === WARHAMMER;
      const thrown: readonly [number, number] = striker
        ? thrownAway([striker.x, striker.y, striker.z], [defender.x, defender.y, defender.z])
        : [0, 0];
      this.marks.place(chestOf(defender), { damage: event.amount, healthMax: defender.healthMax, heavy, thrown });
    }
    const bodies: BodySeen[] = [...fighters.values()].map(({ key, view }) => ({
      key,
      feet: [view.x, view.y, view.z],
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
    const { eye, right } = cameraOf(orbit);
    const focus: Vector = [orbit.targetX, orbit.targetY, orbit.targetZ];
    this.view.update(this.marks, { viewProjection: viewProjection(orbit, aspect), focus, eye, right });
  }

  draw(pass: GPURenderPassEncoder): void {
    this.view?.draw(pass);
  }
}
