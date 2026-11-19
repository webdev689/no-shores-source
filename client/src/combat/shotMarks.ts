// What a shot leaves where it stops, by what it struck: a body takes a star of light (and keeps an arrow until it
// falls), the ground throws dust and keeps a ball's hole or an arrow for 8 s, stone throws chips (its sparks are
// the fight's own), and water throws a splash and rings. A ball also flashes where it stops.
import type { Block } from '../rules/movementRules.ts';
import { markRing, markStuckArrow } from './marks.ts';
import { POWDER, STEEL, WATER, type Ramp, layPicture, rampOf, starSprite } from './markSprites.ts';
import { CELL_M, CLEAR, DARK, BODY, LIGHT, HOT, type Sprite, hashOf, sprite } from './spellPixels.ts';

type Point = readonly [number, number, number];
export type Surface = 'body' | 'ground' | 'stone' | 'water';

/** A body's reach from its feet, as the rules' upright cylinder: its radius and height, and a little to spare. */
const BODY_REACH = { radius: 0.45, height: 1.9 } as const;
/** How near a point must lie to the ground or a block to have struck it (metres); below the sea's level, water. */
const TOUCH_M = 0.12;
const SEA_LEVEL = 0;
/** Earth's dust and stone's chips, dark to light. */
const DUST = rampOf('#2e2418', '#5a4630', '#8a7050', '#b8a07a');
const STONE = rampOf('#2c2c32', '#5c5c66', '#9a9aa4', '#dadae0');
/** The bits each strike throws: how many, how fast (m/s), how long they fly (seconds); and the pull on them. */
const THROWN = { dust: { count: 8, speed: 2.4, life: 0.5 }, chips: { count: 7, speed: 3.2, life: 0.45 } } as const;
const GRAVITY = 9.81;
/** A body's star: across (metres), its stage each frame white-hot, a stop cooler, then its body stop. */
const BODY_STAR_M = 0.35;
/** A ball's flash where it stops (metres across), for two frames. */
const BALL_FLASH_M = 0.3;
const FRAME_S = 1 / 60;
/** What a strike leaves is not aged by the frame it came in, so its first frame is always seen. */
const UNSHOWN = -1;
/** How long a ball's hole and an arrow left on the ground or a wall last (seconds), the most kept, a hole's size. */
const KEPT_S = 8;
const MOST_KEPT = 24;
const HOLE_CELLS = 5;
/** A splash: its column's height (metres) and time up and down (seconds), its rings' widest (metres). */
const SPLASH = { high: 0.6, life: 0.45, ring: 0.8 } as const;
/** An arrow in a body stands toward the eye as the card it is drawn on does, and follows the body while one is this
 *  near where it last stood; else it fell, and the arrow with it. */
const TOWARD_EYE_M = 0.4;
const FOLLOW_M = 0.8;

/** What a point a shot stopped at struck: a body (`bodies`' feet), a block, the ground (`groundAt`'s, else level at
 *  0, water below the sea's level), or nothing. */
export function surfaceAt(
  point: Point,
  blocks: readonly Block[],
  bodies: readonly Point[],
  groundAt?: (x: number, y: number) => number | null,
): { surface: Surface; feet?: Point } | null {
  const [x, y, z] = point;
  for (const feet of bodies) {
    const high = z - feet[2];
    if (Math.hypot(x - feet[0], y - feet[1]) <= BODY_REACH.radius && high >= -0.1 && high <= BODY_REACH.height)
      return { surface: 'body', feet };
  }
  const ground = groundAt?.(x, y) ?? 0;
  if (z <= SEA_LEVEL + TOUCH_M && ground < SEA_LEVEL - 0.02) return { surface: 'water' };
  if (z <= ground + TOUCH_M) return { surface: 'ground' };
  const touches = (block: Block) =>
    x >= block.minX - TOUCH_M &&
    x <= block.maxX + TOUCH_M &&
    y >= block.minY - TOUCH_M &&
    y <= block.maxY + TOUCH_M &&
    z <= block.top + TOUCH_M;
  return blocks.some(touches) ? { surface: 'stone' } : null;
}

/** Where a line from `from` to `to` crosses the sea's level, if it goes under it there (over water); else `to`. */
export function overSea(from: Point, to: Point, groundAt?: (x: number, y: number) => number | null): Point {
  if (to[2] >= SEA_LEVEL || from[2] <= SEA_LEVEL || (groundAt?.(to[0], to[1]) ?? 0) >= SEA_LEVEL) return to;
  const share = (from[2] - SEA_LEVEL) / (from[2] - to[2]);
  return [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share, SEA_LEVEL];
}

