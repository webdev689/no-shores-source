// An arc's vertices, laid for SWING_WGSL: the blade's band and the strip across its tip, sampled back along the head's
// own course; the head's glint; the element leaving the blade (Blaze's embers, Volt's forks, Cosmic's stars); and a
// heavy overhead's strike on the ground. Pure: the same arc at the same time lays the same vertices.
import type { GlowLook } from '../elementGlow.ts';
import { PX_PER_M } from '../player/figures.ts';
import { hashOf } from './spellPixels.ts';
import {
  type Colour,
  type Course,
  type Vector,
  add,
  cross,
  headAt,
  outward,
  scaled,
  tipAt,
  unit,
} from './swingCourse.ts';
import { RAMP } from './swingLook.ts';

/** Each vertex's numbers: x, y, z; its shape (age along the streak, 0 at the head, across it 0 to 1, how fast the
 *  blade went there 0 to 1, and its part; a solid part's stop and cover in place of age and across); red, green, blue
 *  and strength; then its ramp (`RAMP`) and how many figure pixels it spans across. */
export const SWING_FLOATS = 13;
/** The streak's parts, as the shader draws each: the blade's band, hilt to tip; a strip, hottest along its middle (the
 *  ribbon along the tip's path, turned to the eye, or a thrust's streak); a flare, a star; a solid square or segment
 *  in one stop; and a blunt head's square flare. */
export const PART = { band: 0, strip: 1, flare: 2, solid: 3, block: 4 } as const;

/** How long a streak trails at a sword's weight (seconds), and the samples it is laid in. */
export const TRAIL_S = 0.16;
const SAMPLES = 40;
/** The band reaches this much past the tip, for the tip's dark rim; its tail narrows to this share at its oldest. */
const RIM_PAST = 1.06;
const TAIL_NARROWS = 0.55;
/** The ribbon along the tip's path, turned to face the eye so a cut seen edge on still shows: this far either side of
 *  the path at the head at a sword's weight (metres), narrowing to this share of that by the tail. */
const RIBBON_M = 0.12;
const RIBBON_TAIL = 0.25;
/** A thrust's streak, this wide either side at a sword's weight (metres). */
const THRUST_WIDTH_M = 0.11;
/** The head's glint grows by this much at full speed (metres), as strong as this. */
const GLINT = { grows: 0.14, strength: 0.75 } as const;
/** A thrust's stab as it lands, which shows even end on: it opens from this size by this much (metres) over its life
 *  (seconds), from just before the landing, as strong as this at first and fading as it opens. */
const STAB = { size: 0.3, grows: 0.5, before: 0.02, lasts: 0.2, strength: 2 } as const;
/** A figure's card stands this far toward the eye from its feet; an arc is drawn no farther than this short of it,
 *  so a blow shows over its own striker. Nearer than the least, it is drawn where it is. */
const CARD_STAND_M = 0.35;
const OVER_CARD_M = 0.12;
const LEAST_M = 0.3;
/** Blaze sheds this many embers a second off the head, each living between these (s), rising and drifting (m/s). */
const EMBERS = { rate: 18, life: [0.45, 0.7], rise: 0.7, drift: 0.5, pixels: 2 } as const;
/** Volt jolts its strip this far either way (metres) at this many strikes a second, throwing this many forks off the
 *  head each strike, this long (metres) in three legs. */
const VOLT = { jolt: 0.035, hertz: 12, forks: 2, length: 0.3 } as const;
/** Cosmic leaves a star this often (s) along its path, which lives this long (s), this wide (metres). */
const STARS = { every: 0.08, life: 0.4, size: 0.16 } as const;
/** A heavy overhead's strike: it lasts this long (s); its crack's three rays, each three steps from the heart out
 *  (metres long, figure pixels wide), lit in the arc's light for these times (s) then dark until it thins; and its
 *  chips of dust, thrown out and up between these speeds (m/s), living between these (s). */
