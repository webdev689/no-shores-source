// A bar of the fight's display: its fill and behind it what it last lost. As DFO's Enhanced HUD did, a strip holds
// where the bar stood for a moment after a loss and then drains to it, and a real bite breaks off the bar as a piece
// that falls, so a blow reads as how much it took and not only where it left the bar. The bar keeps these from frame to
// frame and draws them into the trough its plate lays.
import { bitten, type Loss, pieceAt, stepLoss } from '../plus/barLoss.ts';
import { motionReduced } from '../plus/kit.ts';
import { bands, faded, kitFill, mix, type Pen, piece, span } from './barDraw.ts';

/** What a bar shows besides its fill: the strip of what it lost (not on a bar that drains of itself), and the least
 *  share a frame must take for its bite to fall as a piece (none for no pieces). */
export interface MeterParts {
  readonly lossShown?: boolean;
  readonly pieceLeast?: number | null;
}

/** A falling piece: the span it was bitten from, and how long it has fallen. */
interface Piece {
  left: number;
  width: number;
  age: number;
}

/** How a bar's lost strip is drawn: pale, a foe's bar's own hue lightened under a cream top line; or faint, a vital's
 *  own tone, darker than any band of its fill. */
export type LostLook = 'pale' | 'faint';

/** A bar: the strip of what it lost, its fill and the two pieces its losses fall as in turn. */
export class Meter {
  private readonly lossShown: boolean;
  private readonly pieceLeast: number | null;
  readonly pieces: Piece[] = [];
  private loss: Loss | null = null;
  private bites = 0;

  constructor(parts: MeterParts = {}) {
    this.lossShown = parts.lossShown !== false;
    this.pieceLeast = parts.pieceLeast ?? null;
    if (this.pieceLeast === null) return;
    for (let made = 0; made < 2; made++) this.pieces.push({ left: 0, width: 0, age: Infinity });
  }

  /** The share the fill stands at, and where the lost strip reaches (no further than the fill without one). */
  get shown(): { readonly share: number; readonly at: number } {
    const share = this.loss?.share ?? 0;
    return { share, at: this.lossShown ? (this.loss?.at ?? share) : share };
  }

  /** Shows the bar at `share`, `seconds` after the last frame. */
  set(share: number, seconds: number): void {
    const was = this.loss;
    this.loss = stepLoss(was, share, seconds);
    for (const each of this.pieces) each.age += seconds;
    const bite = this.pieceLeast === null ? null : bitten(was, this.loss, this.pieceLeast);
    const next = this.pieces[this.bites % 2];
    if (!bite || !next || motionReduced()) return;
    this.bites += 1;
    Object.assign(next, { left: bite.left, width: bite.width, age: 0 });
  }

  /** Forgets what the bar lost: it shows another figure from now, which last stood at `from` (null for nothing known,
   *  when its first frame sets the strip on the bar). */
  forget(from: number | null = null): void {
    this.loss = from === null ? null : stepLoss(null, from, 0);
    for (const each of this.pieces) each.age = Infinity;
  }

  /** Draws the lost strip, the fill in `fill` and the falling pieces into the trough `pen` holds. */
  draw(pen: Pen, fill: string, lost: LostLook): void {
    const { share, at } = this.shown;
    if (at > share) {
      const strip = span(pen, 0, at);
      if (lost === 'faint') bands(pen, strip, { body: faded(fill, 0.35) });
      else {
        const cream = '#fff6e4';
        bands(pen, strip, { top: faded(cream, 0.6), topDeep: 1, body: faded(mix(fill, cream, 0.55), 0.6) });
      }
    }
    kitFill(pen, span(pen, 0, share), fill);
    for (const each of this.pieces) {
      const halves = [pieceAt(each.age, 'left'), pieceAt(each.age, 'right')];
      if (halves.some(Boolean)) piece(pen, each.left, each.width, halves, fill);
    }
  }
}
