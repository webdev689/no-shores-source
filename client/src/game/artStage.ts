// The Art's scene on the Art's screen (`artScenes.ts`), as a live picture the interface draws behind the screen's
// rows: one stage kept for the screen however often its page is built anew, so the scene's still cells are worked out
// only when the Art or the screen's size changes, and its clock runs on unbroken. Each frame asks it for the step the
// clock is at; it paints a new one only as the step changes, a few times a second. Each cell is a whole square of CSS
// pixels, however the screen is scaled.

import type { GlowElement } from '../elementGlow.ts';
import type { Picture } from '../ui/node.ts';
import type { Art } from './artsCards.ts';
import { type Scene, paintScene, sceneFrame, sceneOf, sceneStep } from './artScenes.ts';

/** The scene's middle stands in the room right of the screen's rows, but never past these shares of its width. */
const FOCUS_LEAST = 0.6;
const FOCUS_MOST = 0.86;

/** Where the scene's middle stands across `cols` cells, for a stage `width` pixels wide whose rows end `free` pixels
 *  from its left (null before they are laid). */
export function focusOf(cols: number, width: number, free: number | null): number {
  const share = free === null ? FOCUS_LEAST : (free + width) / 2 / width;
  return Math.min(FOCUS_MOST, Math.max(FOCUS_LEAST, share)) * cols;
}

class Stage {
  private sized = '';
  private scene: Scene | null = null;
  private element = 1 as GlowElement;
  private shown = -1;
  private version = 0;
  private tones = new Uint8Array(0);
  private canvas: OffscreenCanvas | null = null;
  private pixels: ImageData | null = null;

  /** The scene of `art` at `cols` by `rows` cells, its middle at `focus`, at `step`: worked out again only for a new
   *  Art or size, painted again only for a new step. Null where nothing can be painted (no canvas off the page). */
  picture(art: Art, cols: number, rows: number, focus: number, step: number): Picture | null {
    if (typeof OffscreenCanvas === 'undefined' || cols < 1 || rows < 1) return null;
    const sized = `${art.key} ${cols} ${rows} ${Math.round(focus)}`;
    if (sized !== this.sized) {
      this.sized = sized;
      this.scene = sceneOf(art.key, cols, rows, focus);
      this.element = art.element as GlowElement;
      this.tones = new Uint8Array(cols * rows);
      this.canvas = new OffscreenCanvas(cols, rows);
      this.pixels = new ImageData(cols, rows);
      this.shown = -1;
    }
    const { scene, canvas, pixels } = this;
    if (!scene || !canvas || !pixels) return null;
    if (step !== this.shown) {
      this.shown = step;
      paintScene(sceneFrame(scene, step, this.tones), this.element, pixels.data);
      canvas.getContext('2d')?.putImageData(pixels, 0, 0);
      this.version++;
    }
    return {
      key: `arts stage ${sized}`,
      source: { image: canvas, version: this.version },
      pixel: { width: cols, height: rows },
    };
  }
}

const stage = new Stage();

/** The scene of `art` behind its screen, `cols` by `rows` cells with its middle at `focus`, at `millis` on the clock
 *  (still where less motion is asked for). */
export function artStage(
  art: Art,
  cols: number,
  rows: number,
  focus: number,
  millis: number,
  still: boolean,
): Picture | null {
  return stage.picture(art, cols, rows, focus, sceneStep(millis, still));
}