const STRIKE = { lasts: 0.9, thins: 0.7, lit: [3 / 60, 8 / 60, 0.3] } as const;
const CRACK = { lengths: [0.25, 0.2, 0.15], pixels: [4, 3, 2], turns: [-1.1, 0, 1.1] } as const;
const CHIPS = { count: 12, out: [1, 2.5], up: [1.5, 3], life: [0.4, 0.6], gravity: 9.81 } as const;

/** One arc as its vertices are laid: its course, where its striker's feet were drawn, when into the blow it stopped
 *  being struck (Infinity while it is), its seed, and the element its blade glows in. */
export interface ArcShape {
  readonly course: Course;
  readonly feet: Vector;
  readonly stopped: number;
  readonly seed: number;
  readonly look: GlowLook;
}

/** Where an arc's vertices go and how: the numbers laid into, the eye, its ramp, tint and strength, and how far from
 *  the eye across the ground a point of it may stand (its striker's card, less a little). */
export interface Layer {
  readonly out: number[];
  readonly eye: Vector;
  readonly ramp: number;
  readonly tint: Colour;
  readonly strength: number;
  readonly nearest: number;
}

/** A layer for an arc struck from `feet`, seen from `eye`. */
export function layerFor(
  out: number[],
  eye: Vector,
  feet: Vector,
  look: { readonly ramp: number; readonly tint: Colour; readonly strength: number },
): Layer {
  const apart = Math.hypot(feet[0] - eye[0], feet[1] - eye[1]) - CARD_STAND_M - OVER_CARD_M;
  return { out, eye, ...look, nearest: apart > LEAST_M ? apart : Infinity };
}

/** `point` brought along the line to the eye until it stands no farther across the ground than the layer's nearest:
 *  the same place on the screen, nearer in depth. */
function pulled(layer: Layer, point: Vector): Vector {
  const { eye, nearest } = layer;
  const across = Math.hypot(point[0] - eye[0], point[1] - eye[1]);
  if (across <= nearest) return point;
  return add(eye, add(point, eye, -1), nearest / across);
}

type Corner = { readonly point: Vector; readonly age: number; readonly across: number; readonly speed: number };

/** Two triangles from four corners in order round, as `part` across `cells` figure pixels, in `ramp`; pulled toward
 *  the eye unless it lies on the ground. */
function layQuad(
  layer: Layer,
  corners: readonly Corner[],
  part: number,
  cells: number,
  { ramp = layer.ramp, ground = false }: { ramp?: number; ground?: boolean } = {},
): void {
  const [first, second, third, fourth] = corners;
  if (!first || !second || !third || !fourth) return;
  for (const corner of [first, second, third, first, third, fourth]) {
    const point = ground ? corner.point : pulled(layer, corner.point);
    layer.out.push(...point, corner.age, corner.across, corner.speed, part, ...layer.tint, layer.strength, ramp, cells);
  }
}

/** The way across and up a square at `point` faces the eye with. */
function facing(eye: Vector, point: Vector): { across: Vector; upward: Vector } {
  const toward = unit(add(eye, point, -1));
  const across = Math.abs(toward[2]) > 0.99 ? ([1, 0, 0] as Vector) : unit(cross(toward, [0, 0, 1]));
  return { across, upward: unit(cross(across, toward)) };
}

/** A square at `point`, `size` metres across, facing the eye: `part` (a flare, a blunt head's, or a solid square in
 *  `stop`), its cells a figure pixel each. */
function layFlare(layer: Layer, point: Vector, size: number, part: number, stop = 0): void {
  const { across, upward } = facing(layer.eye, point);
  const half = size / 2;
  const solid = part === PART.solid;
  const corner = (x: number, y: number): Corner => ({
    point: add(add(point, across, (x * 2 - 1) * half), upward, (y * 2 - 1) * half),
    age: solid ? stop : x,
    across: solid ? 1 : y,
    // A solid square's speed runs across it, for the shader's measure of its pixels.
    speed: solid ? x : 1,
  });
  layQuad(layer, [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)], part, Math.max(1, size * PX_PER_M));
}

