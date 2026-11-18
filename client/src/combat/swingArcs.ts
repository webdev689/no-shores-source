// A swing's arc: the streak of light a blade leaves through the air. It is laid from the fight's own blow (its stroke,
// when it lands, how far it reaches and how wide it sweeps), so the eye follows where the blow goes rather than the
// frames between. Each part of the streak fades by how long ago the blade passed it and burns by how fast it went.
import { STROKE_DIRECTIONS, type StrokeDirection } from '../rules/fighters.ts';

export type Vector = readonly [number, number, number];
export type Colour = readonly [number, number, number];

/** A blow being struck, as the arcs read it. */
export interface Swing {
  /** The fighter striking it. */
  readonly id: number;
  /** The combat crate's stroke, 1 to 6. */
  readonly stroke: number;
  /** Seconds since the swing began; from its start to its blow landing; and to its end. */
  readonly elapsed: number;
  readonly strike: number;
  readonly end: number;
  /** How far the stroke reaches, feet to a body's middle, and how wide it sweeps either side of its aim (radians). */
  readonly reach: number;
  readonly halfArc: number;
  /** Where it is aimed, radians clockwise from north. */
  readonly aim: number;
  readonly leftHand: boolean;
  /** A riposte or a counter: drawn in gold, and brighter. */
  readonly special: boolean;
  readonly tint: Colour;
  /** Seen through the striker's own eyes: laid ahead of the eye, so it crosses the view. */
  readonly firstPerson?: boolean;
}

/** How the arcs look, as the Test Ground's panel sets them: how bright, and how long a streak trails; 1 each as made. */
export interface ArcLook {
  readonly brightness: number;
  readonly trail: number;
}

/** Each vertex's numbers: x, y, z; its age along the streak (0 at the head), across it (0 to 1), how fast the blade
 *  went there (0 to 1) and its part (`PART`); then red, green, blue and strength. */
export const SWING_FLOATS = 11;
/** The streak's parts, as the shader draws each: the blade's band, hilt to tip; a strip, brightest along its middle (the
 *  ribbon along the tip's path, turned to the eye, or a thrust's streak); and a flare. */
export const PART = { band: 0, strip: 1, flare: 2 } as const;

const DEGREE = Math.PI / 180;
/** The pivot: the striking shoulder, this high over the feet and this far to the striking hand's side (metres). */
const SHOULDER_M = 1.3;
const SHOULDER_SIDE_M = 0.18;
/** Seen through the striker's eyes, the pivot stands this far ahead and this much lower and the blade is this much
 *  shorter, so the streak crosses the view instead of passing the eye edge on. */
const FIRST_PERSON = { ahead: 0.35, lower: 0.12, scale: 0.8 } as const;
/** The blade within a stroke's reach: its tip this share of the reach less the body it strikes (held between these),
 *  in keeping with the figure that swings it; its band drawn this much past the tip for the tip's dark rim, and its
 *  hilt this share of the tip in. */
const BODY_RADIUS_M = 0.35;
const TIP_SHARE = 0.75;
const TIP_M = [0.7, 2.2] as const;
const RIM_PAST = 1.06;
const HILT_SHARE = 0.38;
/** How long a streak trails (seconds), and the samples it is laid in. */
const TRAIL_S = 0.16;
const SAMPLES = 40;
/** The fast part of a swing begins this share of the way to its landing, and sweeps on through this share of the
 *  follow-through. The head gathers speed to the landing as an ease-in of this power. */
const SWING_FROM = 0.55;
const SWEEP_ON = 0.4;
const GATHER = 2.2;
/** The streak's tail narrows toward the tip: by the oldest it is this share of the band at the head. */
const TAIL_NARROWS = 0.55;
/** The ribbon along the tip's path, turned to face the eye so a cut seen edge on still shows: this far either side of
 *  the path at the head (metres), narrowing to this share of that by the tail. */
const RIBBON_M = 0.09;
const RIBBON_TAIL = 0.25;
/** The pivot stands this far ahead of the chest, so a cut sweeps in front of the figure. */
const AHEAD_M = 0.15;
/** A thrust's streak: drawn back to this share of the tip before it drives, back to this share after, and this wide
 *  either side (metres). */
