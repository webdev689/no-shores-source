// The interface the game draws itself (`ui/`), as the game's frame runs it: its face read as the page starts (until
// then it draws nothing), the canvas's events heard each frame, its tree drawn over the frame, and what it is typing
// in handed back to the page.
import type { Gpu } from '../gpu.ts';
import { CanvasEvents } from '../ui/canvasEvents.ts';
import { readFace } from '../ui/faceReader.ts';
import type { Stack } from '../ui/stack.ts';
import { Interface } from '../ui/ui.ts';
import { UiRenderer, uiScale } from '../ui/uiRenderer.ts';
import type { Besides } from './hud.ts';
import { drawnPress, drawnReach } from './uiSounds.ts';

/** What of the page's own pieces under `root` holds the screen now, which the drawn display gives way to: the fight's
 *  display and its boss's bar, and the dialogue box. */
export function besidesIn(root: ParentNode): Besides {
  const shown = (what: string) => root.querySelector(`:scope > ${what}:not([hidden])`) !== null;
  return { fight: shown('.fight'), bossed: shown('.fight.bossed'), speaking: shown('.speech-box') };
}

export class DrawnInterface {
  private ui: Interface | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly events: CanvasEvents;
  /** When this frame's input was heard, so a press sounds unless its own sound played since. */
  private heardAt = 0;

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

  private get view() {
    return { width: this.canvas.width, height: this.canvas.height, scale: uiScale(devicePixelRatio) };
  }
}