/** A solid segment from `from` to `to`, `pixels` figure pixels wide, in `stop` (covering `cover`): faced to the eye,
 *  or lying flat on the ground. */
function laySegment(
  layer: Layer,
  from: Vector,
  to: Vector,
  pixels: number,
  stop: number,
  { cover = 1, ramp = layer.ramp, ground = false }: { cover?: number; ramp?: number; ground?: boolean } = {},
): void {
  const along = add(to, from, -1);
  const side = ground ? unit([-along[1], along[0], 0]) : unit(cross(along, add(layer.eye, from, -1)));
  const half = pixels / PX_PER_M / 2;
  const corner = (end: Vector, way: number): Corner => ({
    point: add(end, side, way * half),
    age: stop,
    across: cover,
    speed: (way + 1) / 2,
  });
  layQuad(layer, [corner(from, -1), corner(to, -1), corner(to, 1), corner(from, 1)], PART.solid, pixels, {
    ramp,
    ground,
  });
}

/** An arc's streak `time` into its blow, trailing `trail` seconds: sampled back along the head's own course over the
 *  trail, so a fast stretch is long and a slow one short; a cut as its blade's band and the strip across its tip, a
 *  thrust as a streak along its drive, Volt's jolted; and the head's glint while it moves. */
export function layStreak(layer: Layer, arc: ArcShape, time: number, trail: number): void {
  const { course, feet, stopped } = arc;
  const { wide } = course.weight;
  // A strip faces the eye, so it widens less than the sweep: seen edge on, a heavy blade's would fill the view.
  const broad = Math.sqrt(wide);
  const pivot = add(feet, course.offset);
  const normal = unit(cross(course.land, course.travel));
  const samples: { along: number; age: number; speed: number }[] = [];
  // Sampled back from where the head last moved, its sweep's end or where it stopped: nothing moves after that.
  const last = Math.min(time, course.to, stopped);
  for (let step = 0; step <= SAMPLES; step += 1) {
    const when = last - (step / SAMPLES) * trail;
    const age = time - when;
    if (when < course.from || age > trail) break;
    const head = headAt(course, when);
    samples.push({ along: head.along, age: age / trail, speed: head.speed });
  }
  const strike = Math.floor(time * VOLT.hertz);
  const jolt = (step: number) => (arc.look === 2 ? (hashOf(arc.seed, strike, step) * 2 - 1) * VOLT.jolt : 0);
  const bandCells = (course.tip * RIM_PAST - course.hilt) * PX_PER_M;
  const stripCells = 2 * (course.thrust ? THRUST_WIDTH_M : RIBBON_M) * broad * PX_PER_M;
  for (let step = 0; step + 1 < samples.length; step += 1) {
    const [near, far] = [samples[step], samples[step + 1]];
    if (!near || !far) continue;
    if (course.thrust) {
      const along = (sample: typeof near, across: number, index: number): Corner => {
        const point = add(pivot, course.land, sample.along);
        const side = unit(cross(course.land, add(layer.eye, point, -1)));
        const width = THRUST_WIDTH_M * broad * (1 - 0.6 * sample.age) * (0.7 + 0.5 * sample.speed);
        const placed = add(point, side, (across * 2 - 1) * width + jolt(index));
        return { point: placed, age: sample.age, across, speed: sample.speed };
      };
      const quad = [along(near, 0, step), along(far, 0, step + 1), along(far, 1, step + 1), along(near, 1, step)];
      layQuad(layer, quad, PART.strip, stripCells);
      continue;
    }
    const band = (sample: typeof near, across: number): Corner => {
      const inner = course.hilt + (course.tip - course.hilt) * TAIL_NARROWS * sample.age ** 1.3;
      const radius = inner + (course.tip * RIM_PAST - inner) * across;
      return { point: add(pivot, outward(course, sample.along), radius), age: sample.age, across, speed: sample.speed };
    };
    layQuad(layer, [band(near, 0), band(far, 0), band(far, 1), band(near, 1)], PART.band, bandCells);
    const strip = (sample: typeof near, across: number, index: number): Corner => {
      const tipAtSample = add(pivot, outward(course, sample.along), course.tip);
      // Across the path's way at the tip, and across the line to the eye: the ribbon faces the eye.
      const way = add(scaled(course.land, -Math.sin(sample.along)), course.travel, Math.cos(sample.along));
      const toward = cross(way, add(layer.eye, tipAtSample, -1));
      const side = Math.hypot(...toward) > 1e-9 ? unit(toward) : normal;
      const half = RIBBON_M * broad * (1 - (1 - RIBBON_TAIL) * sample.age) * (0.6 + 0.4 * sample.speed);
      const placed = add(tipAtSample, side, (across * 2 - 1) * half + jolt(index));
      return { point: placed, age: sample.age, across, speed: sample.speed };
    };
    const quad = [strip(near, 0, step), strip(far, 0, step + 1), strip(far, 1, step + 1), strip(near, 1, step)];
    layQuad(layer, quad, PART.strip, stripCells);
  }
  const head = samples[0];
  const headPart = course.weight.blunt ? PART.block : PART.flare;
  if (head && time < Math.min(course.to, stopped) && head.speed > 0.05) {
    const point = course.thrust
      ? add(pivot, course.land, head.along)
      : add(pivot, outward(course, head.along), course.tip);
    const size = course.weight.head + GLINT.grows * head.speed;
    layFlare({ ...layer, strength: layer.strength * GLINT.strength * head.speed }, point, size, headPart);
  }
  const since = time - course.strike + STAB.before;
  if (course.thrust && since >= 0 && since < STAB.lasts && course.strike < stopped) {
    const share = since / STAB.lasts;
    const point = add(pivot, course.land, course.tip);
    const strength = layer.strength * STAB.strength * (1 - share);
    layFlare({ ...layer, strength }, point, STAB.size * wide + STAB.grows * share, PART.flare);
  }
}