const THRUST = { from: 0.3, back: 0.6, width: 0.085 } as const;
/** The head's glint: its size at rest and at full speed (metres), and its strength at full speed. */
const GLINT = { size: 0.1, grows: 0.14, strength: 0.75 } as const;
/** A struck blow's flare: it opens from this size to this (metres) as it fades over about this long (seconds). */
const FLARE = { from: 0.3, to: 0.85, fades: 0.08, lasts: 0.3 } as const;
/** A riposte's or a counter's gold, how much of its colour it takes, and how much brighter it is. */
const GOLD: Colour = [1, 0.8, 0.32];
const GOLD_SHARE = 0.65;
const SPECIAL_BRIGHTER = 1.35;
/** A blow seen again within this long (seconds) of where it began is the same blow. */
const SAME_BLOW_S = 0.12;

/** Each stroke's path, in the striker's frame (ahead, right, up) for its right hand: where the blow lands (`land`),
 *  which way the blade travels as it lands (`travel`), and how far round it sweeps before and after the landing
 *  (radians); a slant's and a sweep's widened by the stroke's own arc. */
interface Path {
  readonly land: Vector;
  readonly travel: Vector;
  readonly before: number;
  readonly after: number;
  readonly widened: boolean;
}
const PATHS: Readonly<Record<Exclude<StrokeDirection, 'up'>, Path>> = {
  down: { land: [1, 0, -0.3], travel: [0, -0.22, -1], before: 95 * DEGREE, after: 65 * DEGREE, widened: false },
  downLeft: { land: [1, 0, -0.25], travel: [0, -1, -1], before: 35 * DEGREE, after: 15 * DEGREE, widened: true },
  downRight: { land: [1, 0, -0.25], travel: [0, 1, -1], before: 35 * DEGREE, after: 15 * DEGREE, widened: true },
  left: { land: [1, 0, -0.12], travel: [0, -1, -0.2], before: 25 * DEGREE, after: 20 * DEGREE, widened: true },
  right: { land: [1, 0, -0.12], travel: [0, 1, -0.2], before: 25 * DEGREE, after: 20 * DEGREE, widened: true },
};
/** Seen through the eyes, an overhead slants this much more across, so it reads as a cut across the view. */
const FIRST_PERSON_SLANT = 0.6;
/** A thrust drives along this, in the striker's frame. */
const THRUST_ALONG: Vector = [1, 0, -0.1];

/** Each metal's light, by the word in a forge layer's name; bare hands and wood a warm white. */
const METALS: Readonly<Record<string, Colour>> = {
  iron: [0.62, 0.71, 0.84],
  steel: [0.74, 0.86, 1],
  silver: [0.9, 0.88, 1],
  elven: [0.84, 0.96, 0.56],
  dwarven: [1, 0.78, 0.4],
  mithril: [0.6, 0.95, 1],
  adamantium: [0.45, 1, 0.82],
  ebony: [0.7, 0.46, 1],
  orcish: [0.64, 0.9, 0.36],
  daedric: [1, 0.33, 0.22],
};
const PLAIN: Colour = [1, 0.9, 0.76];

/** The light a weapon's arc burns in, by the metal its forge layer names (`sword_daedric`); a warm white for none. */
export function weaponTint(layer: string | null): Colour {
  for (const word of layer?.split('_') ?? []) {
    const metal = METALS[word];
    if (metal) return metal;
  }
  return PLAIN;
}

const add = (a: Vector, b: Vector, scale = 1): Vector => [
  a[0] + b[0] * scale,
  a[1] + b[1] * scale,
  a[2] + b[2] * scale,
];
const scaled = (a: Vector, scale: number): Vector => [a[0] * scale, a[1] * scale, a[2] * scale];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function unit(a: Vector): Vector {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}

/** A blow's course through the air, in the world: its pivot's place off the feet, the way it lands and the way it
 *  travels as it lands, how far round it sweeps either side of the landing, its blade's tip and hilt, and its timing
 *  (seconds from its start): its fast part begins (`from`), lands (`strike`) and stops (`to`). A thrust drives along
 *  `land` instead of turning. */
export interface Course {
  readonly offset: Vector;
  readonly land: Vector;
  readonly travel: Vector;
  readonly before: number;
  readonly after: number;
  readonly tip: number;
  readonly hilt: number;
  readonly thrust: boolean;
  readonly from: number;
  readonly strike: number;
  readonly to: number;
}

