import { CLIMB_ART } from './climbing.ts';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './fpMotion.ts';
import type { Hand } from './handsLaw.ts';

/**
 * The hands on a wall in first person, as DFO's climbing hands move: what the climbing body does, they do. Holding,
 * both fists are up, a still hang swaying on them. Shimmying, the hand the body goes toward reaches first and the
 * other closes up after it; climbing, hand over hand; going over, they go down the view as the body rises past them,
 * press on the top and let go. Looked away from the wall, the hand on that side lets go and reaches in from its edge;
 * the other holds on. The fists are on the wall, not the screen: turning the view carries them across it.
 */

const DEGREE = Math.PI / 180;
const HANDS: readonly Hand[] = ['left', 'right'];

/** A fist on the wall: its height, its middle either side of the screen's, its sleeve under the screen's foot at rest,
 *  and its grip, its share of the height down from its top. Out of the view, it is a fist and its slack under it. */
export const GRIP = { height: 150, apart: 93, slack: 34, at: 0.35 } as const;
const GRIP_WIDTH = (GRIP.height * CLIMB_ART.grip.width) / CLIMB_ART.grip.height;
const OUT = GRIP.height + GRIP.slack;
/** The reaching arm: its width, in from its edge, and its sleeve under the screen's foot once up. */
export const REACH = { width: 190, inset: 4, slack: 16 } as const;
export const REACH_HEIGHT = (REACH.width * CLIMB_ART.reach.height) / CLIMB_ART.reach.width;
/** The gaits, a hand's way on the wall about the body: design pixels a metre; a hand's span along the lip, the share
 *  of its turn it is off the stone, and how far it lifts; a reach up the wall and the share of a stride a hand holds;
 *  how long a hand caught mid-reach takes to finish it; how quickly the climb's way and a new hold are followed. */
const GAIT = {
  pixels: 110,
  span: 0.25,
  shimmyShare: 0.8,
  lift: 12,
  reach: 0.45,
  duty: 0.62,
  settle: 0.18,
  wayTau: 0.12,
  holdTau: 0.06,
} as const;
/** A still hang's sway: across and up, its beat, and how quickly it comes and goes. */
const SWAY = { x: 1.2, y: 2.2, hertz: 0.16, tau: 0.25 } as const;
/** Going over: a mantle's hands sunk as the body rises past them, pressed on the top and out to the sides; a vault's
 *  planted under the hold, sunk as the body passes and apart; a hand not up when it began comes from below; a whole
 *  rise from a hang. */
const OVER = {
  sink: 45,
  press: 22,
  apart: 26,
  plant: 52,
  vaultSink: 34,
  vaultApart: 12,
  below: 90,
  rise: 1.8,
} as const;
/** Looked away: the reach begins this far off the wall's face and is whole here, eased; past `back` (straight back)
 *  the arm keeps its side; looked this far down, the hands go out of the view, all of them here. */
const LOOK = {
  from: 40 * DEGREE,
  full: 75 * DEGREE,
  tau: 0.09,
  back: 170 * DEGREE,
  down: 50 * DEGREE,
  gone: 80 * DEGREE,
};
/** The reaching arm feeling for a hold. */
const SEARCH = { x: 5, y: 4, hertz: 0.6 } as const;

/** What a climb shows the hands: its move, the feet (metres east, south, up), the bearing square into the wall (rising
 *  to the right), and a mantle's or a vault's progress (0 to 1) and how far it rises, metres. */
export interface Climb {
  readonly mode: 'hang' | 'climb' | 'mantle' | 'vault';
  readonly feet: readonly [number, number, number];
  readonly wall: number;
  readonly over: number;
  readonly rise: number;
}

/** The view the hands are seen through: its bearing, how far it looks down (radians, negative up), its vertical field
 *  (0 for none known, when the fists keep to the screen) and its width over its height. */
