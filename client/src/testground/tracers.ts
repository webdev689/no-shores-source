import { type Orbit, rayAt } from '../editor/orbit.ts';
import type { FlyingShot } from '../network/messages.ts';
import { rayHit } from '../player/playerCamera.ts';
import type { Fired } from '../rules/combatRules.ts';
import type { Block } from '../rules/movementRules.ts';
import { bodyHit } from './crosshair.ts';
import { markArrow } from '../combat/marks.ts';

type Point = readonly [number, number, number];
type Colour = readonly [number, number, number, number];

/** A tick of the rules, and how fast an arrow or a bolt falls (crates/combat/src/shots.rs FALL), m/s². */
const TICK = 1 / 60;
/** A foe's ball still flying that no snapshot has carried on for this long was let go of unstopped (its shooter sent
 *  away, or the room lost): it is dropped, throwing no sparks. */
const UNCARRIED_DROP = 1;
const FALL = 6;
/** The guns' numbers, as the combat crate numbers its ranged weapons: a Pistolet and a Thunderlock fire balls. */
const BALLS = new Set([3, 4]);
/** A ball's tracer: its head races out this fast (m/s), slower than a ball that reaches its mark at once so the eye can
 *  follow it (a travelling ball's goes at the ball's own pace), with a streak this long behind it (metres) that stays
 *  at the end once there and fades over this long (seconds), the whole line faintly behind it; a flash at the muzzle
 *  lasts this long and is this wide (metres). */
const BALL = { speed: 350, streak: 6, fade: 0.3, trace: 0.22, flash: 0.06, flashSize: 0.16 } as const;
/** An arrow's trail: this long of its flight (seconds) behind it, lingering this long once it stops; a shot's trail
 *  comes out of the drawn bow or barrel and joins its true flight within this long. */
const ARROW = { trail: 0.3, linger: 0.3, converge: 0.15, life: 4 } as const;
/** Each tracer's two ribbons: a hot core and a wider glow (widths in metres, colours). */
const CORE = { width: 0.03, colour: [1, 0.96, 0.8, 1] as Colour };
const GLOW = { width: 0.13, colour: [1, 0.6, 0.2, 0.5] as Colour };
const ARROW_CORE = { width: 0.022, colour: [0.96, 0.98, 1, 0.9] as Colour };
const ARROW_GLOW = { width: 0.08, colour: [0.75, 0.86, 1, 0.32] as Colour };

/** Where a shot came to rest, and the way back over the ground it came from. */
export interface Impact {
  readonly at: Point;
  readonly back: readonly [number, number];
}

/** A ball's line, from its muzzle to the farthest it is known to reach, seconds after it was fired, and how fast its
 *  head follows it (m/s). One from the room keeps whose it is and the ticks it had flown when the room last carried it
 *  on: a foe's ball travels, and each tick's snapshot carries it a tick farther until the one that says it stopped.
 *  Until then its head is held short of the farthest point, so a late or paused snapshot never reads as a strike. */
interface Line {
  readonly from: Point;
  to: Point;
  age: number;
  readonly speed: number;
  readonly owner: number | null;
  ticks: number;
  stopped: boolean;
  /** Seconds since a snapshot last carried it on. */
  quiet: number;
}

/** The player's own arrow or bolt, flown here as the rules fly it: where it left their weapon, where the rules
 *  loosed it, where it is and how fast it goes, seconds flown, and seconds since it stopped. */
interface Flight {
  readonly muzzle: Point;
  readonly launch: Point;
  at: Point;
  velocity: Point;
  flown: number;
  stopped: number | null;
}

/** An arrow or a bolt `seconds` before it was at `place` going `velocity`, by its fall. */
export function before(place: Point, velocity: Point, seconds: number): Point {
  return [
    place[0] - velocity[0] * seconds,
    place[1] - velocity[1] * seconds,
    place[2] - velocity[2] * seconds - 0.5 * FALL * seconds * seconds,
  ];
}

const add = (point: Point, other: Point, share = 1): Point => [
  point[0] + other[0] * share,
  point[1] + other[1] * share,
  point[2] + other[2] * share,
];
const minus = (point: Point, other: Point): Point => [point[0] - other[0], point[1] - other[1], point[2] - other[2]];