/** A blow's course, from the swing as seen. */
export function courseOf(swing: Swing): Course {
  const direction = STROKE_DIRECTIONS[swing.stroke - 1] ?? 'down';
  const forward: Vector = [Math.sin(swing.aim), -Math.cos(swing.aim), 0];
  const right: Vector = [Math.cos(swing.aim), Math.sin(swing.aim), 0];
  const up: Vector = [0, 0, 1];
  const world = (local: Vector): Vector => add(add(scaled(forward, local[0]), right, local[1]), up, local[2]);
  const hand = swing.leftHand ? -1 : 1;
  const own = swing.firstPerson ? FIRST_PERSON : { ahead: 0, lower: 0, scale: 1 };
  const offset = world([AHEAD_M + own.ahead, SHOULDER_SIDE_M * hand, SHOULDER_M - own.lower]);
  const tip = Math.min(TIP_M[1], Math.max(TIP_M[0], (swing.reach - BODY_RADIUS_M) * TIP_SHARE)) * own.scale;
  const strike = Math.max(swing.strike, 1e-3);
  const timing = { from: strike * SWING_FROM, strike, to: strike + Math.max(swing.end - strike, 0) * SWEEP_ON };
  if (direction === 'up') {
    const land = unit(world(THRUST_ALONG));
    return { offset, land, travel: land, before: 0, after: 0, tip, hilt: tip * HILT_SHARE, thrust: true, ...timing };
  }
  const path = PATHS[direction];
  const land = unit(world(path.land));
  // An overhead drifts toward the striking hand's far side; through the eyes it slants across the view.
  const drift =
    direction === 'down' ? (swing.firstPerson ? -FIRST_PERSON_SLANT : path.travel[1]) * hand : path.travel[1];
  const raw = world([path.travel[0], drift, path.travel[2]]);
  const travel = unit(add(raw, land, -dot(raw, land)));
  const widen = path.widened ? swing.halfArc : 0;
  return {
    offset,
    land,
    travel,
    before: path.before + widen,
    after: path.after + widen,
    tip,
    hilt: tip * HILT_SHARE,
    thrust: false,
    ...timing,
  };
}

/** Where a blow's head is `time` seconds into it, and how fast it goes there as a share of its speed as it lands: an
 *  angle round from the landing for a cut, a distance out from the pivot for a thrust. It gathers speed to the landing
 *  and sheds it through the sweep, its speed unbroken as it lands. */
export function headAt(course: Course, time: number): { readonly along: number; readonly speed: number } {
  const { from, strike, to } = course;
  const span = Math.max(strike - from, 1e-6);
  const start = course.thrust ? course.tip * THRUST.from : -course.before;
  const landed = course.thrust ? course.tip : 0;
  const finish = course.thrust ? course.tip * THRUST.back : course.after;
  if (time <= from) return { along: start, speed: 0 };
  if (time < strike) {
    const share = (time - from) / span;
    return { along: start + (landed - start) * share ** GATHER, speed: share ** (GATHER - 1) };
  }
  // The sweep after the landing eases out at the power that keeps its speed unbroken as it lands.
  const landing = (GATHER * Math.abs(landed - start)) / span;
  const sweep = Math.max(to - strike, 1e-6);
  const turn = Math.abs(finish - landed);
  const power = turn > 1e-9 ? Math.min(6, Math.max(1.2, (landing * sweep) / turn)) : 1;
  const share = Math.min(1, (time - strike) / sweep);
  const left = (1 - share) ** power;
  return {
    along: landed + (finish - landed) * (1 - left),
    speed: share >= 1 || landing <= 0 ? 0 : (power * turn * (1 - share) ** (power - 1)) / sweep / landing,
  };
}

/** The way out from the pivot to a cut's head at angle `at` round from its landing. */
const outward = (course: Course, turn: number): Vector =>
  add(scaled(course.land, Math.cos(turn)), course.travel, Math.sin(turn));

/** Where a blow's tip is `time` seconds into it, struck from feet at `feet`. */
export function tipAt(course: Course, feet: Vector, time: number): Vector {
  const pivot = add(feet, course.offset);
  const { along } = headAt(course, time);
  return course.thrust ? add(pivot, course.land, along) : add(pivot, outward(course, along), course.tip);
}

/** An arc being drawn: its blow as last seen, when it began on the page's clock, where its striker's feet were last
 *  drawn, when into the blow its striker stopped striking it (null while it still is), and a flare where it struck
 *  something (its time into the blow, and strength). */
interface Arc {
  swing: Swing;
  course: Course;
  readonly began: number;
  feet: Vector;
  stopped: number | null;
  flare: { readonly when: number; readonly strength: number } | null;
}