export interface ClimbLook {
  readonly yaw: number;
  readonly pitch: number;
  readonly fov: number;
  readonly aspect: number;
}

/** A hand drawn: which, its painting's top left on the design surface, and how open it is (0 holding, 1 open). */
export interface HandShown {
  readonly hand: Hand;
  readonly x: number;
  readonly y: number;
  readonly open: number;
}

/** A frame's climbing hands: the fists on the wall, and the arm reaching while the look is away from it. */
export interface ClimbShown {
  readonly grips: readonly HandShown[];
  readonly reach: HandShown | null;
}

type Pair = Record<Hand, [number, number]>;
const pair = (): Pair => ({ left: [0, 0], right: [0, 0] });
const copied = (from: Pair): Pair => ({ left: [...from.left], right: [...from.right] });
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const share = clamp01(value);
  return share * share * (3 - 2 * share);
};
const bump = (value: number) => Math.sin(Math.PI * clamp01(value));
const mix = (from: number, to: number, share: number) => from + (to - from) * share;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const toward = (value: number, target: number, seconds: number, tau: number) => {
  const next = value + (target - value) * (1 - Math.exp(-seconds / tau));
  return Math.abs(next - target) < 0.002 ? target : next;
};

/** A limb's step: the stone it holds, the one it reaches for, how far through the reach (0 holding), and which turn. */
export interface Step {
  readonly anchor: number;
  readonly next: number;
  readonly swing: number;
  readonly cycle: number;
}

/** Hand over hand: stones `stride` apart along the way travelled, each limb `phase` of a stride behind; it holds its
 *  stone for `duty` of a stride, then reaches for the next. */
export function gait(travel: number, stride: number, phase: number, duty: number): Step {
  const along = travel / stride - phase;
  const cycle = Math.floor(along);
  const into = along - cycle;
  const centre = (cycle + duty / 2 + phase) * stride;
  if (into < duty) return { anchor: centre, next: centre, swing: 0, cycle };
  return { anchor: centre, next: centre + stride, swing: (into - duty) / (1 - duty), cycle };
}

/** Along a lip: stones `stride` apart, the body over stone 0 when it took hold. A limb reaches from one to the next
 *  while the travel crosses its band (`width` about `centre`), so two limbs' bands set apart take turns, the one the
 *  body goes toward first. */
export function shimmyGait(travel: number, stride: number, centre: number, width: number): Step {
  const along = (travel - (centre - width / 2)) / stride;
  const cycle = Math.floor(along);
  const into = (along - cycle) * stride;
  if (into < width) return { anchor: cycle * stride, next: (cycle + 1) * stride, swing: into / width, cycle };
  return { anchor: (cycle + 1) * stride, next: (cycle + 1) * stride, swing: 0, cycle };
}

/** Where a point of the design surface, square to the wall and level, stands in a view turned `turn` off the wall (to
 *  the right) and tilted `up`; null where the turn puts it behind the eye. */
export function pinned(x: number, y: number, look: ClimbLook, turn: number, up: number): [number, number] | null {
  const [middleX, middleY] = [DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2];
  const tanY = Math.tan(look.fov / 2);
  const tanX = tanY * look.aspect;
  const across = ((x - middleX) / middleX) * tanX;
  const high = ((middleY - y) / middleY) * tanY;
  const depth = across * Math.sin(turn) + Math.cos(turn);
  if (!(depth > 1e-3)) return null;
  const rise = Math.atan2(high, depth) - up;
  if (!(Math.abs(rise) < Math.PI / 2 - 1e-3)) return null;
  return [
    middleX + ((across * Math.cos(turn) - Math.sin(turn)) / depth / tanX) * middleX,
    middleY - (Math.tan(rise) / tanY) * middleY,
  ];
}

interface Settling {
  value: number;
  last: number;
  cycle: number | null;
}

