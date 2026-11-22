// The pad's cursor in a window, with DFO's feel: the left stick moves a free pointer fast enough to cross the view yet
// easy to stop on a press. A light lean is a fine move (the curve); a flick eases in and a let-go stops dead (the
// ramp); a long full lean speeds up (the boost); over a press it slows (the friction), and with the stick light or at
// rest it is drawn onto the middle of the press it is over or near (the pull), never against a firm push. Lengths
// here are the page's CSS pixels; `Interface` hears the stick, steps the cursor and presses with it.
import { GAUNTLET_SIZE, type GauntletFrame, gauntletPixels } from './gauntlet.ts';
import type { Laid, Node } from './node.ts';
import type { Box } from './quads.ts';

export const PAD_CURSOR = {
  /** CSS pixels a second at a full lean. */
  SPEED: 900,
  CURVE: 1.7,
  RAMP_S: 0.1,
  BOOST: 1.6,
  BOOST_AFTER_S: 0.45,
  BOOST_RAMP_S: 0.3,
  /** The throw past the dead zone, 0 to 1, that counts as a full lean. */
  FULL_LEAN: 0.95,
  FRICTION: 0.4,
  /** The share of the way to a press's middle the pull closes a second, and how near a press's edge it reaches. */
  PULL: 10,
  PULL_RADIUS: 28,
  /** A throw this light or lighter is pulled, the more the lighter. */
  PULL_MAX_STICK: 0.5,
  /** A step shorter than this both ways, CSS pixels, is no move. */
  SETTLE: 0.05,
  /** The right stick leant past this scrolls, at the full speed. */
  SCROLL_LEAN: 0.25,
} as const;

/** A stick leaning less than this is at rest, as the game reads one (`pad.ts`). */
export const STICK_REST = 0.2;

/** What a cursor carries between frames: its speed each way (pixels a second, down positive) and how long the stick
 *  has been at a full lean. */
export interface CursorFeel {
  across: number;
  down: number;
  full: number;
}

/** The lean past the dead zone, 0 to 1. */
const throwOf = (lean: number, dead: number): number =>
  lean > dead ? Math.min(1, (lean - dead) / Math.max(1e-6, 1 - dead)) : 0;

/** The lean past the dead zone as 0 to 1, curved, so a light lean moves little. */
export const curvedThrow = (lean: number, dead = STICK_REST, curve: number = PAD_CURSOR.CURVE): number =>
  throwOf(lean, dead) ** curve;

/** One frame of the cursor: the stick `x`, `y` (down positive), `speed` pixels a second at a full lean, whether it
 *  stands `over` a press, and the middle of the press to pull toward from `at`. Answers the step and moves `feel`. */
export function stepPadCursor(
  feel: CursorFeel,
  move: {
    readonly x: number;
    readonly y: number;
    readonly seconds: number;
    readonly speed: number;
    readonly over?: boolean;
    readonly target?: { readonly x: number; readonly y: number } | null;
    readonly at?: { readonly x: number; readonly y: number } | null;
  },
): { x: number; y: number } {
  const { seconds } = move;
  const lean = Math.hypot(move.x, move.y);
  const curved = curvedThrow(lean);
  const raw = throwOf(lean, STICK_REST);
  feel.full = raw >= PAD_CURSOR.FULL_LEAN ? feel.full + seconds : 0;
  const climb = (feel.full - PAD_CURSOR.BOOST_AFTER_S) / PAD_CURSOR.BOOST_RAMP_S;
  const boost = 1 + (PAD_CURSOR.BOOST - 1) * Math.min(1, Math.max(0, climb));
  if (curved === 0) [feel.across, feel.down] = [0, 0];
  else {
    const speed = move.speed * curved * boost * (move.over && boost === 1 ? PAD_CURSOR.FRICTION : 1);
    const ease = Math.min(1, seconds / PAD_CURSOR.RAMP_S);
    feel.across += ((move.x / lean) * speed - feel.across) * ease;
    feel.down += ((move.y / lean) * speed - feel.down) * ease;
  }
  const step = { x: feel.across * seconds, y: feel.down * seconds };
  const { target, at } = move;
  if (target && at && raw < PAD_CURSOR.PULL_MAX_STICK) {
    const pull = Math.min(1, PAD_CURSOR.PULL * seconds) * (1 - raw / PAD_CURSOR.PULL_MAX_STICK);
    step.x += (target.x - at.x) * pull;
    step.y += (target.y - at.y) * pull;
  }
  return step;
}

/** The middle of the box the point is in, or of the nearest whose edge is within `radius`, and whether it is in it;
 *  null with none so near. */
export function pullTargetAmong(
  boxes: readonly Box[],
  x: number,
  y: number,
  radius: number = PAD_CURSOR.PULL_RADIUS,
): { x: number; y: number; inside: boolean } | null {
  let best: { x: number; y: number; inside: boolean } | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    if (!(box.width > 0) || !(box.height > 0)) continue;
    const across = Math.max(box.x - x, 0, x - (box.x + box.width));
    const down = Math.max(box.y - y, 0, y - (box.y + box.height));
    const gap = Math.hypot(across, down);
    if (gap > radius || gap >= bestGap) continue;
    bestGap = gap;
    best = { x: box.x + box.width / 2, y: box.y + box.height / 2, inside: gap === 0 };
  }
  return best;
}