/** The swings' arcs: each blow's begun when it is first seen, drawn as it sweeps, flared where it strikes something, and
 *  let go once its streak has faded. */
export class SwingArcs {
  private arcs: Arc[] = [];

  /** Takes every blow being struck at `now` (the page's clock, seconds): one not seen before begins an arc; an arc whose
   *  blow is no longer struck stops where it was, so a blow cut short by a flinch or a dodge never sweeps on; and every
   *  arc follows its striker's feet as `where` draws them (null for one not drawn). */
  seen(now: number, swings: readonly Swing[], where: (id: number) => Vector | null): void {
    const struck = new Set<Arc>();
    for (const swing of swings) {
      const began = now - swing.elapsed;
      const same = this.arcs.find(
        (arc) =>
          arc.swing.id === swing.id && arc.swing.stroke === swing.stroke && Math.abs(arc.began - began) < SAME_BLOW_S,
      );
      if (same) {
        struck.add(same);
        continue;
      }
      const feet = where(swing.id);
      if (!feet) continue;
      const arc: Arc = { swing, course: courseOf(swing), began, feet, stopped: null, flare: null };
      this.arcs.push(arc);
      struck.add(arc);
    }
    for (const arc of this.arcs) {
      if (!struck.has(arc)) arc.stopped ??= now - arc.began;
      arc.feet = where(arc.swing.id) ?? arc.feet;
    }
  }

  /** Flares the latest arc of `striker` as its blow meets something, as strongly as `strength`, if it is still in its
   *  sweep at `now` (`lag` the seconds its striker's drawing is held back). */
  struck(striker: number, strength: number, now: number, lag = 0): void {
    const arc = this.arcs.findLast((each) => each.swing.id === striker);
    if (!arc) return;
    const time = now - arc.began - lag;
    if (time >= arc.course.from && time <= arc.course.to + FLARE.fades)
      arc.flare = { when: Math.min(time, arc.course.to), strength };
  }

  /** How many arcs are drawn. */
  get count(): number {
    return this.arcs.length;
  }

  /** The vertices of every arc at `now`, seen from `eye`, as `look` sets them; `lagOf` is the seconds each striker's
   *  drawing is held back (a hit-stop). Arcs whose streaks have faded are let go. */
  mesh(now: number, eye: Vector, look: ArcLook, lagOf: (id: number) => number = () => 0): Float32Array {
    const out: number[] = [];
    const trail = TRAIL_S * Math.max(0.05, look.trail);
    this.arcs = this.arcs.filter((arc) => {
      const time = now - arc.began - lagOf(arc.swing.id);
      const flaring = arc.flare !== null && time - arc.flare.when < FLARE.lasts;
      if (time > Math.min(arc.course.to, arc.stopped ?? Infinity) + trail && !flaring) return false;
      const tint = arc.swing.special ? mix(arc.swing.tint, GOLD, GOLD_SHARE) : arc.swing.tint;
      const flared =
        arc.flare && time >= arc.flare.when ? arc.flare.strength * Math.exp(-(time - arc.flare.when) / FLARE.fades) : 0;
      const strength = look.brightness * (arc.swing.special ? SPECIAL_BRIGHTER : 1) * (1 + flared);
      if (look.brightness <= 0) return true;
      layStreak(out, arc, time, trail, eye, tint, strength);
      if (arc.flare && time >= arc.flare.when && time - arc.flare.when < FLARE.lasts) {
        const since = time - arc.flare.when;
        const size = FLARE.from + (FLARE.to - FLARE.from) * (1 - Math.exp(-since / FLARE.fades));
        const point = tipAt(arc.course, arc.feet, arc.flare.when);
        layFlare(out, point, size, eye, tint, look.brightness * arc.flare.strength * Math.exp(-since / FLARE.fades));
      }
      return true;
    });
    return new Float32Array(out);
  }
}

const mix = (a: Colour, b: Colour, share: number): Colour => [
  a[0] + (b[0] - a[0]) * share,
  a[1] + (b[1] - a[1]) * share,
  a[2] + (b[2] - a[2]) * share,
];

type Corner = { readonly point: Vector; readonly age: number; readonly across: number; readonly speed: number };

/** Two triangles from four corners in order round, as `part` drawn in `tint` at `strength`. */
function layQuad(out: number[], corners: readonly Corner[], part: number, tint: Colour, strength: number): void {
  const [first, second, third, fourth] = corners;
  if (!first || !second || !third || !fourth) return;
  for (const corner of [first, second, third, first, third, fourth])
    out.push(...corner.point, corner.age, corner.across, corner.speed, part, ...tint, strength);
}