/** A ribbon along `points` turned to face `eye`, each point its own width and colour, as mark triangles. */
export function ribbon(out: number[], eye: Point, points: readonly { at: Point; width: number; colour: Colour }[]) {
  const sides = points.map((point, index) => {
    const ahead = points[Math.min(points.length - 1, index + 1)]?.at ?? point.at;
    const behind = points[Math.max(0, index - 1)]?.at ?? point.at;
    const along = minus(ahead, behind);
    const look = minus(eye, point.at);
    const side: Point = [
      along[1] * look[2] - along[2] * look[1],
      along[2] * look[0] - along[0] * look[2],
      along[0] * look[1] - along[1] * look[0],
    ];
    const length = Math.hypot(...side) || 1;
    return [side[0] / length, side[1] / length, side[2] / length] as Point;
  });
  for (let index = 0; index + 1 < points.length; index++) {
    const [first, second] = [points[index], points[index + 1]];
    const [firstSide, secondSide] = [sides[index], sides[index + 1]];
    if (!first || !second || !firstSide || !secondSide) continue;
    const corner = (point: typeof first, side: Point, sign: number) => [
      ...add(point.at, side, (sign * point.width) / 2),
      ...point.colour,
    ];
    const quad = [
      corner(first, firstSide, -1),
      corner(second, secondSide, -1),
      corner(second, secondSide, 1),
      corner(first, firstSide, 1),
    ];
    for (const vertex of [0, 1, 2, 0, 2, 3]) out.push(...(quad[vertex] ?? []));
  }
}

/** A colour with its opacity scaled. */
const faded = (colour: Colour, share: number): Colour => [colour[0], colour[1], colour[2], colour[3] * share];

/**
 * The tracers of every shot: a ball's line raced out from its muzzle to where it stopped and fading, with a flash at
 * the muzzle; an arrow's or a bolt's trail along its falling flight. The player's own come from the shots their own
 * ticks fired, out of the weapon as drawn and at once; everyone else's from the room's snapshots.
 */
export class Tracers {
  private lines: Line[] = [];
  private flights: Flight[] = [];

  /** The player's own shots, each leaving the weapon as drawn at its `muzzle`. */
  fired(shots: readonly Fired[], muzzleOf: (shot: Fired) => Point): void {
    for (const shot of shots) {
      const muzzle = muzzleOf(shot);
      const to = add(shot.at, shot.velocity, TICK);
      if (BALLS.has(shot.ranged))
        this.lines.push({
          from: muzzle,
          to,
          age: 0,
          speed: BALL.speed,
          owner: null,
          ticks: 0,
          stopped: true,
          quiet: 0,
        });
      else
        this.flights.push({ muzzle, launch: shot.at, at: shot.at, velocity: shot.velocity, flown: 0, stopped: null });
    }
  }

  /** Everyone else's balls, from the shots of snapshots each handed over once (Fighting's takeShots). A ball that
   *  reaches its mark at once comes whole in the one snapshot after it was fired; one that travels comes a tick's
   *  length in each, carrying its owner's line on, and its first fires it. Its last says it stopped, with the point it
   *  left its gun: its line ends there at once. One first seen flying is reckoned back along its flight to its muzzle. */
  seen(shots: readonly FlyingShot[], player: number): void {
    for (const shot of shots) {
      if (shot.owner === player || !BALLS.has(shot.ranged)) continue;
      const to = add(shot.at, shot.velocity, TICK);
      const stopped = shot.muzzle !== null;
      const carried =
        shot.age > 0 && this.lines.find((line) => line.owner === shot.owner && !line.stopped && line.ticks <= shot.age);
      if (carried) {
        Object.assign(carried, { to, ticks: shot.age, stopped, quiet: 0 });
        continue;
      }
      const from = shot.muzzle ?? add(shot.at, shot.velocity, -shot.age * TICK);
      // A stopped ball's last segment is short of a tick's flight: its speed is how far it flew before it.
      const speed = shot.muzzle && shot.age > 0 ? Math.hypot(...minus(shot.at, from)) / (shot.age * TICK) : null;
      this.lines.push({
        from,
        to,
        // Its head a tick behind where the room has it, so a snapshot come late does not stall it.
        age: Math.max(0, shot.age - 1) * TICK,
        speed: Math.min(BALL.speed, speed ?? Math.hypot(...shot.velocity)),
        owner: shot.owner,
        ticks: shot.age,
        stopped,
        quiet: 0,
      });
    }
  }

