// A raid's call over the middle of the view: a few words, large, on the red the fight's own warnings ("Dodge!") stand
// on, sliding in as the public banner does at a beat, held a moment and faded. Each new call shows afresh and is read
// out; the same call held on (the slam still shown) shows once, and one whose mechanic ends fades at once.
import { motionReduced } from '../plus/kit.ts';
import { announce } from '../ui/announce.ts';
import { cubicBezier } from '../ui/ease.ts';
import type { Node } from '../ui/node.ts';

/** How tall a call stands at the first zoom, CSS pixels: its words three steps of the face, its padding and edge. */
export const CALL_TALL = 3 * 11 + 2 * 6 + 2 * 2;
/** How far under the compass's column a call stands and how far clear of the crosshair, CSS pixels at the first
 *  zoom; and how far either side of the view's middle a figure stands in its way. */
const CALL_CLEAR = 16;
const CROSSHAIR_CLEAR = 28;
export const CALL_REACH = 200;
/** How long a call stands in all, how long it takes to slide in and to fade out, seconds. */
const CALL_S = 1.8;
const SLIDE_S = 0.25;
const FADE_S = 0.4;
/** The warning's red and its white edge, as the fight's warning words draw them (`hitWords.ts`). */
const RED = '#a0140c';
const EDGE = '#ffffff';

/** The call kept across frames, so it shows once for each time it is made. */
export class Callout {
  private words: string | null = null;
  private last: string | null = null;
  private since = Number.POSITIVE_INFINITY;

  /** Hears `call` (none for none) `seconds` after the last frame. */
  update(call: string | null, seconds: number): void {
    this.since += seconds;
    if (call && call !== this.last) {
      [this.words, this.since] = [call, 0];
      announce(call);
    }
    // Its mechanic over (the slam landed), a call still standing fades out now.
    if (!call) this.since = Math.max(this.since, CALL_S - FADE_S);
    this.last = call;
  }

  /** Whether the call stands this frame. */
  get shown(): boolean {
    return this.words !== null && this.since < CALL_S;
  }

  /** The call at `zoom`, its top `top` CSS pixels down the view and centred across it (none: laid where it is put),
   *  its words two steps of the face tall where `short`, so it stands clear of the crosshair in a short view; none
   *  once its moment is over. */
  node(top: number | null, zoom: number, short = false): Node | null {
    if (!this.shown || !this.words) return null;
    const still = motionReduced();
    const slid = still ? 1 : cubicBezier(0.2, 0.8, 0.3, 1, Math.min(1, this.since / SLIDE_S));
    const fading = Math.min(1, Math.max(0, (CALL_S - this.since) / FADE_S));
    return {
      id: 'fight-call',
      padding: short ? [4 * zoom, 14 * zoom] : [6 * zoom, 18 * zoom],
      fill: RED,
      outline: { width: 2 * zoom, colour: EDGE },
      opacity: slid * fading,
      offset: [0, Math.round(-12 * zoom * (1 - slid))],
      ...(top === null ? {} : { float: { to: 'screen', at: [0.5, 0], anchor: [0.5, 0], y: Math.round(top), z: 1 } }),
      children: [{ text: { words: this.words, size: (short ? 2 : 3) * zoom, colour: EDGE, wrap: false } }],
    };
  }
}

/** Where a call's top stands in a view `height` tall at `zoom`: under the compass's column (its foot `under`), no higher
 *  than a quarter down the view, above the crosshair where it fits there; else under the crosshair, and under it too
 *  where above it would cover more of the Boss's figure (`boss`, the span down the view it stands in). */
export function callTop(
  height: number,
  under: number,
  zoom: number,
  boss: { readonly top: number; readonly bottom: number } | null,
): number {
  const tall = CALL_TALL * zoom;
  const above = Math.max(under + CALL_CLEAR * zoom, Math.round(height / 4));
  const below = Math.max(under + CALL_CLEAR * zoom, height / 2 + CROSSHAIR_CLEAR * zoom);
  const covers = (top: number) => (boss ? Math.max(0, Math.min(top + tall, boss.bottom) - Math.max(top, boss.top)) : 0);
  const fits = above + tall <= height / 2 - CROSSHAIR_CLEAR * zoom;
  return fits && covers(above) <= covers(below) ? above : below;
}