/** An arc's streak `time` into its blow: sampled back along the head's own course over the trail, so a fast stretch
 *  is long and a slow one short; a cut as its blade's band and the strip across its tip, a thrust as a streak along
 *  its drive; and the head's glint while it moves. */
function layStreak(
  out: number[],
  arc: Arc,
  time: number,
  trail: number,
  eye: Vector,
  tint: Colour,
  strength: number,
): void {
  const { course } = arc;
  const stopped = arc.stopped ?? Infinity;
  const pivot = add(arc.feet, course.offset);
  const normal = unit(cross(course.land, course.travel));
  const samples: { along: number; age: number; speed: number }[] = [];
  for (let step = 0; step <= SAMPLES; step += 1) {
    const age = (step / SAMPLES) * trail;
    if (time - age < course.from) break;
    const head = headAt(course, Math.min(time - age, stopped));
    samples.push({ along: head.along, age: age / trail, speed: head.speed });
  }
  for (let step = 0; step + 1 < samples.length; step += 1) {
    const [near, far] = [samples[step], samples[step + 1]];
    if (!near || !far) continue;
    if (course.thrust) {
      const along = (sample: typeof near, across: number): Corner => {
        const point = add(pivot, course.land, sample.along);
        const side = unit(cross(course.land, add(eye, point, -1)));
        const width = THRUST.width * (1 - 0.6 * sample.age) * (0.7 + 0.5 * sample.speed);
        return { point: add(point, side, (across * 2 - 1) * width), age: sample.age, across, speed: sample.speed };
      };
      layQuad(out, [along(near, 0), along(far, 0), along(far, 1), along(near, 1)], PART.strip, tint, strength);
      continue;
    }
    const band = (sample: typeof near, across: number): Corner => {
      const inner = course.hilt + (course.tip - course.hilt) * TAIL_NARROWS * sample.age ** 1.3;
      const radius = inner + (course.tip * RIM_PAST - inner) * across;
      return { point: add(pivot, outward(course, sample.along), radius), age: sample.age, across, speed: sample.speed };
    };
    layQuad(out, [band(near, 0), band(far, 0), band(far, 1), band(near, 1)], PART.band, tint, strength);
    const strip = (sample: typeof near, across: number): Corner => {
      const tipAtSample = add(pivot, outward(course, sample.along), course.tip);
      // Across the path's way at the tip, and across the line to the eye: the ribbon faces the eye.
      const way = add(scaled(course.land, -Math.sin(sample.along)), course.travel, Math.cos(sample.along));
      const facing = cross(way, add(eye, tipAtSample, -1));
      const side = Math.hypot(...facing) > 1e-9 ? unit(facing) : normal;
      const half = RIBBON_M * (1 - (1 - RIBBON_TAIL) * sample.age) * (0.6 + 0.4 * sample.speed);
      return { point: add(tipAtSample, side, (across * 2 - 1) * half), age: sample.age, across, speed: sample.speed };
    };
    layQuad(out, [strip(near, 0), strip(far, 0), strip(far, 1), strip(near, 1)], PART.strip, tint, strength);
  }
  const head = samples[0];
  if (head && time < Math.min(course.to, stopped) && head.speed > 0.05) {
    const point = course.thrust
      ? add(pivot, course.land, head.along)
      : add(pivot, outward(course, head.along), course.tip);
    layFlare(out, point, GLINT.size + GLINT.grows * head.speed, eye, tint, strength * GLINT.strength * head.speed);
  }
}

/** A flare at `at`, `size` metres across, facing `eye`: drawn as a square whose corners the shader reads as 0 to 1. */
function layFlare(out: number[], point: Vector, size: number, eye: Vector, tint: Colour, strength: number): void {
  const toward = unit(add(eye, point, -1));
  const across = Math.abs(toward[2]) > 0.99 ? ([1, 0, 0] as Vector) : unit(cross(toward, [0, 0, 1]));
  const upward = unit(cross(across, toward));
  const half = size / 2;
  const corner = (x: number, y: number): Corner => ({
    point: add(add(point, across, (x * 2 - 1) * half), upward, (y * 2 - 1) * half),
    age: x,
    across: y,
    speed: 1,
  });
  layQuad(out, [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)], PART.flare, tint, strength);
}