  /** Runs every tracer on by `seconds`: the player's own arrows fly a tick at a time until a block, the ground or one
   *  of `bodies` (feet) stops them. Answers where a ball's head or an arrow came to rest this time, and the way back
   *  over the ground it came from, for the sparks it throws there. */
  update(seconds: number, blocks: readonly Block[], bodies: readonly Point[]): Impact[] {
    const impacts: Impact[] = [];
    const back = (from: Point, to: Point): readonly [number, number] => {
      const length = Math.hypot(from[0] - to[0], from[1] - to[1]) || 1;
      return [(from[0] - to[0]) / length, (from[1] - to[1]) / length];
    };
    for (const line of this.lines) {
      const arrives = this.arrival(line);
      line.quiet += seconds;
      if (!line.stopped) {
        line.age = Math.max(line.age, Math.min(line.age + seconds, arrives - TICK));
        continue;
      }
      if (line.age < arrives && line.age + seconds >= arrives)
        impacts.push({ at: line.to, back: back(line.from, line.to) });
      line.age += seconds;
    }
    this.lines = this.lines.filter((line) =>
      line.stopped ? line.age < this.arrival(line) + BALL.fade : line.quiet < UNCARRIED_DROP,
    );
    for (const flight of this.flights) {
      if (flight.stopped !== null) {
        flight.stopped += seconds;
        continue;
      }
      for (let left = seconds; left > 1e-9 && flight.stopped === null; left -= TICK) {
        const step = Math.min(TICK, left);
        const velocity: Point = [flight.velocity[0], flight.velocity[1], flight.velocity[2] - FALL * step];
        const along: Point = [velocity[0] * step, velocity[1] * step, velocity[2] * step];
        const to = add(flight.at, along);
        let share = rayHit(flight.at, to, blocks);
        if (to[2] < 0 && flight.at[2] >= 0) share = Math.min(share, flight.at[2] / (flight.at[2] - to[2]));
        for (const feet of bodies) share = Math.min(share, bodyHit(flight.at, along, feet) ?? 1);
        flight.at = add(flight.at, along, share);
        flight.velocity = velocity;
        flight.flown += step * share;
        if (share < 1 || flight.flown > ARROW.life) flight.stopped = 0;
        if (share < 1) impacts.push({ at: flight.at, back: back(flight.launch, flight.at) });
      }
    }
    this.flights = this.flights.filter((flight) => flight.stopped === null || flight.stopped < ARROW.linger);
    return impacts;
  }

  /** When a ball's head reaches the farthest it is known to reach, seconds after it was fired. */
  private arrival(line: Line): number {
    return Math.hypot(...minus(line.to, line.from)) / line.speed;
  }

  /** The tracers' triangles as seen from `eye`, with the player's own arrows and everyone else's arrows' trails (from
   *  the room's `shots`, the player's own left out). */
  mesh(eye: Point, shots: readonly FlyingShot[], player: number): number[] {
    const out: number[] = [];
    for (const line of this.lines) this.lineMesh(out, eye, line);
    for (const flight of this.flights) {
      const fade = flight.stopped === null ? 1 : 1 - flight.stopped / ARROW.linger;
      // Out of the drawn weapon, joining the true flight within ARROW.converge.
      const offset = minus(flight.muzzle, flight.launch);
      const shown = (flown: number) => {
        const true_ = before(flight.at, flight.velocity, flight.flown - flown);
        return add(true_, offset, Math.max(0, 1 - flown / ARROW.converge));
      };
      this.trailMesh(out, eye, shown, flight.flown, fade);
      if (flight.stopped === null) markArrow(out, shown(flight.flown), flight.velocity);
    }
    for (const shot of shots) {
      if (shot.owner === player || BALLS.has(shot.ranged)) continue;
      const flown = shot.age * TICK;
      this.trailMesh(out, eye, (time) => before(shot.at, shot.velocity, flown - time), flown, 1);
    }
    return out;
  }

