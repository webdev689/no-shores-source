// A bar of the fight's display: its trough and fill in the kit's roles, and behind the fill what it last lost. As DFO's
// Enhanced HUD did, a strip holds where the bar stood for a moment after a loss and then drains to it, and a real bite
// breaks off the bar as a piece that falls, so a blow reads as how much it took and not only where it left the bar.
import { bitten, type Loss, pieceAt, stepLoss } from './barLoss.ts';
import { motionReduced, ROLES } from './kit.ts';

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

/** A bar warns low (the vitals' health, a ship's hull) with some left but no more than this share of it. */
export const LOW_SHARE = 0.25;

/** Whether a bar at `share` warns low. */
export const lowShare = (share: number): boolean => share > 0 && share <= LOW_SHARE;
