// A raid's call over the middle of the view: a few words, large, on the red the fight's own warnings ("Dodge!") stand
// on, sliding in as the public banner does at a beat, held a moment and faded. Each new call shows afresh and is read
// out; the same call held on (the slam still shown) shows once.
import { motionReduced } from '../plus/kit.ts';
import { announce } from '../ui/announce.ts';
import { cubicBezier } from '../ui/ease.ts';
import type { Node } from '../ui/node.ts';

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
    this.last = call;
  }

  /** Whether the call stands this frame. */
  get shown(): boolean {
    return this.words !== null && this.since < CALL_S;
  }

  /** The call at `zoom`, its top `top` CSS pixels down the view and centred across it; none once its moment is over. */
  node(top: number, zoom: number): Node | null {
    if (!this.shown || !this.words) return null;
    const still = motionReduced();
    const slid = still ? 1 : cubicBezier(0.2, 0.8, 0.3, 1, Math.min(1, this.since / SLIDE_S));
    const fading = Math.min(1, Math.max(0, (CALL_S - this.since) / FADE_S));
    return {
      id: 'fight-call',
      padding: [6 * zoom, 18 * zoom],
      fill: RED,
      outline: { width: 2 * zoom, colour: EDGE },
      opacity: slid * fading,
      offset: [0, Math.round(-12 * zoom * (1 - slid))],
      float: { to: 'screen', at: [0.5, 0], anchor: [0.5, 0], y: Math.round(top), z: 1 },
      children: [{ text: { words: this.words, size: 3 * zoom, colour: EDGE, wrap: false } }],
    };
  }
}
