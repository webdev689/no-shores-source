// A swing's arc: the streak of light a blade leaves through the air, along the blow's course (`swingCourse.ts`), laid
// as pixel art (`swingMesh.ts`, `swingLook.ts`). Each part of the streak steps down its ramp by how long ago the
// blade passed it and burns by how fast; the weapon's element leaves the blade, and a heavy overhead strikes the
// ground.
import type { GlowLook } from '../elementGlow.ts';
import { type Colour, type Course, type Swing, type Vector, courseOf, tipAt } from './swingCourse.ts';
import { RAMP, swingRampColour } from './swingLook.ts';
import { type ArcShape, TRAIL_S, layElement, layGround, layStreak, layStruck, layerFor } from './swingMesh.ts';

export {
  type Colour,
  type Course,
  type Swing,
  type Vector,
  courseOf,
  headAt,
  tipAt,
  weaponTint,
  weightOf,
} from './swingCourse.ts';
export { PART, SWING_FLOATS } from './swingMesh.ts';

/** How the arcs look, as the Test Ground's panel sets them: how bright, and how long a streak trails; 1 each as made. */
export interface ArcLook {
  readonly brightness: number;
  readonly trail: number;
}

/** A struck blow's flare: it opens from this size to this (metres) as it fades over about this long (seconds). */
const FLARE = { from: 0.3, to: 0.85, fades: 0.08, lasts: 0.3 } as const;
/** A riposte's or a counter's gold is this much brighter. */
const SPECIAL_BRIGHTER = 1.35;
/** Between the rules' words on a blow, its arc runs on for at most this long (seconds): a snapshot's span. */
const RUNS_ON_S = 0.15;
/** The element's embers and stars, and a heavy blow's strike on the ground, outlive the streak by up to this (s). */
const OUTLIVES_S = 0.95;
/** A smear on the striker's card for the first frames of its strike (seconds), this many figure pixels behind, for
 *  a blade crossing the eye's view at least this much. */
const SMEAR = { lasts: 2 / 60, pixels: 4, across: 0.35 } as const;

/** An arc being drawn: its blow and course as last seen (the rules turn a blow's aim until it lands), where its
 *  striker's feet were last drawn, a flare where it struck something (its time into the blow, and strength), and its
 *  clock: the blow's time as drawn, the rules' last word on it and when that came (page seconds), and when into the
 *  blow its striker stopped striking it (null while it still is). */
interface Arc {
  swing: Swing;
  course: Course;
  feet: Vector;
  flare: { readonly when: number; readonly strength: number } | null;
  time: number;
  told: number;
  toldAt: number;
  clock: number;
  stopped: number | null;
}

/** A smear behind a striker's card: how far across the eye's right and up (figure pixels), and its colour. */
export interface Smear {
  readonly across: number;
  readonly up: number;
  readonly colour: Colour;
}

/** The ramp an arc burns in: gold for a riposte or a counter, else its blade's element, else its metal. */
const rampOf = (swing: Swing): number => {
  if (swing.special) return RAMP.gold;
  const look: GlowLook = swing.look ?? 0;
  return look === 0 ? RAMP.metal : look;
};

/** The swings' arcs: each blow's begun when it is first seen, drawn as it sweeps, flared where it strikes something, and
 *  let go once its streak has faded. An arc keeps the blow's own time, not the page's: between the rules' words it runs
 *  on for at most a snapshot's span, and it waits while the fight waits, so a paused fight never replays a swing. */
export class SwingArcs {
  private arcs: Arc[] = [];

  /** Takes every blow being struck at `now` (the page's clock, seconds): one not seen before begins an arc; one seen
   *  again takes its latest aim and time; an arc whose blow is no longer struck stops where it was, so a blow cut short
   *  by a flinch or a dodge never sweeps on, and fades from there; and every arc follows its striker's feet as `where`
   *  draws them (null for one not drawn). */
  seen(now: number, swings: readonly Swing[], where: (id: number) => Vector | null): void {
    const struck = new Set<Arc>();
    for (const swing of swings) {
      // The same blow: its striker's, its stroke, never earlier than it was, and still being struck.
      const same = this.arcs.findLast(
        (arc) =>
          arc.stopped === null &&
          arc.swing.id === swing.id &&
          arc.swing.stroke === swing.stroke &&
          swing.elapsed >= arc.told - 1e-9,
      );
      if (same) {
        if (swing.elapsed > same.told) [same.told, same.toldAt] = [swing.elapsed, now];
        same.time = Math.max(same.time, Math.min(same.told + (now - same.toldAt), same.told + RUNS_ON_S));
        // It keeps the mirror it began with: an eye moving round its striker never turns it about mid-sweep.
        const kept = { ...swing, mirrored: same.swing.mirrored };
        [same.swing, same.course, same.clock] = [kept, courseOf(kept), now];
        struck.add(same);
        continue;
      }
      const feet = where(swing.id);
      if (!feet) continue;
      const arc: Arc = {
        swing,
        course: courseOf(swing),
        feet,
        flare: null,
        time: swing.elapsed,
        told: swing.elapsed,
        toldAt: now,
        clock: now,
        stopped: null,
      };
      this.arcs.push(arc);
      struck.add(arc);
    }
    for (const arc of this.arcs) {
      if (!struck.has(arc)) {
        arc.stopped ??= arc.time;
        // Stopped, its time runs on so its streak fades.
        [arc.time, arc.clock] = [arc.time + (now - arc.clock), now];
      }
      arc.feet = where(arc.swing.id) ?? arc.feet;
    }
  }

