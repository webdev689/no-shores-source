// The interface the game draws itself (`ui/`), as the game's frame runs it: its face read as the page starts (until
// then it draws nothing), the canvas's events heard each frame, its tree drawn over the frame, and what it is typing
// in handed back to the page.
import type { Gpu } from '../gpu.ts';
import { CanvasEvents } from '../ui/canvasEvents.ts';
import { readFace } from '../ui/faceReader.ts';
import type { Stack } from '../ui/stack.ts';
import { Interface } from '../ui/ui.ts';
import { UiRenderer, uiScale } from '../ui/uiRenderer.ts';
import { drawnPress, drawnReach } from './uiSounds.ts';

export class DrawnInterface {
  private ui: Interface | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly events: CanvasEvents;
  /** When this frame's input was heard, so a press sounds unless its own sound played since. */
  private heardAt = 0;
  /** Whether the game's own frames have begun, which end the interface's frames alone. */
  private framing = false;

  /** With `stack`, draws it alone each frame (the tap to start, while the world loads) until the game's frames
   *  begin hearing it. */
  constructor(gpu: Gpu, canvas: HTMLCanvasElement, stack?: Stack) {
    this.canvas = canvas;
    this.events = new CanvasEvents(canvas);
    if (stack) this.alone(stack, performance.now());
    readFace()
      .then((face) => (this.ui = new Interface(new UiRenderer(gpu, face))))
      .catch((error: unknown) => console.error('the face could not be read:', error));
  }

  /** Whether words are being typed into it, so keys are not the game's. */
  get typing(): boolean {
    return Boolean(this.ui?.typing);
  }

  /** Whether the pointer is over it now, so a click is not the world's: where the page last heard the pointer, as the
   *  click is heard before the interface's next frame takes it. */
  get takesPointer(): boolean {
    const pointer = this.events.pointer;
    return Boolean(pointer && this.ui?.takes(pointer.x, pointer.y));
  }

  /** Hears the events since the last frame, `seconds` ago; with the pointer `free` it can be pressed, and with `keys`
   *  (a menu up) it takes the keys and the pad. Answers whether it took the wheel. */
  hear(seconds: number, free: boolean, keys: boolean): boolean {
    this.framing = true;
    const taken = this.events.take();
    this.heardAt = performance.now();
    this.ui?.frame(this.view, taken, seconds, free, keys);
    return Boolean(this.ui?.tookWheel);
  }

  /** Draws `stack`'s layers over the frame. */
  present(stack: Stack): void {
    const ui = this.ui;
    if (!ui) return;
    const view = this.view;
    ui.draw(stack.node(ui));
    // As a page's presses sound: a tick as a control is reached, the press unless what it did sounded already.
    if (ui.reached) drawnReach();
    if (ui.pressed) drawnPress(this.heardAt);
    ui.renderer.present(view.width, view.height);
    this.events.sync(ui.typing, ui.cursor);
  }

  /** A frame of `stack` alone, before the game's own frames, and the next asked for. */
  private alone(stack: Stack, before: number): void {
    requestAnimationFrame((now) => {
      if (this.framing) return;
      this.ui?.frame(this.view, this.events.take(), Math.min(0.1, (now - before) / 1000));
      this.present(stack);
      this.alone(stack, now);
    });
  }

  private get view() {
    return { width: this.canvas.width, height: this.canvas.height, scale: uiScale(devicePixelRatio) };
  }
}
