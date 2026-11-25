/** A point or a direction in the world: x and y along the ground, z up. */
export type Vector = readonly [number, number, number];
/** A colour with its alpha, each 0 to 1. */
export type Tint = [number, number, number, number];
/** A rectangle of the art a mark wears, in texture coordinates; u0 past u1 is the cell mirrored. */
export interface Cell {
  readonly kind: string;
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** A blow as blood measures it: its damage against the body's whole health, whether it is the heavy branch (a
 *  player's warhammer), and the ground offset the blow throws the spray by. */
export interface BloodHit {
  readonly damage: number;
  readonly healthMax: number;
  readonly heavy: boolean;
  readonly thrown: readonly [number, number];
}

/** DFO's numbers, read off DaggerBlood: at 175 percent of a body's health a blow is an overkill. */
export const OVERKILL_PERCENT = 175;
/** The ladder's rungs off damage over max health in percent, each inclusive at its top; past them a near-lethal blow,
 *  and at the overkill line the top. */
export const RATE_LADDER = [
  { upTo: 25, rate: 30 },
  { upTo: 50, rate: 50 },
  { upTo: 100, rate: 70 },
] as const;
export const RATE_NEAR_LETHAL = 150;
export const RATE_MAX = 200;
/** The overkill burst: the warhammer's branch or every other, thrown at speeds 5 to 10 where a blow's are 1 to 5. */
export const OVERKILL_RATE_HEAVY = 450;
export const OVERKILL_RATE = 350;
export const OVERKILL_SPEED = { min: 5, max: 10 } as const;
export const ORDINARY_SPEED = { min: 1, max: 5 } as const;
export const OVERKILL_REACH_SCALE =
  (OVERKILL_SPEED.min + OVERKILL_SPEED.max) / (ORDINARY_SPEED.min + ORDINARY_SPEED.max);

export function damagePercent(damage: number, healthMax: number): number {
  if (!(healthMax > 0) || !(damage > 0)) return 0;
  return (damage / healthMax) * 100;
}

export function ladderRate(percent: number): number {
  if (percent >= OVERKILL_PERCENT) return RATE_MAX;
  for (const rung of RATE_LADDER) if (percent <= rung.upTo) return rung.rate;
  return RATE_NEAR_LETHAL;
}

export const bloodRate = (damage: number, healthMax: number): number => ladderRate(damagePercent(damage, healthMax));

export const isOverkill = (damage: number, healthMax: number): boolean =>
  damagePercent(damage, healthMax) >= OVERKILL_PERCENT;

/** A mark's width, and a spray's reach, run between these over the ladder's own ends. */
export const MARK_SIZE_MIN = 0.35;
export const MARK_SIZE_MAX = 1.2;
export const SPRAY_RADIUS_MIN = 0.35;
export const SPRAY_RADIUS_MAX = 1.8;
const alongLadder = (rate: number): number => {
  const lowest = ladderRate(0);
  return Math.max(0, Math.min(1, (rate - lowest) / (RATE_MAX - lowest)));
};
export const markSize = (rate: number): number => MARK_SIZE_MIN + (MARK_SIZE_MAX - MARK_SIZE_MIN) * alongLadder(rate);
export const sprayRadius = (rate: number): number =>
  SPRAY_RADIUS_MIN + (SPRAY_RADIUS_MAX - SPRAY_RADIUS_MIN) * alongLadder(rate);

/** The share of a spray's blood that reaches a surface, and the most drops one blow lays. */
export const SPRAY_SHARE = 0.12;
export const SPRAY_MAX = 24;
export function sprayCount(rate: number): number {
  if (!(rate > 0)) return 1;
  return Math.max(1, Math.min(SPRAY_MAX, Math.round(rate * SPRAY_SHARE)));
}

/** The burst's own ceiling, so a warhammer and a dagger do not leave the same mess. */
export const BURST_DROPS_MAX = 48;
export const burstRate = (heavy: boolean): number => (heavy ? OVERKILL_RATE_HEAVY : OVERKILL_RATE);
export const burstCount = (heavy: boolean): number =>
  Math.max(1, Math.min(BURST_DROPS_MAX, Math.round(burstRate(heavy) * SPRAY_SHARE)));
export const burstReach = (heavy: boolean): number => sprayRadius(burstRate(heavy)) * OVERKILL_REACH_SCALE;

/** Where a spray's drops fall: one to three lobes the blow threw, a share of strays, reach biased outward with a few
 *  flyers past it, sizes skewed many small and few large. The golden ratio's family mixes the draws so a spray never
 *  piles on one spot even under a held generator. Drop zero is always the body's own spot at scale one. */
export const SPRAY_LOBES_MAX = 3;
export const SPRAY_LOBE_SPREAD = 0.42;
export const SPRAY_STRAY = 0.18;
export const SPRAY_NEAR = 0.18;
export const SPRAY_FLYER = 0.08;
export const SPRAY_FLYER_REACH = 1.35;
export const SPRAY_SCALE_MIN = 0.3;
export const SPRAY_SCALE_MAX = 2.1;
const TAU = Math.PI * 2;
const fraction = (value: number): number => value - Math.floor(value);
export const gaussian = (first: number, second: number): number =>
  Math.sqrt(-2 * Math.log(Math.max(1e-6, 1 - first))) * Math.cos(TAU * second);

/** A roll of one half is scale one; below it falls toward the minimum, above it rises as a cube toward the maximum. */
export function sprayScale(roll: number): number {
  const value = Math.max(0, Math.min(1, roll));
  return value < 0.5
    ? SPRAY_SCALE_MIN + (1 - SPRAY_SCALE_MIN) * Math.pow(2 * value, 1.5)
    : 1 + (SPRAY_SCALE_MAX - 1) * Math.pow(2 * value - 1, 3);
}

export interface Drop {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scale: number;
}

export function sprayPattern(
  count: number,
  radius: number,
  thrown: readonly [number, number] | null,
  random: () => number,
): Drop[] {
  const total = Math.max(1, Math.floor(count) || 1);
  const reach = radius > 0 ? radius : 0;
  const out: Drop[] = [{ offsetX: 0, offsetY: 0, scale: 1 }];
  if (total === 1) return out;
  const [throwX, throwY] = thrown ?? [0, 0];
  const main = Math.hypot(throwX, throwY) > 1e-6 ? Math.atan2(throwY, throwX) + (random() - 0.5) * 0.4 : random() * TAU;
  const lobeCount = Math.min(SPRAY_LOBES_MAX, 1 + Math.floor(random() * SPRAY_LOBES_MAX));
  const lobes: { angle: number; weight: number; spread: number }[] = [];
  let weights = 0;
  for (let j = 0; j < lobeCount; j++) {
    const angle = j === 0 ? main : main + (random() < 0.5 ? -1 : 1) * (0.9 + random() * 2);
    const weight = j === 0 ? 1 : 0.3 + random() * 0.4;
    lobes.push({ angle, weight, spread: SPRAY_LOBE_SPREAD * (0.6 + random() * 0.9) });
    weights += weight;
  }
  for (let i = 1; i < total; i++) {
    let angle: number;
    if (fraction(random() + i * 0.7548776662) < SPRAY_STRAY) angle = fraction(random() + i * 0.6180339887) * TAU;
    else {
      let pick = fraction(random() + i * 0.6180339887) * weights;
      let lobe = lobes[0] ?? { angle: main, weight: 1, spread: SPRAY_LOBE_SPREAD };
      for (const each of lobes) {
        lobe = each;
        pick -= each.weight;
        if (pick < 0) break;
      }
      angle = lobe.angle + gaussian(random(), fraction(random() + i * 0.569840291)) * lobe.spread;
    }
    let distance = reach * (SPRAY_NEAR + (1 - SPRAY_NEAR) * Math.pow(fraction(random() + i * 0.4142135624), 0.8));
    let scale = sprayScale(random());
    if (random() < SPRAY_FLYER) {
      distance *= SPRAY_FLYER_REACH;
      scale *= 0.6;
    }
    out.push({ offsetX: Math.cos(angle) * distance, offsetY: Math.sin(angle) * distance, scale });
  }
  return out;
}

/** Drop zero is the pool at the ladder's size; the spatter round it is this share of it, jittered either way. */
export const SPATTER_SCALE = 0.45;
export const SIZE_JITTER = 0.3;
export function dropSize(index: number, rate: number, random: () => number): number {
  const base = markSize(rate) * (index > 0 ? SPATTER_SCALE : 1);
  return Math.max(0, base * (1 + (random() - 0.5) * 2 * SIZE_JITTER));
}

/** A ceiling is a surface whose normal is within 0.7 of straight down (DaggerBlood's own test); one drop in four, by
 *  index and never drop zero, looks up for one. */
export const CEILING_DOT = 0.7;
export const CEILING_EVERY = 4;
export const isCeilingNormal = (normal: Vector): boolean => -(unit(normal)?.[2] ?? 0) > CEILING_DOT;
export const looksUp = (index: number): boolean => index > 0 && (index + 1) % CEILING_EVERY === 0;

/** DaggerBlood's push for each of the six strokes (combat's 1 to 6: down, down-left, left, right, down-right, up), the
 *  middle of each band, in the striker's own frame: x its right, y up, z its forward. An upward cut throws it back. */
export const SWING_PUSH: Readonly<Record<number, Vector>> = {
  1: [0, 3, 0],
  2: [-7.5, -7.5, 0],
  3: [-7.5, 0, 0],
  4: [7.5, 0, 0],
  5: [7.5, -7.5, 0],
  6: [0, 0, -5],
};
/** How far a unit of the push leans a spray, in metres. */
export const SWING_LEAN = 0.08;

/** Where a swing by `stroke` throws its spray across the ground, as DFO's swingThrow: the push's flat part in the
 *  striker's frame, `forward` the way it struck across the ground. A mark lies on a surface, so the push's up or down
 *  part is dropped: a straight chop throws nowhere. Nothing for any other blow. */
export function swingThrow(stroke: number, forward: readonly [number, number]): [number, number] {
  const push = SWING_PUSH[stroke];
  const length = Math.hypot(forward[0], forward[1]);
  if (!push || !(length > 1e-6)) return [0, 0];
  const [aheadX, aheadY] = [forward[0] / length, forward[1] / length];
  // The ground's x runs east and its y south: the right of a way is a quarter turn clockwise from it, seen from above.
  const [rightX, rightY] = [-aheadY, aheadX];
  return [(rightX * push[0] + aheadX * push[2]) * SWING_LEAN, (rightY * push[0] + aheadY * push[2]) * SWING_LEAN];
}

/** A mark floats this far off its surface so it never fights it for depth. */
export const SURFACE_LIFT = 0.02;

export interface Basis {
  readonly normal: Vector;
  readonly right: Vector;
  readonly up: Vector;
}

const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** `base` plus `step` times `scale`. */
export const plus = (base: Vector, step: Vector, scale = 1): Vector => [
  base[0] + step[0] * scale,
  base[1] + step[1] * scale,
  base[2] + step[2] * scale,
];
const times = (vector: Vector, scale: number): Vector => [vector[0] * scale, vector[1] * scale, vector[2] * scale];
export function unit(vector: Vector): Vector | null {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return length > 1e-6 ? [vector[0] / length, vector[1] / length, vector[2] / length] : null;
}

/** Two axes in the plane of `normal`, spun by `turn`; seeded from world up, or from north on a near-level surface. On
 *  a wall, a turn of zero puts `up` at world up. */
export function surfaceBasis(normal: Vector, turn = 0): Basis {
  const along = unit(normal) ?? [0, 0, 1];
  const seed: Vector = Math.abs(along[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const right0 = unit(cross(seed, along)) ?? [1, 0, 0];
  const up0 = cross(along, right0);
  const cosine = Math.cos(turn);
  const sine = Math.sin(turn);
  return {
    normal: along,
    right: plus(times(right0, cosine), up0, sine),
    up: plus(times(up0, cosine), right0, -sine),
  };
}

/** A basis whose right lies along a drop's travel projected onto the surface, falling back to the spun one. */
export function basisAlong(normal: Vector, along: Vector | null, turn = 0): Basis {
  const facing = unit(normal) ?? [0, 0, 1];
  if (!along) return surfaceBasis(facing, turn);
  const into = along[0] * facing[0] + along[1] * facing[1] + along[2] * facing[2];
  const right = unit(plus(along, facing, -into));
  if (!right) return surfaceBasis(facing, turn);
  return { normal: facing, right, up: cross(facing, right) };
}

/** A flung drop is up to two and a half times longer than wide: by how far it flew, or, once drops fly, one over the
 *  sine of the angle it came down at. */
export const STREAK_MAX = 2.5;
export function streakFor(flown: number, reach: number): number {
  if (!(flown > 0) || !(reach > 0)) return 1;
  return 1 + Math.min(1, flown / reach) * (STREAK_MAX - 1);
}
export function impactStretch(across: number, down: number): number {
  const level = Math.abs(across);
  const fall = Math.abs(down);
  if (!(level > 0) || !Number.isFinite(level)) return 1;
  if (!(fall > 0)) return STREAK_MAX;
  return Math.min(STREAK_MAX, Math.hypot(level, fall) / fall);
}

/** A quad's vertex: its position, its texture coordinate and its colour with alpha. */
export const FLOATS_PER_VERTEX = 9;
export const QUAD_FLOATS = 4 * FLOATS_PER_VERTEX;
const WHITE: Tint = [1, 1, 1, 1];

export interface Quad {
  readonly position: Vector;
  readonly right: Vector;
  readonly up: Vector;
  /** Full width across `up`; the length along `right` is this times `stretch`. */
  readonly size: number;
  readonly stretch: number;
  readonly tint: Tint;
  readonly uv: Cell | null;
}

/** Writes a quad's corners at `offset`, counter-clockwise from the bottom left seen from its front. */
export function writeQuad(out: Float32Array, offset: number, quad: Quad): void {
  const half = quad.size / 2;
  const long = half * quad.stretch;
  const tint = quad.tint;
  const corner = (index: number, across: number, upward: number, textureU: number, textureV: number) => {
    const vertex = offset + index * FLOATS_PER_VERTEX;
    for (let axis = 0; axis < 3; axis++)
      out[vertex + axis] =
        (quad.position[axis] ?? 0) + (quad.right[axis] ?? 0) * long * across + (quad.up[axis] ?? 0) * half * upward;
    out.set([textureU, textureV, tint[0], tint[1], tint[2], tint[3]], vertex + 3);
  };
  const { u0, v0, u1, v1 } = quad.uv ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
  corner(0, -1, -1, u0, v0);
  corner(1, -1, 1, u0, v1);
  corner(2, 1, 1, u1, v1);
  corner(3, 1, -1, u1, v0);
}

/** Two triangles a quad, for `count` quads. */
export function quadIndices(count: number): Uint32Array {
  const out = new Uint32Array(count * 6);
  for (let quad = 0; quad < count; quad++)
    out.set(
      [0, 2, 1, 0, 3, 2].map((corner) => quad * 4 + corner),
      quad * 6,
    );
  return out;
}

/** A mark on a surface, and how it dries: its fresh tint, the clock it was laid at and its drying stage. */
export interface Decal extends Quad {
  readonly slot: number;
  readonly normal: Vector;
  size: number;
  tint: Tint;
  uv: Cell | null;
  fresh: Tint;
  born: number;
  stage: number;
}

export interface Placing {
  readonly size: number;
  readonly turn?: number;
  readonly along?: Vector | null;
  readonly stretch?: number;
}

/**
 * The ring of marks: `capacity` exist and no more, and once full the oldest is handed back, so blood's cost is set at
 * the start and never grows in a fight. Marks are never retired on a clock.
 */
export class DecalRing {
  readonly capacity: number;
  private readonly random: () => number;
  private readonly slots: (Decal | null)[];
  private next = 0;
  private filled = 0;
  count = 0;

  constructor(capacity: number, random: () => number) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.random = random;
    this.slots = new Array<Decal | null>(this.capacity).fill(null);
  }

  /** Lays a mark at `point` on a surface facing `normal`; null for a point that is nowhere. */
  place(point: Vector, normal: Vector, placing: Placing): Decal | null {
    if (!point.every(Number.isFinite)) return null;
    const turn = Number.isFinite(placing.turn) ? (placing.turn ?? 0) : this.random() * TAU;
    const basis = placing.along ? basisAlong(normal, placing.along, turn) : surfaceBasis(normal, turn);
    const slot = this.next;
    const decal: Decal = {
      slot,
      position: plus(point, basis.normal, SURFACE_LIFT),
      ...basis,
      size: Number.isFinite(placing.size) ? Math.max(0, placing.size) : 0,
      stretch: Number.isFinite(placing.stretch) ? Math.max(1, placing.stretch ?? 1) : 1,
      tint: WHITE,
      uv: null,
      fresh: WHITE,
      born: 0,
      stage: 0,
    };
    if (!this.slots[slot]) this.count++;
    this.slots[slot] = decal;
    this.next = (slot + 1) % this.capacity;
    this.filled = Math.max(this.filled, slot + 1);
    return decal;
  }

  decalAt(slot: number): Decal | null {
    return this.slots[slot] ?? null;
  }

  /** The half-open slot ranges to draw, oldest first, so a newer mark always lies over an older one. */
  ranges(): [number, number][] {
    if (this.filled < this.capacity) return this.filled > 0 ? [[0, this.filled]] : [];
    return this.next > 0
      ? [
          [this.next, this.capacity],
          [0, this.next],
        ]
      : [[0, this.capacity]];
  }
}
