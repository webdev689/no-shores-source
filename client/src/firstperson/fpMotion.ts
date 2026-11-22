/** The design screen every first-person picture is placed on, scaled to the canvas. */
export const DESIGN_WIDTH = 320;
export const DESIGN_HEIGHT = 200;

/** The pendulum a flail's chain swings by: its own swing, how fast a free swing dies, how closely and how calmly a
 *  walk holds it, the walk's sways a second, and the walk's and the run's arcs as shares of the drawn arc. */
const CHAIN = {
  natural: 2 * Math.PI * 1.0,
  freeDamp: 0.14,
  follow: 2 * Math.PI * 2.4,
  heldDamp: 0.6,
  sways: 0.9,
  walkArc: 0.55,
  runArc: 0.85,
  longestStep: 0.05,
} as const;

/** A flail's chain: where its ball hangs, -1 the arc's far left to 1 its far right. A walk sways it with the stride,
 *  wider at a run; stopped, it swings on at its own rate and settles. */
export class ChainSwing {
  private angle = 0;
  private speed = 0;
  private phase = 0;

  /** Moves the chain on by `seconds` at `pace`: 0 standing, 1 walking, 2 running. */
  step(seconds: number, pace: number): number {
    const tick = Math.min(Math.max(seconds, 0), CHAIN.longestStep);
    if (!tick) return this.angle;
    let pull: number;
    if (pace > 0.05) {
      this.phase = (this.phase + 2 * Math.PI * CHAIN.sways * Math.min(pace, 2) * tick) % (2 * Math.PI);
      const arc =
        pace <= 1 ? CHAIN.walkArc * pace : CHAIN.walkArc + (CHAIN.runArc - CHAIN.walkArc) * Math.min(1, pace - 1);
      pull =
        CHAIN.follow * CHAIN.follow * (arc * Math.sin(this.phase) - this.angle) -
        2 * CHAIN.heldDamp * CHAIN.follow * this.speed;
    } else {
      pull = -CHAIN.natural * CHAIN.natural * this.angle - 2 * CHAIN.freeDamp * CHAIN.natural * this.speed;
    }
    this.speed += pull * tick;
    this.angle += this.speed * tick;
    // The drawn arc ends here: the ball knocks back off its end.
    if (Math.abs(this.angle) > 1) {
      this.angle = Math.sign(this.angle);
      this.speed *= -0.3;
    }
    return this.angle;
  }
}

/** The swing frame of `count` drawn for where the ball hangs (-1 to 1): the nearest. */
export function swayFrame(hangs: number, count: number): number {
  const share = (Math.max(-1, Math.min(1, hangs)) + 1) / 2;
  return Math.min(count - 1, Math.max(0, Math.round(share * (count - 1))));
}

/** How far one step carries a runner; the stride is two. */
const STEP_M = 2.5;
/** The running arms' frames through one stride. */
export const RUN_FRAMES = 8;

/** The running arm's frame at `stride` metres run: the right arm's, or the left's half a stride behind. */
export function runFrameAt(stride: number, left: boolean): number {
  const turn = stride / (2 * STEP_M) + (left ? 0.5 : 0);
  return (((Math.round(turn * RUN_FRAMES) % RUN_FRAMES) + RUN_FRAMES) % RUN_FRAMES) | 0;
}

/** The bob's depth in design pixels at a walk and at a run, and how quickly it comes and goes. */
const BOB_WALK = 2;
const BOB_RUN = 4;
const BOB_EASE = 0.15;

/** The hands' bob as their bearer walks: a dip each step, deeper at a run, easing out when they stop. */
export class Bob {
  private depth = 0;

  /** The drop in design pixels after `seconds`, at `stride` metres walked. */
  step(seconds: number, stride: number, moving: boolean, running: boolean): number {
    const target = !moving ? 0 : running ? BOB_RUN : BOB_WALK;
    this.depth += (target - this.depth) * (1 - Math.exp(-Math.max(0, seconds) / BOB_EASE));
    return (this.depth * (1 - Math.cos((2 * Math.PI * stride) / STEP_M))) / 2;
  }
}

/** The weapon's sway in design pixels: how far it lags a radian a second of turning or tilting, at most, and how
 *  quickly it catches up (a time constant, seconds); and how far aside it swings once each two steps, at a walk and at
 *  a run. */
const SWAY = { lag: 4, most: 12, ease: 0.1, walk: 2, run: 4 } as const;

/** The weapon's sway as it is held: it lags behind the look as it turns or tilts and settles as the look does, and
 *  swings aside with the steps, wider at a run, easing out when they stop. */
export class Sway {
  private x = 0;
  private y = 0;
  private depth = 0;
  private last: { readonly yaw: number; readonly pitch: number } | null = null;

  /** The sway (design pixels across and down) after `seconds`, the look's bearing rising to the right and its tilt
   *  down (`look`, null while nothing sways), at `stride` metres walked. */
  step(
    seconds: number,
    look: { readonly yaw: number; readonly pitch: number } | null,
    stride: number,
    moving: boolean,
    running: boolean,
  ): readonly [number, number] {
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const was = this.last;
    this.last = look;
    const rate = (now: number, then: number) =>
      time > 0 ? Math.atan2(Math.sin(now - then), Math.cos(now - then)) / time : 0;
    const [turn, tilt] = look && was ? [rate(look.yaw, was.yaw), rate(look.pitch, was.pitch)] : [0, 0];
    const lag = (speed: number) => Math.max(-SWAY.most, Math.min(SWAY.most, -speed * SWAY.lag));
    const ease = 1 - Math.exp(-time / SWAY.ease);
    this.x += (lag(turn) - this.x) * ease;
    this.y += (lag(tilt) - this.y) * ease;
    const target = !look || !moving ? 0 : running ? SWAY.run : SWAY.walk;
    this.depth += (target - this.depth) * (1 - Math.exp(-time / BOB_EASE));
    return [this.x + this.depth * Math.sin((Math.PI * stride) / STEP_M), this.y];
  }
}

/** How quickly the weapon goes down for a climb and comes back after, in seconds a time constant, and how far down it
 *  is out of sight. */
const LOWER_DOWN = 0.07;
const LOWER_UP = 0.14;
export const LOWERED_GONE = 0.98;

/** The weapon lowered for a climb, 0 in the hand to 1 gone: eased toward `climbing`, down quickly as the hands go to
 *  the stone and back up a little slower. */
export function lowerStep(lower: number, climbing: number, seconds: number): number {
  const target = Math.min(1, Math.max(0, climbing));
  const tau = target > lower ? LOWER_DOWN : LOWER_UP;
  const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const next = lower + (target - lower) * (1 - Math.exp(-time / tau));
  return Math.abs(target - next) < 0.005 ? target : next;
}

/** How far the lowered weapon has sunk, in design pixels: a smooth step over the screen's height. */
export function lowerDrop(lower: number): number {
  const share = Math.min(1, Math.max(0, lower));
  return share * share * (3 - 2 * share) * DESIGN_HEIGHT;
}
