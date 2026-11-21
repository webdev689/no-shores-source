// The page's side of the interface's input: what the pointer, wheel, keys, pad and typing do on the canvas, gathered
// as plain events (`ui.ts`) for the interface to hear each frame, wherever it runs. Typing goes through the browser's
// `EditContext` where it has one (Chromium), so composition and its keyboards work on the canvas; elsewhere through
// keys and paste. What the interface is typing in is handed back each frame (`sync`), so the browser's typing starts
// from the same words, caret and place.
import type { Typing, UiEvent } from './ui.ts';

type PadButton = 'up' | 'down' | 'left' | 'right' | 'accept' | 'back';

/** The standard pad's buttons: the cross and A, B. */
const PAD: readonly (readonly [number, PadButton])[] = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
  [0, 'accept'],
  [1, 'back'],
];
/** A held pad button acts again after this long, then this often, seconds. */
const PAD_DELAY = 0.4;
const PAD_REPEAT = 0.12;

/** Chromium's `EditContext`, which TypeScript's DOM types do not yet declare. */
interface EditContextLike extends EventTarget {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  updateText(start: number, end: number, text: string): void;
  updateSelection(start: number, end: number): void;
  updateControlBounds(bounds: DOMRect): void;
  updateSelectionBounds(bounds: DOMRect): void;
}
interface TextUpdate extends Event {
  readonly updateRangeStart: number;
  readonly updateRangeEnd: number;
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}
type EditingCanvas = HTMLCanvasElement & { editContext: EditContextLike | null };

/** What the interface hears the page's input through: on the page, its own listeners on the canvas (`CanvasEvents`);
 *  in the game's worker, what the page sends it. */
export interface PageEvents {
  /** Where the pointer is on the canvas now, CSS pixels; null off it or locked. */
  readonly pointer: { readonly x: number; readonly y: number } | null;
  /** The events since the last call. */
  take(): UiEvent[];
  /** Hands the page what the interface is typing in, and the pointer's look. */
  sync(typing: Typing | null, cursor: string): void;
}

/** The page's input as the game's worker hears it, once it is put in place there. */
let away: PageEvents | null = null;

/** Puts in place how the interface hears the page's input in a worker, where no page's listeners are. */
export function hearFromAway(events: PageEvents): void {
  away = events;
}

/** How the interface hears the page's input on `canvas`: its own listeners, or the worker's as put in place. */
export const eventsOn = (canvas: HTMLCanvasElement): PageEvents => away ?? new CanvasEvents(canvas);