/** The climbing hands' law, stepped each frame: pure but for its own clock. */
export class ClimbHands {
  private clock = 0;
  private mode: Climb['mode'] | null = null;
  private feet: readonly [number, number, number] | null = null;
  private travel = 0;
  private way: [number, number] = [0, 1];
  private settling: Record<Hand, Settling> = {
    left: { value: 0, last: 0, cycle: null },
    right: { value: 0, last: 0, cycle: null },
  };
  private start: Pair | null = null;
  private base: Pair | null = null;
  private carry = pair();
  private drawn = pair();
  private open: Record<Hand, number> = { left: 0, right: 0 };
  private sway = 0;
  private wall: number | null = null;
  private look = 0;
  private side: Hand = 'right';
  private arm = 0;
  private letGo: Record<Hand, number> = { left: 0, right: 0 };

  /** The hands `seconds` on, on `climb` (null off the wall), `present` of the way onto it (0 under the screen, 1 on the
   *  stone), seen through `look`. Off the wall they leave from where they were. */
  step(seconds: number, climb: Climb | null, look: ClimbLook, present: number): ClimbShown {
    const time = Math.max(0, Math.min(0.1, seconds));
    this.clock += time;
    const moved: [number, number, number] =
      climb && this.feet
        ? [climb.feet[0] - this.feet[0], climb.feet[1] - this.feet[1], climb.feet[2] - this.feet[2]]
        : [0, 0, 0];
    this.feet = climb ? climb.feet : null;
    if (climb) this.place(time, climb, Math.hypot(...moved) > 1 ? [0, 0, 0] : moved, look, present);
    else if (present <= 0) [this.mode, this.base, this.start, this.carry] = [null, null, null, pair()];
    return this.layout(look, present);
  }

  private place(
    seconds: number,
    climb: Climb,
    moved: [number, number, number],
    look: ClimbLook,
    present: number,
  ): void {
    const changed = climb.mode !== this.mode;
    if (changed) {
      this.mode = climb.mode;
      this.travel = 0;
      this.way = [0, 1];
      for (const hand of HANDS) this.settling[hand] = { value: 0, last: 0, cycle: null };
      // A move begun with the hands up starts from where they are; else they come up from below.
      this.start = present >= 0.5 && this.base ? copied(this.base) : null;
      moved = [0, 0, 0];
    }
    const along = moved[0] * Math.cos(climb.wall) + moved[1] * Math.sin(climb.wall);
    const base =
      climb.mode === 'hang'
        ? this.hang(seconds, along)
        : climb.mode === 'climb'
          ? this.climb(seconds, along, moved[2])
          : this.over(climb);
    // A new move carries the hands from where they were onto its own place, so none jumps.
    const kept = Math.exp(-seconds / GAIT.holdTau);
    for (const hand of HANDS)
      for (const axis of [0, 1] as const) {
        this.carry[hand][axis] = changed
          ? this.base && present > 0
            ? this.base[hand][axis] - base[hand][axis]
            : 0
          : this.carry[hand][axis] * kept;
        base[hand][axis] += this.carry[hand][axis];
      }
    this.base = base;
    const drawn = copied(base);
    const still = climb.mode === 'hang' && Math.abs(along) < 1e-5;
    this.sway = toward(this.sway, still ? 1 : 0, seconds, SWAY.tau);
    const beat = 2 * Math.PI * SWAY.hertz * this.clock;
    for (const hand of HANDS) {
      drawn[hand][0] += this.sway * SWAY.x * Math.sin(beat);
      drawn[hand][1] += this.sway * SWAY.y * Math.sin(beat * 1.37);
    }
    this.drawn = drawn;
    this.wall = climb.wall;
    // Looked away from the wall, the hand on that side becomes the reaching arm; it crosses to the other side down
    // off one edge and up the other, and turned straight back it keeps its side.
    const turn = wrap(look.yaw - climb.wall);
    const onWall = climb.mode === 'hang' || climb.mode === 'climb';
    const deep = onWall ? smooth((Math.abs(turn) - LOOK.from) / (LOOK.full - LOOK.from)) : 0;
    this.look = toward(this.look, deep, seconds, LOOK.tau);
    const wanted: Hand = Math.abs(turn) > LOOK.back ? this.side : turn >= 0 ? 'right' : 'left';
    if (wanted !== this.side && this.arm < 0.2) this.side = wanted;
    this.arm = toward(this.arm, wanted === this.side ? this.look : 0, seconds, LOOK.tau);
    for (const hand of HANDS)
      this.letGo[hand] = toward(this.letGo[hand], hand === this.side ? this.look : 0, seconds, LOOK.tau);
  }

