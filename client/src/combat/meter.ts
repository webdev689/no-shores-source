// A bar of the fight's display: its trough and fill in the kit's roles, and behind the fill what it last lost. As DFO's
// Enhanced HUD did, a strip holds where the bar stood for a moment after a loss and then drains to it, and a real bite
// breaks off the bar as a piece that falls, so a blow reads as how much it took and not only where it left the bar.
import { motionReduced, ROLES } from '../plus/kit.ts';

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

const percent = (share: number) => `${Math.round(Math.max(0, Math.min(1, share)) * 1000) / 10}%`;

export function element(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const made = document.createElement(tag);
  made.className = className;
  made.textContent = text;
  parent.append(made);
  return made;
}

/** A falling piece: its node, its two halves and how long it has fallen. */
interface Piece {
  readonly root: HTMLElement;
  readonly halves: readonly [HTMLElement, HTMLElement];
  age: number;
}

/** What a bar shows besides its fill: the strip of what it lost (not on a bar that drains of itself), and the least
 *  share a frame must take for its bite to fall as a piece (none for no pieces). */
export interface MeterParts {
  readonly lossShown?: boolean;
  readonly pieceLeast?: number | null;
}

/** A bar: a trough, the strip of what it lost, its fill and the two pieces its losses fall as in turn. */
export class Meter {
  readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly lost: HTMLElement | null;
  private readonly pieceLeast: number | null;
  private readonly pieces: Piece[] = [];
  private loss: Loss | null = null;
  private bites = 0;

  constructor(parent: HTMLElement, className: string, parts: MeterParts = {}) {
    this.root = element('div', `meter ${className} ${ROLES.track}`, parent);
    this.lost = parts.lossShown === false ? null : element('i', 'lost', this.root);
    this.fill = element('i', `fill ${ROLES.meter}`, this.root);
    this.pieceLeast = parts.pieceLeast ?? null;
    if (this.pieceLeast === null) return;
    for (let made = 0; made < 2; made++) {
      const root = element('i', 'piece', this.root);
      root.hidden = true;
      this.pieces.push({ root, halves: [element('i', 'left', root), element('i', 'right', root)], age: Infinity });
    }
  }

  /** Shows the bar at `share`, `seconds` after the last frame. */
  set(share: number, seconds: number): void {
    const was = this.loss;
    this.loss = stepLoss(was, share, seconds);
    this.fill.style.width = percent(this.loss.share);
    if (this.lost) this.lost.style.width = percent(this.loss.at);
    for (const piece of this.pieces) this.fall(piece, piece.age + seconds);
    const bite = this.pieceLeast === null ? null : bitten(was, this.loss, this.pieceLeast);
    const piece = this.pieces[this.bites % 2];
    if (!bite || !piece || motionReduced()) return;
    this.bites += 1;
    piece.root.style.left = percent(bite.left);
    piece.root.style.width = percent(bite.width);
    this.fall(piece, 0);
  }

  /** Forgets what the bar lost: it shows another figure from now, which last stood at `from` (null for nothing known,
   *  when its first frame sets the strip on the bar). */
  forget(from: number | null = null): void {
    this.loss = from === null ? null : stepLoss(null, from, 0);
    for (const piece of this.pieces) this.fall(piece, Infinity);
  }

  private fall(piece: Piece, age: number): void {
    piece.age = age;
    const [left, right] = [pieceAt(age, 'left'), pieceAt(age, 'right')];
    piece.root.hidden = !left && !right;
    piece.halves.forEach((half, index) => {
      const place = index === 0 ? left : right;
      half.style.transform = place ? `translate(${place.x}px, ${place.y}px)` : '';
      half.style.opacity = place ? String(place.opacity) : '0';
    });
  }
}