export class CanvasEvents implements PageEvents {
  private readonly canvas: EditingCanvas;
  private events: UiEvent[] = [];
  /** Where the pointer is on the canvas now, CSS pixels, as its last event put it; null off it or locked. */
  pointer: { readonly x: number; readonly y: number } | null = null;
  private readonly context: EditContextLike | null;
  private typing: Typing | null = null;
  private readonly padHeld = new Map<PadButton, number>();
  private last = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas as EditingCanvas;
    // Focusable, so typing and keys can be the canvas's own.
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;
    const Context = (globalThis as { EditContext?: new () => EditContextLike }).EditContext;
    this.context = Context ? new Context() : null;
    const placed = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const locked = () => document.pointerLockElement === canvas;
    // Heard as the pointer goes down to the canvas, before the world's own handlers there, which may stop it.
    const first = { capture: true };
    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (!locked()) this.events.push({ kind: 'pointer', ...(this.pointer = placed(event)) });
      },
      first,
    );
    canvas.addEventListener('pointerleave', () => {
      this.pointer = null;
      this.events.push({ kind: 'leave' });
    });
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (!locked()) this.events.push({ kind: 'down', ...(this.pointer = placed(event)), button: event.button });
      },
      first,
    );
    addEventListener(
      'pointerup',
      (event) => {
        if (!locked()) this.events.push({ kind: 'up', ...placed(event), button: event.button });
      },
      first,
    );
    canvas.addEventListener('wheel', (event) => {
      if (!locked()) this.events.push({ kind: 'wheel', ...placed(event), dy: event.deltaY });
    });
    addEventListener(
      'keydown',
      (event) => {
        const typingHere = this.typing !== null;
        const ctrl = event.ctrlKey || event.metaKey;
        // Keys the browser's typing does itself; and, without it, a character typed is words.
        const typed =
          typingHere && this.context !== null && (event.key.length === 1 || /^(Backspace|Delete)$/.test(event.key));
        this.events.push({ kind: 'key', key: event.key, shift: event.shiftKey, ctrl, typed });
        if (typingHere && !this.context && event.key.length === 1 && !ctrl)
          this.events.push({ kind: 'text', text: event.key });
        if (typingHere && (event.key === 'Tab' || event.key === 'Backspace' || event.key === ' '))
          event.preventDefault();
        // Heard before any page's own listener, so one that keeps a key from the game keeps it from no drawn screen.
      },
      true,
    );
    addEventListener('paste', (event) => {
      const text = event.clipboardData?.getData('text/plain');
      if (this.typing && text) {
        this.events.push({ kind: 'text', text: text.replace(/[\r\n]+/g, ' ') });
        event.preventDefault();
      }
    });
    for (const kind of ['copy', 'cut'] as const)
      addEventListener(kind, (event) => {
        const typing = this.typing;
        if (!typing || typing.secret) return;
        const { text, caret, anchor } = typing.state;
        event.clipboardData?.setData('text/plain', text.slice(Math.min(caret, anchor), Math.max(caret, anchor)));
        event.preventDefault();
        if (kind === 'cut') this.events.push({ kind: 'text', text: '' });
      });
    this.context?.addEventListener('textupdate', (event) => {
      const update = event as TextUpdate;
      // A field is one line: a newline the browser types is Enter.
      const text = update.text.replace(/[\r\n]+/g, '');
      this.events.push({
        kind: 'edit',
        from: update.updateRangeStart,
        to: update.updateRangeEnd,
        text,
        caret: update.selectionEnd - (update.text.length - text.length),
        anchor: update.selectionStart - (update.text.length - text.length),
      });
      if (text !== update.text) this.events.push({ kind: 'key', key: 'Enter' });
    });
  }

  /** Whether words are being typed into the interface, so the keys are the browser's typing's. */
  get typingHere(): boolean {
    return this.typing !== null;
  }

  /** The events since the last call, with the pad's presses read now. */
  take(): UiEvent[] {
    const now = performance.now();
    const seconds = (now - this.last) / 1000;
    this.last = now;
    this.readPad(seconds);
    const taken = this.events;
    this.events = [];
    return taken;
  }

  /** Hands the page what the interface is typing in, the pointer's look, and where on the page the canvas is. */
  sync(typing: Typing | null, cursor: string): void {
    this.typing = typing;
    if (document.pointerLockElement !== this.canvas && this.canvas.style.cursor !== cursor)
      this.canvas.style.cursor = cursor;
    const context = this.context;
    if (!context) return;
    if (!typing) {
      if (this.canvas.editContext) this.canvas.editContext = null;
      return;
    }
    if (this.canvas.editContext !== context) {
      this.canvas.editContext = context;
      this.canvas.focus();
    }
    const { text, caret, anchor } = typing.state;
    if (context.text !== text) context.updateText(0, context.text.length, text);
    if (context.selectionStart !== anchor || context.selectionEnd !== caret) context.updateSelection(anchor, caret);
    const rect = this.canvas.getBoundingClientRect();
    const box = new DOMRect(rect.left + typing.box.x, rect.top + typing.box.y, typing.box.width, typing.box.height);
    context.updateControlBounds(box);
    context.updateSelectionBounds(box);
  }

  private readPad(seconds: number): void {
    const pad = typeof navigator.getGamepads === 'function' ? navigator.getGamepads().find((each) => each) : null;
    for (const [index, button] of PAD) {
      const down = Boolean(pad?.buttons[index]?.pressed);
      const held = this.padHeld.get(button);
      if (!down) {
        this.padHeld.delete(button);
        continue;
      }
      if (held === undefined) {
        this.events.push({ kind: 'pad', button });
        this.padHeld.set(button, -PAD_DELAY);
      } else if (held + seconds >= PAD_REPEAT && button !== 'accept' && button !== 'back') {
        this.events.push({ kind: 'pad', button });
        this.padHeld.set(button, 0);
      } else this.padHeld.set(button, held + seconds);
    }
  }
}