  /** A limb caught mid-reach when the body stops finishes it on its own clock, and holds its new stone until the
   *  gait's reach is behind it. */
  private settled(hand: Hand, step: Step, moving: boolean, seconds: number): number {
    const kept = this.settling[hand];
    if (step.swing <= 0) {
      [kept.value, kept.cycle] = [0, null];
      return 0;
    }
    if (kept.cycle !== step.cycle) [kept.cycle, kept.value, kept.last] = [step.cycle, step.swing, step.swing];
    if (!moving)
      kept.value =
        kept.value >= 0.5
          ? Math.min(1, kept.value + seconds / GAIT.settle)
          : Math.max(0, kept.value - seconds / GAIT.settle);
    else if (step.swing >= kept.last)
      kept.value =
        kept.last < 1 ? kept.value + ((1 - kept.value) * (step.swing - kept.last)) / (1 - kept.last) : step.swing;
    else kept.value = kept.last > 0 ? (kept.value * step.swing) / kept.last : step.swing;
    kept.last = step.swing;
    return kept.value;
  }

  private hang(seconds: number, along: number): Pair {
    this.travel += along;
    const moving = Math.abs(along) > 1e-5;
    const out = pair();
    for (const hand of HANDS) {
      const centre = hand === 'right' ? GAIT.span / 2 : 1.5 * GAIT.span;
      const step = shimmyGait(this.travel, 2 * GAIT.span, centre, GAIT.shimmyShare * GAIT.span);
      const swing = this.settled(hand, step, moving, seconds);
      const atLip = mix(step.anchor, step.next, smooth(swing)) - this.travel;
      out[hand] = [atLip * GAIT.pixels, -GAIT.lift * bump(swing)];
      this.open[hand] = bump(swing);
    }
    return out;
  }

  private climb(seconds: number, across: number, up: number): Pair {
    const step = Math.hypot(across, up);
    if (step > 1e-5) {
      // The way is eased, so a climb that wavers moves no stone, and one turned back mirrors them through the body.
      const share = 1 - Math.exp(-seconds / GAIT.wayTau);
      this.way = [mix(this.way[0], across / step, share), mix(this.way[1], up / step, share)];
      this.travel += step;
    }
    const out = pair();
    for (const hand of HANDS) {
      const limb = gait(this.travel, 2 * GAIT.reach, hand === 'right' ? 0 : 0.5, GAIT.duty);
      const swing = this.settled(hand, limb, step > 1e-5, seconds);
      const stone = mix(limb.anchor - this.travel, limb.next - this.travel, smooth(swing));
      out[hand] = [this.way[0] * stone * GAIT.pixels, -this.way[1] * stone * GAIT.pixels];
      this.open[hand] = bump(swing);
    }
    return out;
  }