  /** A ball's line: its head raced out with a streak behind it, a faint trace along the whole of it, both fading once
   *  the head arrives, and a flash at the muzzle. */
  private lineMesh(out: number[], eye: Point, line: Line): void {
    const length = Math.hypot(...minus(line.to, line.from));
    if (length < 1e-6) return;
    const along = (distance: number) => add(line.from, minus(line.to, line.from), distance / length);
    const head = Math.min(length, line.age * line.speed);
    const tail = Math.max(0, head - BALL.streak);
    const fade = 1 - Math.max(0, line.age - this.arrival(line)) / BALL.fade;
    const point = (distance: number, ribbonOf: typeof CORE, share: number) => ({
      at: along(distance),
      width: ribbonOf.width,
      colour: faded(ribbonOf.colour, share * fade),
    });
    for (const layer of [GLOW, CORE]) {
      ribbon(out, eye, [point(0, layer, BALL.trace), point(head, layer, BALL.trace)]);
      if (head > tail)
        ribbon(out, eye, [point(tail, layer, 0), point((tail + head) / 2, layer, 0.6), point(head, layer, 1)]);
    }
    if (line.age < BALL.flash) {
      const size = BALL.flashSize * (1 - line.age / BALL.flash);
      const flash = (side: Point) => ({
        at: add(line.from, side, size),
        width: size,
        colour: [1, 0.78, 0.35, 0.9] as Colour,
      });
      const toward = minus(line.to, line.from);
      const unit: Point = [toward[0] / length, toward[1] / length, toward[2] / length];
      ribbon(out, eye, [flash([-unit[0], -unit[1], -unit[2]]), flash(unit)]);
    }
  }

  /** A trail along a flight `shown` at each second flown, over its last ARROW.trail behind `flown`. */
  private trailMesh(out: number[], eye: Point, shown: (flown: number) => Point, flown: number, fade: number): void {
    const start = Math.max(0, flown - ARROW.trail);
    if (flown - start < 1e-4) return;
    const steps = 10;
    for (const layer of [ARROW_GLOW, ARROW_CORE]) {
      const points = Array.from({ length: steps + 1 }, (unused, step) => {
        const share = step / steps;
        return {
          at: shown(start + (flown - start) * share),
          width: layer.width,
          colour: faded(layer.colour, share * fade),
        };
      });
      ribbon(out, eye, points);
    }
  }
}

/** Where a shot leaves a weapon on the screen: the first person's muzzle carried out along its ray this far, in metres;
 *  and the sparks a shot throws where it comes to rest. */
export const MUZZLE_OUT = 0.55;
export const IMPACT_SPARKS = 6;

/** The first person's muzzle in the world: its point on the design screen (320 by 200 pixels over the whole canvas)
 *  carried out from the eye along the view's ray through it. */
export function screenMuzzle(orbit: Orbit, aspect: number, design: readonly [number, number]): Point {
  const { origin, direction } = rayAt(orbit, aspect, design[0] / 160 - 1, 1 - design[1] / 100);
  return add(origin, direction, MUZZLE_OUT);
}

/** The arrows and bolts in flight the scene draws from the room's word: everyone's but the player's own, whose own
 *  ticks fly theirs; a ball's line is a tracer's, not an arrow. */
export function othersArrows(shots: readonly FlyingShot[], player: number): FlyingShot[] {
  return shots.filter((shot) => shot.owner !== player && !BALLS.has(shot.ranged));
}

/** Where a shot leaves a figure's weapon seen from outside: ahead of its chest along `bearing`, a little to its right. */
export function figureMuzzle(feet: Point, bearing: number): Point {
  const [ahead, right, up] = [0.5, 0.18, 1.3];
  return [
    feet[0] + Math.sin(bearing) * ahead + Math.cos(bearing) * right,
    feet[1] - Math.cos(bearing) * ahead + Math.sin(bearing) * right,
    feet[2] + up,
  ];
}
