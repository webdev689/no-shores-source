// The Art's scene on the Art's screen (`artScenes.ts`): one canvas kept for the screen however often its page is built
// anew, so the scene's still cells are worked out only when the Art or the screen's size changes, and its clock runs
// on unbroken. It steps a few times a second while it is on the page and stops once it is not. Each cell is a whole
// square of CSS pixels, whatever the menu's zoom.

import { make } from '../editor/dom.ts';
import type { GlowElement } from '../elementGlow.ts';
import { motionReduced } from '../plus/kit.ts';
import type { Art } from './artsCards.ts';
import { type Scene, SCENE_STEP_MS, paintScene, sceneFrame, sceneOf, sceneStep } from './artScenes.ts';
import { cssZoom } from './gearDom.ts';

/** The scene's middle stands in the room right of the screen's rows, but never past these shares of its width. */
const FOCUS_LEAST = 0.6;
const FOCUS_MOST = 0.86;

class Stage {
  readonly root = make('div', '', 'arts-stage');
  private readonly canvas = make('canvas', '', 'arts-stage-canvas');
  private art: Art | null = null;
  private scene: Scene | null = null;
  private sized = '';
  private shown = -1;
  private timer = 0;
  private tones = new Uint8Array(0);
  private pixels: ImageData | null = null;

  constructor() {
    this.root.setAttribute('aria-hidden', 'true');
    this.root.append(this.canvas);
    new ResizeObserver(() => this.fit()).observe(this.root);
  }

  /** Shows `art`'s scene, worked out again only for a new Art. */
  wear(art: Art): void {
    if (art.key !== this.art?.key) [this.art, this.sized] = [art, ''];
    this.fit();
    this.timer ||= window.setInterval(() => this.tick(), SCENE_STEP_MS / 2);
  }

  /** Works the scene out again for the room the screen gives it, once it stands on the page. */
  private fit(): void {
    const { art, root } = this;
    const box = root.getBoundingClientRect();
    const zoom = cssZoom(root);
    const cell = Number(getComputedStyle(root).getPropertyValue('--stage-cell')) || 4;
    const [width, height] = [box.width / zoom, box.height / zoom];
    if (!art || width < cell || height < cell) return;
    const [cols, rows] = [Math.ceil(width / cell), Math.ceil(height / cell)];
    // The scene's middle in the room right of the rows of tiles, measured where they stand.
    const line = root.parentElement?.querySelector('.arts-line')?.getBoundingClientRect();
    const free = line ? (line.right - box.left) / zoom : width * FOCUS_LEAST;
    const focus = Math.min(FOCUS_MOST, Math.max(FOCUS_LEAST, (free + width) / 2 / width)) * cols;
    const sized = JSON.stringify([art.key, cols, rows, Math.round(focus)]);
    if (sized === this.sized) return;
    this.sized = sized;
    this.scene = sceneOf(art.key, cols, rows, focus);
    [this.canvas.width, this.canvas.height] = [cols, rows];
    this.canvas.style.width = `${cols * cell}px`;
    this.canvas.style.height = `${rows * cell}px`;
    this.tones = new Uint8Array(cols * rows);
    this.pixels = new ImageData(cols, rows);
    this.shown = -1;
    this.draw();
  }

  private tick(): void {
    if (this.root.isConnected) return this.draw();
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  private draw(): void {
    const { scene, pixels, art } = this;
    const step = sceneStep(performance.now(), motionReduced());
    if (!scene || !pixels || !art || step === this.shown) return;
    this.shown = step;
    paintScene(sceneFrame(scene, step, this.tones), art.element as GlowElement, pixels.data);
    this.canvas.getContext('2d')?.putImageData(pixels, 0, 0);
  }
}

let stage: Stage | null = null;

/** The scene of `art` to stand behind its screen: the one canvas, kept from page to page. */
export function artStage(art: Art): HTMLElement {
  stage ??= new Stage();
  stage.wear(art);
  return stage.root;
}
