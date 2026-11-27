// A bar's losses, read at a glance as DFO's Enhanced HUD read them: a strip holds where the bar stood for a moment
// after a loss and then drains to it, and a real bite breaks off the bar as a piece that falls. Every bar that loses
// reads its losses by this one law, a foe's or the player's on foot and a ship's at sea.

/** How long the lost strip stands after a loss before it drains, in seconds; the longest it stands however the losses
 *  keep coming, so a bar losing a little every frame still drains; and how fast it drains, in shares a second. */
export const LOSS_HOLD = 0.55;
export const LOSS_HOLD_MOST = 1.2;
export const LOSS_DRAIN = 0.7;

/** The lost strip: where it stands, the bar's share under it, its hold left and how long it has stood. */
export interface Loss {
  readonly at: number;
  readonly share: number;
  readonly hold: number;
  readonly stood: number;
}

/** One frame of the lost strip, `seconds` after `was` (null on a bar's first frame), the bar now at `share`. A gain
 *  sets it on the bar; a fresh loss holds it again where it stands, so a flurry reads as one run of harm. */
export function stepLoss(was: Loss | null, share: number, seconds: number): Loss {
  const now = Math.max(0, Math.min(1, share));
  if (!was || now >= was.at) return { at: now, share: now, hold: LOSS_HOLD, stood: 0 };
  const stood = was.stood + seconds;
  if (stood < LOSS_HOLD_MOST) {
    if (now < was.share) return { at: was.at, share: now, hold: LOSS_HOLD, stood };
    if (was.hold > 0) return { at: was.at, share: now, hold: was.hold - seconds, stood };
  }
  return { at: Math.max(now, was.at - LOSS_DRAIN * seconds), share: now, hold: 0, stood };
}

/** The least share of a bar one frame must take for the bite to break off and fall: the player's vitals' (a blow or a
 *  spent swing, never a trickle), a foe's, and a ship's hull. */
export const PIECE_LEAST = { vital: 0.015, foe: 0.005, hull: 0.01 } as const;

/** The span a frame bit out of a bar, from `was` to `now` (shares from its left), or null for less than `least`. */
export function bitten(
  was: Loss | null,
  now: Loss,
  least: number,
): { readonly left: number; readonly width: number } | null {
  return was && was.share - now.share >= least ? { left: now.share, width: was.share - now.share } : null;
}

/** A piece's two halves as they fall, the left one 55% of it: how long each falls, where it is at its turn (the share
 *  of its fall when it starts to fade), and where it ends, in CSS pixels across and down. */
export const PIECE_FALL = {
  left: { seconds: 0.56, turn: 0.25, at: [-1, 3], to: [-4, 22] },
  right: { seconds: 0.64, turn: 0.35, at: [2, 5], to: [5, 28] },
} as const;
const PIECE_STEPS = 8;

/** Where a half of a piece stands `age` seconds into its fall and how much of it shows, or null once it has fallen. It
 *  moves in eight hard steps to its turn and eight more to its end, never a smooth slide, and fades after its turn. */
export function pieceAt(age: number, half: keyof typeof PIECE_FALL): { x: number; y: number; opacity: number } | null {
  const fall = PIECE_FALL[half];
  const share = Math.max(0, age) / fall.seconds;
  if (share >= 1) return null;
  const stepped = (part: number) => Math.floor(part * PIECE_STEPS) / PIECE_STEPS;
  const [from, to, part] =
    share < fall.turn
      ? [[0, 0], fall.at, stepped(share / fall.turn)]
      : [fall.at, fall.to, stepped((share - fall.turn) / (1 - fall.turn))];
  const along = (axis: 0 | 1) => (from[axis] ?? 0) + ((to[axis] ?? 0) - (from[axis] ?? 0)) * part;
  return { x: along(0), y: along(1), opacity: share < fall.turn ? 1 : 1 - part };
}