/** A bit thrown: where it flew from, how fast, its seconds and life, its ramp. */
interface Bit {
  readonly from: Point;
  readonly velocity: Point;
  readonly life: number;
  readonly ramp: Ramp;
  age: number;
}
/** A strike's flash or splash: where, what struck, and its seconds. */
interface Strike {
  readonly at: Point;
  readonly surface: Surface;
  readonly ball: boolean;
  age: number;
}
/** What a shot left: a ball's hole on the ground, or an arrow in the ground, a wall or a body (its feet as they
 *  stand, and where it sits off them). */
interface Left {
  readonly at: Point;
  readonly way: Point;
  readonly hole: boolean;
  readonly struck: Point | null;
  feet: Point | null;
  age: number;
}

const BODY_STARS: readonly Sprite[] = [0, 1, 2].map((cooled) => {
  const star = starSprite(3);
  return { ...star, cells: star.cells.map((stop) => (stop >= 0 ? Math.max(DARK, stop - cooled) : stop)) };
});
const HOLE: Sprite = sprite(HOLE_CELLS, HOLE_CELLS, (across, up) => {
  const apart = Math.hypot(across, up);
  if (apart > 2.3) return CLEAR;
  return apart > 1.4 ? BODY : DARK;
});
const BITS: readonly Sprite[] = [DARK, BODY, LIGHT, HOT].map((stop) => sprite(1, 1, () => stop));
/** A splash's column at each of its four steps: rising, full, falling, broken. */
const SPLASH_STEPS: readonly Sprite[] = [0.5, 1, 0.75, 0.4].map((height, step) =>
  sprite(5, 12, (across, up) => {
    const fromFoot = up + 5.5;
    if (fromFoot > height * 12 || Math.abs(across) > 2 - fromFoot / 8) return CLEAR;
    if (step === 3 && hashOf(across, up) < 0.5) return CLEAR;
    return fromFoot > height * 9 ? HOT : fromFoot > height * 4 ? LIGHT : BODY;
  }),
);

/** Everything shots have left where they stopped, seen from any eye. */
export class ShotMarks {
  private bits: Bit[] = [];
  private strikes: Strike[] = [];
  private left: Left[] = [];

  /** A shot stopped at `place` flying `way` (a unit vector), a ball's or an arrow's, on `surface` (a body's `feet`). */
  strike(surface: Surface, place: Point, way: Point, ball: boolean, feet?: Point): void {
    this.strikes.push({ at: place, surface, ball, age: UNSHOWN });
    if (surface === 'ground') this.throw(place, way, THROWN.dust, DUST, ball ? 1 : 0.6);
    if (surface === 'stone') this.throw(place, way, THROWN.chips, STONE, 1);
    const keeps = (surface === 'ground' && ball) || (!ball && surface !== 'water');
    if (!keeps) return;
    const held: Point | null = surface === 'body' && feet ? [feet[0], feet[1], feet[2]] : null;
    this.left.push({ at: place, way, hole: ball, struck: held, feet: held, age: UNSHOWN });
    if (this.left.length > MOST_KEPT) this.left.shift();
  }

  /** Runs everything on by `seconds`: an arrow in a body follows it among `bodies` (feet), or falls with it. */
  update(seconds: number, bodies: readonly Point[]): void {
    for (const each of [...this.bits, ...this.strikes, ...this.left])
      each.age = each.age === UNSHOWN ? 0 : each.age + seconds;
    this.bits = this.bits.filter((bit) => bit.age < bit.life);
    this.strikes = this.strikes.filter((strike) => strike.age < (strike.surface === 'water' ? SPLASH.life : 0.1));
    for (const left of this.left) {
      const was = left.feet;
      if (!was) continue;
      let nearest: Point | null = null;
      for (const feet of bodies)
        if (
          Math.hypot(feet[0] - was[0], feet[1] - was[1]) < FOLLOW_M &&
          (!nearest || near(feet, was) < near(nearest, was))
        )
          nearest = feet;
      left.feet = nearest;
    }
    // An arrow in a body stays while the body stands; one whose body is gone goes with it.
    this.left = this.left.filter((left) => (left.struck ? left.feet !== null : left.age < KEPT_S));
  }

  /** How many shots' leavings are kept. */
  get kept(): number {
    return this.left.length;
  }