/** A flare where a blow struck, `size` metres across. */
export function layStruck(layer: Layer, point: Vector, size: number): void {
  layFlare(layer, point, size, PART.flare);
}

/** The element leaving the blade `time` into its blow, from where the tip passed: Blaze's embers rise and cool through
 *  its stops, Volt throws forks off the head each strike while it sweeps, Cosmic leaves stars that fade. */
export function layElement(layer: Layer, arc: ArcShape, time: number): void {
  const { course, feet, look, seed } = arc;
  const moving = Math.min(time, course.to, arc.stopped);
  if (look === 1) {
    const [shortest, longest] = EMBERS.life;
    for (let born = Math.ceil(course.from * EMBERS.rate); born <= Math.floor(moving * EMBERS.rate); born++) {
      const age = time - born / EMBERS.rate;
      const life = shortest + (longest - shortest) * hashOf(seed, born, 1);
      if (age < 0 || age >= life) continue;
      const from = tipAt(course, feet, born / EMBERS.rate);
      const drift: Vector = [
        (hashOf(seed, born, 2) - 0.5) * EMBERS.drift,
        (hashOf(seed, born, 3) - 0.5) * EMBERS.drift,
        EMBERS.rise,
      ];
      layFlare(layer, add(from, drift, age), EMBERS.pixels / PX_PER_M, PART.solid, 3 - Math.floor((age / life) * 4));
    }
  } else if (look === 2) {
    if (time > moving || headAt(course, time).speed < 0.25) return;
    const strike = Math.floor(time * VOLT.hertz);
    const head = tipAt(course, feet, time);
    for (let fork = 0; fork < VOLT.forks; fork++) {
      const random = (part: number) => hashOf(seed, strike, fork, part) * 2 - 1;
      const way = unit([random(1), random(2), random(3) * 0.6]);
      let from = head;
      for (let leg = 1; leg <= 3; leg++) {
        const jag: Vector = [random(4 + leg) * 0.05, random(7 + leg) * 0.05, random(10 + leg) * 0.05];
        const to = add(add(head, way, (VOLT.length * leg) / 3), jag, leg < 3 ? 1 : 0);
        laySegment(layer, from, to, 4, 1);
        laySegment(layer, from, to, 2, 3);
        from = to;
      }
    }
  } else if (look === 3) {
    for (let born = Math.ceil(course.from / STARS.every); born <= Math.floor(moving / STARS.every); born++) {
      const age = time - born * STARS.every;
      if (age < 0 || age >= STARS.life) continue;
      const strength = layer.strength * (1 - (age / STARS.life) * 0.9);
      layFlare({ ...layer, strength }, tipAt(course, feet, born * STARS.every), STARS.size, PART.flare);
    }
  }
}