/** What of `laid` shows inside its clip: a press scrolled out of its list pulls nothing. */
function shownBox({ box, clip }: Laid): Box {
  const x = Math.max(box.x, clip.x);
  const y = Math.max(box.y, clip.y);
  const right = Math.min(box.x + box.width, clip.x + clip.width);
  const bottom = Math.min(box.y + box.height, clip.y + clip.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/** Above every layer the game draws, the keys it draws among them. */
const CURSOR_Z = 1000;

/** The cursor as the interface keeps it, in the interface's pixels: out or put away, where it stands, the sticks as
 *  last heard, and whether A holds it down. */
export class PadCursor {
  out = false;
  spot = { x: 0, y: 0 };
  pressing = false;
  private readonly feel: CursorFeel = { across: 0, down: 0, full: 0 };
  private stick = { x: 0, y: 0, scroll: 0 };
  /** Scrolling short of a whole pixel, kept for the next frame. */
  private scrolled = 0;
  /** Set where it was carried this frame, which the next lay of the interface may scroll: it holds still once. */
  private carried = false;

  /** Hears the sticks; a throw of the left from rest past the dead zone brings the cursor out at `home` where the
   *  pad is the window's (`takes`), so a stick leant as a window opens moves nothing until it has come back. */
  hear(
    stick: { readonly x: number; readonly y: number; readonly scroll: number },
    takes: boolean,
    home: () => Box,
  ): void {
    const rested = Math.hypot(this.stick.x, this.stick.y) <= STICK_REST;
    this.stick = { x: stick.x, y: stick.y, scroll: stick.scroll };
    if (takes && rested && Math.hypot(stick.x, stick.y) > STICK_REST) this.bringOut(home());
  }

  /** Brings it out on the middle of `home`, unless it is out already. */
  bringOut(home: Box): void {
    if (this.out) return;
    this.carry(home);
    this.out = true;
  }

  /** Puts it away, for the mouse or the keys; a press A holds is let go only with A. */
  away(): void {
    this.out = false;
  }

  /** Puts it away as the pad stops being the interface's: whatever A held is let go with the window. */
  close(): void {
    [this.out, this.pressing] = [false, false];
  }

  /** Stands it on the middle of `box`, at rest: where a step of the cross lands it. */
  carry(box: Box): void {
    this.spot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    [this.feel.across, this.feel.down, this.carried] = [0, 0, true];
  }

  /** One frame `seconds` long over what the pad can press (`reachable`), in a view `width` by `height`, `inward` of
   *  the interface's pixels a CSS pixel. Answers the whole pixels the right stick scrolls this frame, and where:
   *  at the cursor, or the middle of `home` while it is away. */
  step(
    seconds: number,
    reachable: readonly Laid[],
    view: { readonly width: number; readonly height: number },
    inward: number,
    home: Box,
  ): { scroll: number; at: { x: number; y: number } } {
    const scrolling = Math.abs(this.stick.scroll) > PAD_CURSOR.SCROLL_LEAN;
    this.scrolled = scrolling ? this.scrolled + this.stick.scroll * PAD_CURSOR.SPEED * inward * seconds : 0;
    const scroll = Math.trunc(this.scrolled);
    this.scrolled -= scroll;
    if (!this.out) return { scroll, at: { x: home.x + home.width / 2, y: home.y + home.height / 2 } };
    if (this.carried) {
      this.carried = false;
      return { scroll, at: { ...this.spot } };
    }
    const target = pullTargetAmong(reachable.map(shownBox), this.spot.x, this.spot.y, PAD_CURSOR.PULL_RADIUS * inward);
    const move = { ...this.stick, seconds, speed: PAD_CURSOR.SPEED * inward, over: Boolean(target?.inside) };
    const step = stepPadCursor(this.feel, { ...move, target, at: this.spot });
    const settle = PAD_CURSOR.SETTLE * inward;
    if (Math.abs(step.x) >= settle || Math.abs(step.y) >= settle)
      this.spot = {
        x: Math.min(view.width - 1, Math.max(0, this.spot.x + step.x)),
        y: Math.min(view.height - 1, Math.max(0, this.spot.y + step.y)),
      };
    return { scroll, at: { ...this.spot } };
  }

  /** The gauntlet where the cursor stands while it is out, over all else and letting the pointer through: pressed
   *  while A holds it down. */
  node(): Node | null {
    if (!this.out) return null;
    const frame: GauntletFrame = this.pressing ? 'press' : 'point';
    return {
      ...GAUNTLET_SIZE,
      through: true,
      float: { to: 'screen', x: Math.round(this.spot.x), y: Math.round(this.spot.y), z: CURSOR_Z },
      picture: { key: `gauntlet:${frame}`, source: { pixels: () => gauntletPixels(frame) }, pixel: GAUNTLET_SIZE },
    };
  }
}