  /** Flares the latest arc of `striker` as its blow meets something, as strongly as `strength`, if it is still in its
   *  sweep (`lag` the seconds its striker's drawing is held back). */
  struck(striker: number, strength: number, lag = 0): void {
    const arc = this.arcs.findLast((each) => each.swing.id === striker);
    if (!arc) return;
    const time = arc.time - lag;
    if (time >= arc.course.from && time <= arc.course.to + FLARE.fades)
      arc.flare = { when: Math.min(time, arc.course.to), strength };
  }

  /** How many arcs are drawn. */
  get count(): number {
    return this.arcs.length;
  }

  /** The smear behind `striker`'s card as its blow's strike is first drawn, for an eye whose right is `right` (east and
   *  south): back across the view against the way its blade travels, in whole figure pixels; null at any other time. */
  smearOf(striker: number, right: readonly [number, number], lag = 0): Smear | null {
    const arc = this.arcs.findLast((each) => each.swing.id === striker);
    if (!arc) return null;
    const since = arc.time - lag - arc.course.strike;
    if (since < 0 || since >= SMEAR.lasts || (arc.stopped ?? Infinity) < arc.course.strike) return null;
    // Only a blade crossing the eye's view smears: one coming down or driving away would trail over the head.
    const { travel } = arc.course;
    const across = travel[0] * right[0] + travel[1] * right[1];
    if (Math.abs(across) < SMEAR.across) return null;
    const colour = swingRampColour(rampOf(arc.swing), 1, arc.swing.tint);
    return { across: -Math.sign(across) * SMEAR.pixels, up: 0, colour };
  }

  /** The vertices of every arc, seen from `eye`, as `look` sets them; `lagOf` is the seconds each striker's drawing is
   *  held back (a hit-stop). Arcs whose streaks, embers and strikes have faded are let go. */
  mesh(eye: Vector, look: ArcLook, lagOf: (id: number) => number = () => 0): Float32Array {
    const out: number[] = [];
    this.arcs = this.arcs.filter((arc) => {
      const { course, swing } = arc;
      const trail = TRAIL_S * Math.max(0.05, look.trail) * course.weight.trail;
      const time = arc.time - lagOf(swing.id);
      const since = arc.flare ? time - arc.flare.when : -1;
      const flaring = since >= 0 && since < FLARE.lasts;
      const outlives = swing.look || course.ground ? OUTLIVES_S : 0;
      if (time > Math.min(course.to, arc.stopped ?? Infinity) + Math.max(trail, outlives) && !flaring) return false;
      if (look.brightness <= 0) return true;
      const flared = flaring && arc.flare ? arc.flare.strength * Math.exp(-since / FLARE.fades) : 0;
      const strength = look.brightness * (swing.special ? SPECIAL_BRIGHTER : 1) * (1 + flared);
      const layer = layerFor(out, eye, arc.feet, { ramp: rampOf(swing), tint: swing.tint, strength });
      const shape: ArcShape = {
        course,
        feet: arc.feet,
        stopped: arc.stopped ?? Infinity,
        seed: swing.id * 7 + swing.stroke,
        look: swing.special ? 0 : (swing.look ?? 0),
      };
      layStreak(layer, shape, time, trail);
      layElement({ ...layer, strength: look.brightness }, shape, time);
      layGround({ ...layer, strength: look.brightness }, shape, time);
      if (flaring && arc.flare) {
        const size = FLARE.from + (FLARE.to - FLARE.from) * (1 - Math.exp(-since / FLARE.fades));
        const point = tipAt(course, arc.feet, arc.flare.when);
        layStruck({ ...layer, strength: look.brightness * (1 + flared) }, point, size * course.weight.wide ** 0.5);
      }
      return true;
    });
    return new Float32Array(out);
  }
}