/** When into its blow a heavy overhead's head meets the ground, and where: the first of its follow-through's samples
 *  within a hand of the ground, or its lowest if that is within half a metre; null for none. */
export function groundStrike(course: Course, feet: Vector): { readonly time: number; readonly at: Vector } | null {
  if (!course.ground) return null;
  let lowest: { time: number; at: Vector } | null = null;
  for (let step = 0; step <= 16; step++) {
    const time = course.strike + ((course.to - course.strike) * step) / 16;
    const tip = tipAt(course, feet, time);
    if (tip[2] - feet[2] <= 0.1) return { time, at: [tip[0], tip[1], feet[2]] };
    if (!lowest || tip[2] < lowest.at[2]) lowest = { time, at: tip };
  }
  return lowest && lowest.at[2] - feet[2] < 0.5
    ? { time: lowest.time, at: [lowest.at[0], lowest.at[1], feet[2]] }
    : null;
}

/** A heavy overhead's strike on the ground `time` into its blow: a crack of three stepped rays, lit in the arc's light
 *  as the head meets the ground and then dark until it thins away, and chips of dust thrown out and falling. */
export function layGround(layer: Layer, arc: ArcShape, time: number): void {
  const strikes = groundStrike(arc.course, arc.feet);
  if (!strikes || strikes.time >= arc.stopped) return;
  const since = time - strikes.time;
  if (since < 0 || since >= STRIKE.lasts) return;
  const centre: Vector = [strikes.at[0], strikes.at[1], strikes.at[2] + 0.02];
  const bearing = Math.atan2(arc.course.land[1], arc.course.land[0]);
  const lit = STRIKE.lit.findIndex((until) => since < until);
  const [stop, ramp] = lit >= 0 ? [3 - lit, layer.ramp] : [0, RAMP.dust];
  const cover = since > STRIKE.thins ? (STRIKE.lasts - since) / (STRIKE.lasts - STRIKE.thins) : 1;
  CRACK.turns.forEach((turn, ray) => {
    const angle = bearing + turn + (hashOf(arc.seed, ray) - 0.5) * 0.5;
    const way: Vector = [Math.cos(angle), Math.sin(angle), 0];
    let from = centre;
    CRACK.lengths.forEach((length, part) => {
      const to = add(from, way, length);
      laySegment(layer, from, to, CRACK.pixels[part] ?? 2, stop, { cover, ramp, ground: true });
      from = to;
    });
  });
  for (let chip = 0; chip < CHIPS.count; chip++) {
    const random = (part: number) => hashOf(arc.seed, chip, part);
    const life = CHIPS.life[0] + (CHIPS.life[1] - CHIPS.life[0]) * random(1);
    if (since >= life) continue;
    const angle = random(2) * Math.PI * 2;
    const out = CHIPS.out[0] + (CHIPS.out[1] - CHIPS.out[0]) * random(3);
    const up = CHIPS.up[0] + (CHIPS.up[1] - CHIPS.up[0]) * random(4);
    const rise = Math.max(0, up * since - (CHIPS.gravity / 2) * since * since);
    const thrown: Vector = [
      centre[0] + Math.cos(angle) * out * since,
      centre[1] + Math.sin(angle) * out * since,
      centre[2] + rise,
    ];
    const pixels = random(5) < 0.5 ? 2 : 3;
    layFlare({ ...layer, ramp: RAMP.dust }, thrown, pixels / PX_PER_M, PART.solid, 3 - Math.floor((since / life) * 3));
  }
}
