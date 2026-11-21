// The World Editor's one canvas, frame by frame: the view of the mode open (the coasts' map, or the land in 2D or
// 3D) drawn into the room right of the panel, the marks over it (`markPass.ts`), then the interface the game draws:
// the names and plates over the view and the panel at the left. A frame is drawn when something asks for one (an
// input on the canvas, a change, the water moving), never for nothing.
import { canvasSize } from '../canvasSize.ts';
import { type Gpu, TEXTURE_USAGE } from '../gpu.ts';
import { CanvasEvents } from '../ui/canvasEvents.ts';
import { readFace } from '../ui/faceReader.ts';
import { stopped } from '../ui/page.ts';
import type { Child } from '../ui/node.ts';
import { Interface } from '../ui/ui.ts';
import { UiRenderer, uiScale } from '../ui/uiRenderer.ts';
import { MarkPass } from './markPass.ts';
import { editorRoot, inwardAt, PANEL_WIDTH, panelCss, settleTyping } from './panelKit.ts';
import type { Ink } from './strokes.ts';

/** A frame as the mode open draws it. */
export interface EditorFrameView {
  readonly ui: Interface;
  /** The canvas in device pixels, and device pixels a CSS pixel. */
  readonly size: { readonly width: number; readonly height: number };
  readonly scale: number;
  /** The view right of the panel in CSS pixels, and in device pixels from the canvas's left edge. */
  readonly flat: { readonly width: number; readonly height: number };
  readonly left: number;
  /** The interface's pixels a CSS pixel. */
  readonly inward: number;
  /** What the canvas shows this frame. */
  readonly texture: GPUTexture;
}

/** What the mode open drew and lays over its view: the marks, the nodes over the view (names, plates), the panel's
 *  own nodes, and whether it wants another frame at once (the water moves). */
export interface EditorDrawn {
  readonly inks: readonly Ink[];
  readonly over: readonly Child[];
  readonly panel: readonly Child[];
  readonly again?: boolean;
  /** The pointer's look over the view, where the interface does not take it. */
  readonly cursor?: string;
}

export class EditorFrame {
  readonly canvas: HTMLCanvasElement;
  readonly gpu: Gpu;
  private ui: Interface | null = null;
  private readonly events: CanvasEvents;
  private readonly marks: MarkPass;
  private queued = false;
  private asideTexture: GPUTexture | null = null;
  private last = performance.now();
  /** Draws the mode open this frame. */
  draw: (frame: EditorFrameView) => EditorDrawn = () => ({ inks: [], over: [], panel: [] });
  /** Whether the panel takes the keys now: not while they walk or sail. */
  keys: () => boolean = () => true;

  constructor(canvas: HTMLCanvasElement, gpu: Gpu) {
    this.canvas = canvas;
    this.gpu = gpu;
    this.events = new CanvasEvents(canvas);
    this.marks = new MarkPass(gpu);
    readFace()
      .then((face) => {
        this.ui = new Interface(new UiRenderer(gpu, face));
        this.request();
      })
      .catch((error: unknown) => {
        // Nothing can be drawn without the face: the page says why, as it does when the GPU will not start.
        stopped(`The editor's face could not be read: ${String(error)}`);
      });
    const asked = () => this.request();
    for (const kind of ['pointermove', 'pointerdown', 'pointerup', 'pointerleave', 'wheel'] as const)
      canvas.addEventListener(kind, asked);
    for (const kind of ['keydown', 'keyup', 'paste'] as const) addEventListener(kind, asked);
    new ResizeObserver(asked).observe(canvas);
  }

  /** Whether the interface takes the pointer at `x`, `y` (CSS pixels of the canvas), as it was last laid: a press there
   *  is the panel's, not the view's. */
  takes(x: number, y: number): boolean {
    return x < panelCss(devicePixelRatio || 1) || Boolean(this.ui?.takes(x, y));
  }

  /** Whether words are being typed into a field of the panel, so the keys are not the view's. */
  get typing(): boolean {
    return Boolean(this.ui?.typing);
  }

  /** Hands what is being typed in a field of the panel to it now and takes the focus from it, as a page's field
   *  reports its value as a press elsewhere takes the focus. */
  settle(): void {
    if (this.ui) settleTyping(this.ui);
  }

  /** Draws a picture of the view's size aside with `draw`, then copies it into the canvas right of the panel, for a
   *  view that draws through targets of its own (the land in 3D); answers what `draw` answers. */
  aside<Drawn>(
    frame: EditorFrameView,
    draw: (target: GPUTextureView, size: { width: number; height: number }) => Drawn,
  ): Drawn {
    const size = { width: Math.max(1, frame.size.width - frame.left), height: frame.size.height };
    let aside = this.asideTexture;
    if (aside?.width !== size.width || aside.height !== size.height) {
      aside?.destroy();
      aside = this.asideTexture = this.gpu.device.createTexture({
        size: [size.width, size.height],
        format: this.gpu.format,
        usage: TEXTURE_USAGE.renderAttachment | TEXTURE_USAGE.copySource,
      });
    }
    const drawn = draw(aside.createView(), size);
    const copy = this.gpu.device.createCommandEncoder();
    copy.copyTextureToTexture({ texture: aside }, { texture: frame.texture, origin: [frame.left, 0] }, [
      size.width,
      size.height,
    ]);
    this.gpu.device.queue.submit([copy.finish()]);
    return drawn;
  }

  /** Asks for a frame. */
  request(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.queued = false;
    const ui = this.ui;
    if (!ui) return;
    const { canvas } = this;
    const size = canvasSize(canvas.clientWidth, canvas.clientHeight, devicePixelRatio || 1);
    if (canvas.width !== size.width || canvas.height !== size.height)
      [canvas.width, canvas.height] = [size.width, size.height];
    const now = performance.now();
    const seconds = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const ratio = devicePixelRatio || 1;
    const view = { width: size.width, height: size.height, scale: uiScale(ratio), ratio };
    ui.frame(view, this.events.take(), seconds, true, this.keys());
    const scale = size.width / Math.max(1, canvas.clientWidth);
    const texture = this.gpu.context.getCurrentTexture();
    const drawn = this.draw({
      ui,
      size,
      scale,
      flat: { width: Math.max(1, canvas.clientWidth - panelCss(ratio)), height: Math.max(1, canvas.clientHeight) },
      left: PANEL_WIDTH * uiScale(ratio),
      inward: inwardAt(ratio),
      texture,
    });
    this.marks.draw(texture.createView(), drawn.inks, { ...size, scale, left: panelCss(ratio) });
    ui.draw(editorRoot(drawn));
    ui.renderer.present(size.width, size.height);
    const pointer = this.events.pointer;
    const overView = drawn.cursor && ui.cursor === 'default' && pointer && !this.takes(pointer.x, pointer.y);
    this.events.sync(ui.typing, overView ? drawn.cursor : ui.cursor);
    // A press may change what the panel shows; a field's caret blinks; the water moves.
    if (ui.pressed || ui.typing || drawn.again) this.request();
  }
}
