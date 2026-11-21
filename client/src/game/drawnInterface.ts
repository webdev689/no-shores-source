// The interface the game draws itself (`ui/`), as the game's frame runs it: its face read as the page starts (until
// then it draws nothing), the canvas's events heard each frame, its tree drawn over the frame, and what it is typing
// in handed back to the page.
import type { Gpu } from '../gpu.ts';
import { CanvasEvents } from '../ui/canvasEvents.ts';
import { readFace } from '../ui/faceReader.ts';
import { Interface } from '../ui/ui.ts';
import { UiRenderer, uiScale } from '../ui/uiRenderer.ts';

export class DrawnInterface {
  private ui: Interface | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly events: CanvasEvents;

  constructor(gpu: Gpu, canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.events = new CanvasEvents(canvas);
    readFace()
      .then((face) => (this.ui = new Interface(new UiRenderer(gpu, face))))
      .catch((error: unknown) => console.error('the face could not be read:', error));
  }

  /** Whether words are being typed into it, so keys are not the game's. */
  get typing(): boolean {
    return Boolean(this.ui?.typing);
  }

  /** Whether the pointer is over it, so a click is not the world's. */
  get takesPointer(): boolean {
    return Boolean(this.ui?.takesPointer);
  }

  /** Hears the events since the last frame, `seconds` ago; with the pointer `free` it can be pressed, and with `keys`
   *  (a menu up) it takes the keys and the pad. Answers whether it took the wheel. */
  hear(seconds: number, free: boolean, keys: boolean): boolean {
    const taken = this.events.take();
    this.ui?.frame(this.view, taken, seconds, free, keys);
    return Boolean(this.ui?.tookWheel);
  }

  /** Builds its tree with `draw` and draws it over the frame. */
  present(draw: (ui: Interface, view: { width: number; height: number; scale: number }) => void): void {
    const ui = this.ui;
    if (!ui) return;
    const view = this.view;
    draw(ui, view);
    ui.renderer.present(view.width, view.height);
    this.events.sync(ui.typing, ui.cursor);
  }

  private get view() {
    return { width: this.canvas.width, height: this.canvas.height, scale: uiScale(devicePixelRatio) };
  }
}