  mesh(out: number[], eye: Point): void {
    for (const bit of this.bits) {
      const [time, velocity] = [Math.max(0, bit.age), bit.velocity];
      const place: Point = [
        bit.from[0] + velocity[0] * time,
        bit.from[1] + velocity[1] * time,
        bit.from[2] + velocity[2] * time - (GRAVITY * time * time) / 2,
      ];
      const stop = 3 - Math.min(3, Math.floor((Math.max(0, bit.age) / bit.life) * 4));
      const picture = BITS[stop];
      if (picture) layPicture(out, picture, bit.ramp, place, eye, { cell: CELL_M });
    }
    for (const strike of this.strikes) this.strikeMesh(out, strike, eye);
    for (const left of this.left) {
      if (left.hole) {
        layPicture(out, HOLE, DUST, [left.at[0], left.at[1], left.at[2] + 0.01], eye, {
          cell: CELL_M,
          up: [0, 1, 0],
          right: [1, 0, 0],
        });
        continue;
      }
      const { struck, feet } = left;
      if (!struck || !feet) {
        markStuckArrow(out, left.at, left.way);
        continue;
      }
      const moved: Point = [
        left.at[0] + feet[0] - struck[0],
        left.at[1] + feet[1] - struck[1],
        left.at[2] + feet[2] - struck[2],
      ];
      markStuckArrow(out, towardEye(moved, eye, TOWARD_EYE_M), left.way);
    }
  }

  /** A strike's own look: a ball's flash, a body's star, a splash. */
  private strikeMesh(out: number[], strike: Strike, eye: Point): void {
    const frame = Math.floor(Math.max(0, strike.age) / FRAME_S + 1e-6);
    if (strike.surface === 'water') {
      const share = Math.max(0, strike.age) / SPLASH.life;
      const column = SPLASH_STEPS[Math.min(3, Math.floor(share * 4))];
      const cell = SPLASH.high / 12;
      if (column)
        layPicture(out, column, WATER, [strike.at[0], strike.at[1], strike.at[2] + SPLASH.high / 2], eye, { cell });
      const radius = (SPLASH.ring * Math.ceil(share * 3)) / 3;
      const colour = WATER[share < 0.5 ? 3 : 2];
      const ring = [colour[0], colour[1], colour[2], 1] as const;
      markRing(out, [strike.at[0], strike.at[1], strike.at[2] - 0.02], radius - 0.05, radius, ring);
      return;
    }
    if (strike.surface === 'body') {
      const star = BODY_STARS[Math.min(2, frame)];
      if (star && frame < 3)
        layPicture(out, star, strike.ball ? POWDER : STEEL, towardEye(strike.at, eye, TOWARD_EYE_M), eye, {
          cell: BODY_STAR_M / star.width,
        });
    }
    if (strike.ball && frame < 2) {
      const star = BODY_STARS[frame];
      if (star) layPicture(out, star, POWDER, strike.at, eye, { cell: BALL_FLASH_M / star.width });
    }
  }

  private throw(
    place: Point,
    way: Point,
    look: { count: number; speed: number; life: number },
    ramp: Ramp,
    share: number,
  ) {
    const count = Math.round(look.count * share);
    for (let bit = 0; bit < count; bit++) {
      const random = (axis: number) => hashOf(place[0] * 97, place[1] * 89, bit, axis);
      const speed = look.speed * (0.6 + 0.8 * random(0));
      // Back the way the shot came, and up.
      const velocity: Point = [
        (-way[0] + (random(1) - 0.5) * 1.6) * speed * 0.6,
        (-way[1] + (random(2) - 0.5) * 1.6) * speed * 0.6,
        (0.6 + random(3)) * speed,
      ];
      this.bits.push({ from: place, velocity, life: look.life * (0.7 + 0.6 * random(4)), ramp, age: UNSHOWN });
    }
  }
}

const near = (point: Point, other: Point): number => Math.hypot(point[0] - other[0], point[1] - other[1]);

/** `point` brought `metres` toward `eye`, or half way there if nearer. */
function towardEye(point: Point, eye: Point, metres: number): Point {
  const apart = Math.hypot(eye[0] - point[0], eye[1] - point[1], eye[2] - point[2]) || 1;
  const share = Math.min(metres, apart / 2) / apart;
  return [
    point[0] + (eye[0] - point[0]) * share,
    point[1] + (eye[1] - point[1]) * share,
    point[2] + (eye[2] - point[2]) * share,
  ];
}