  private over(climb: Climb): Pair {
    const progress = clamp01(climb.over);
    const from = (hand: Hand) => this.start?.[hand] ?? [0, OVER.below];
    const out = pair();
    if (climb.mode === 'vault') {
      const [plant, pass, letGo] = [
        smooth(progress / 0.12),
        smooth((progress - 0.12) / 0.43),
        smooth((progress - 0.55) / 0.25),
      ];
      for (const hand of HANDS) {
        const side = hand === 'right' ? 1 : -1;
        out[hand] = [
          mix(from(hand)[0], 0, plant) + side * OVER.vaultApart * pass,
          mix(from(hand)[1], OVER.plant, plant) + OVER.vaultSink * pass + OUT * letGo,
        ];
        this.open[hand] = Math.max(pass, letGo);
      }
      return out;
    }
    // Up the face, the body rising past the hands takes them down the view; then the palms press on the top and let go.
    const split = 0.5;
    const rising = smooth(progress / split);
    const beyond = progress <= split ? 0 : (progress - split) / (1 - split);
    const edge = OVER.sink * clamp01((OVER.rise - climb.rise) / 1.2);
    const sink = OVER.sink * clamp01(climb.rise / OVER.rise) * rising;
    const take = this.start ? 1 : smooth(progress / (split * 0.4));
    const press = smooth(beyond / 0.35);
    const letGo = smooth((beyond - 0.6) / 0.35);
    for (const hand of HANDS) {
      const side = hand === 'right' ? 1 : -1;
      const begun = from(hand);
      const top = this.start ? begun[1] : mix(begun[1], edge, take);
      const across = this.start ? begun[0] * (1 - rising) : 0;
      out[hand] = [across + side * OVER.apart * press, top + sink + OVER.press * press + OUT * letGo];
      this.open[hand] = Math.max(press, letGo);
    }
    return out;
  }

  private layout(look: ClimbLook, present: number): ClimbShown {
    const gone = smooth((look.pitch - LOOK.down) / (LOOK.gone - LOOK.down)) * OUT;
    const enter = (1 - smooth(present)) * OUT;
    // Each fist's grip is pinned to the wall through the view's turn off it and its tilt; up the view it goes no
    // further than its sleeve's slack, so a hand gone under the screen's foot stays there whatever the look.
    const pinning = this.wall !== null && look.fov > 0;
    const turn = pinning ? wrap(look.yaw - (this.wall ?? 0)) : 0;
    const up = pinning ? -look.pitch : 0;
    const rest = DESIGN_HEIGHT - GRIP.height + GRIP.slack;
    const gripY = rest + GRIP.at * GRIP.height;
    const grips: HandShown[] = [];
    for (const hand of HANDS) {
      const gripX = DESIGN_WIDTH / 2 + (hand === 'right' ? GRIP.apart : -GRIP.apart) + this.drawn[hand][0];
      const spot = turn || up ? pinned(gripX, gripY, look, turn, up) : [gripX, gripY];
      if (!spot) continue;
      const x = spot[0] - GRIP_WIDTH / 2;
      const lifted = Math.max(
        DESIGN_HEIGHT - GRIP.height,
        rest + this.drawn[hand][1] + Math.max(spot[1] - gripY, -GRIP.slack),
      );
      const y = lifted + enter + gone + smooth(this.letGo[hand]) * OUT;
      if (y >= DESIGN_HEIGHT || x >= DESIGN_WIDTH || x + GRIP_WIDTH <= 0) continue;
      grips.push({ hand, x, y, open: Math.max(1 - present, this.open[hand], this.letGo[hand]) });
    }
    if (this.arm <= 0.001) return { grips, reach: null };
    const feel = 2 * Math.PI * SEARCH.hertz * this.clock;
    const inset = REACH.inset + SEARCH.x * Math.sin(feel);
    const x = this.side === 'right' ? DESIGN_WIDTH - inset - REACH.width : inset;
    const lowered = (1 - smooth(this.arm)) * (REACH_HEIGHT + REACH.slack);
    const y = Math.max(
      DESIGN_HEIGHT - REACH_HEIGHT,
      DESIGN_HEIGHT - REACH_HEIGHT + REACH.slack + SEARCH.y * Math.sin(feel * 1.6 + 0.7) + lowered + enter + gone,
    );
    return { grips, reach: y < DESIGN_HEIGHT ? { hand: this.side, x, y, open: smooth(this.arm) } : null };
  }
}
