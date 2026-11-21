// The Test Ground's page as the interface draws it: the canvas's events heard each frame (the canvas sized to the page
// first), its layers drawn over the whole canvas, and what it types in and the pointer's look handed back to the page.
// The view between the panels is the world's: a click there locks the pointer. The pointer wears the gauntlet, as in
// the game.
import { canvasSize } from '../canvasSize.ts';
import type { Gpu } from '../gpu.ts';
import { CanvasEvents } from '../ui/canvasEvents.ts';
import { gauntletOver } from '../ui/gauntlet.ts';
import { Stack } from '../ui/stack.ts';
import type { Face } from '../ui/text.ts';
import { Interface } from '../ui/ui.ts';
import { UiRenderer, uiScale } from '../ui/uiRenderer.ts';

export class PagePanels {
  readonly stack = new Stack();
  /** Seconds since the frame before, as last heard. */
  seconds = 0;
  private ui: Interface | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly events: CanvasEvents;
  private readonly locked: () => boolean;
  private heardAt = performance.now();
  /** Whether the pointer last went down on a panel, so a drag let go over the view is not a click on it. */
  private downOnPanel = false;

  /** Hears `canvas` once `face` is read; `locked` says whether the pointer is locked to look round. */
  constructor(gpu: Gpu, canvas: HTMLCanvasElement, face: Promise<Face>, locked: () => boolean) {
    this.canvas = canvas;
    this.locked = locked;
    this.events = new CanvasEvents(canvas);
    canvas.addEventListener('pointerdown', (event) => (this.downOnPanel = this.takes(event.offsetX, event.offsetY)));
    face.then((read) => (this.ui = new Interface(new UiRenderer(gpu, read)))).catch(() => undefined);
  }

  /** Whether the keys are the panels': words are typed in a field, or the pointer is free and a control has focus. */
  get takesKeys(): boolean {
    return Boolean(this.ui?.typing || (!this.locked() && this.ui?.focusedId));
  }

  /** Whether the panels, as last laid, take the pointer at `x`, `y` (CSS pixels on the canvas). */
  takes(x: number, y: number): boolean {
    return Boolean(this.ui?.takes(x, y));
  }

  /** Whether `click` is the world's: pressed and let go on the view, not on a panel. */
  onView(click: MouseEvent): boolean {
    return !this.downOnPanel && !this.takes(click.offsetX, click.offsetY);
  }

  /** Sizes the canvas to the page and hears the events since the last frame; answers whether a panel took the wheel. */
  hear(): boolean {
    const { canvas } = this;
    const now = performance.now();
    this.seconds = Math.min(0.1, (now - this.heardAt) / 1000);
    this.heardAt = now;
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio);
    if (canvas.width !== size.width || canvas.height !== size.height) Object.assign(canvas, size);
    const free = !this.locked();
    const ratio = devicePixelRatio;
    const view = { width: canvas.width, height: canvas.height, scale: uiScale(ratio), ratio };
    this.ui?.frame(view, this.events.take(), this.seconds, free, free);
    return Boolean(this.ui?.tookWheel);
  }

  /** Draws the layers over the canvas. */
  draw(): void {
    const { ui } = this;
    if (!ui) return;
    ui.draw(this.stack.node(ui));
    ui.renderer.present(this.canvas.width, this.canvas.height);
    this.events.sync(ui.typing, gauntletOver(ui.cursor));
  }
}
