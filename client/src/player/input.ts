import { BIND_IDS, type BindId, type Binds, CONTROLS, type Context, DEFAULTS, type Device } from './binds.ts';
import { NO_PAD, PadReader, type PadFrame, type PadState, type Waits, padInputs, padOf } from './pad.ts';

/** A control the player binds (`binds.ts`). */
export type Action = BindId;

/** The binds the game hears now, who hears them change, which of the keyboard and the pad was used last, and whether
 *  a ranged weapon turns the pad's triggers round. */
export class LiveBinds {
  private binds: Binds = DEFAULTS;
  private readonly heard = new Set<(binds: Binds, kept: boolean) => void>();
  /** The keys and mouse, or the pad: whichever the player used last, whose keys the strip and the sheet show. */
  device: Device = 'keys';
  /** Whether a ranged weapon is drawn on foot, which turns the pad's triggers round: RT fires and LT aims. Every
   *  fight on foot says so each frame (`PlayerFight`). */
  ranged = false;

  get now(): Binds {
    return this.binds;
  }

  /** Binds `binds`; `kept` where they came from where they are kept, so they need not be kept again. */
  set(binds: Binds, kept = false): void {
    this.binds = binds;
    for (const listener of this.heard) listener(binds, kept);
  }

  onChange(listener: (binds: Binds, kept: boolean) => void): void {
    this.heard.add(listener);
  }

  /** What the pad waits to tell apart in `context` (anywhere, without one): each button with a hold bound there, and
   *  each two bound together, so a button with no hold bound where the player is acts as it goes down. */
  waits(context?: Context): Waits {
    const here = BIND_IDS.filter((id) => context === undefined || CONTROLS[id].where.includes(context));
    const names = here.flatMap((id) => this.binds[id].pad);
    const holds = new Set(names.filter((name) => name.endsWith(' hold')).map((name) => name.slice(0, -' hold'.length)));
    const chords = names.filter((name) => name.includes('+')).map((name) => name.split('+') as [string, string]);
    return { holds, chords };
  }
}

/** The binds of the page: one game, one player. */
export const BINDS = new LiveBinds();

/** Whether the player's hands fight this frame: with the pointer locked, or with the pad last used and nothing paused,
 *  since a pad button cannot lock the pointer again; a click on a free pointer only locks it. */
export const handsFree = (controls: InputFrame, paused: boolean): boolean =>
  controls.locked || (!paused && BINDS.device === 'pad');

/** One frame's input: what is held, what was pressed or let go since the last frame, how far it is pressed (a
 *  stick's lean; 1 for a key held), how far the mouse moved while the pointer was locked, and the wheel's notches
 *  (positive pulled back). */
export interface InputFrame {
  held(action: Action): boolean;
  pressed(action: Action): boolean;
  released(action: Action): boolean;
  amount?(action: Action): number;
  readonly lookX: number;
  readonly lookY: number;
  readonly wheel: number;
  readonly locked: boolean;
}

/** `frame` with `id`'s press its alone: no control that shares a key or a button with it is pressed. */
export function pressTakenBy(frame: InputFrame, id: Action, binds: Binds = BINDS.now): InputFrame {
  const taken = new Set([...binds[id].keys, ...binds[id].pad]);
  const shares = (action: Action) => [...binds[action].keys, ...binds[action].pad].some((name) => taken.has(name));
  return { ...frame, pressed: (action) => !shares(action) && frame.pressed(action) };
}

/** How far `plus` is pressed against `minus`, -1 to 1: a stick's lean, or a key's whole way. */
export function axis(input: InputFrame, minus: Action, plus: Action): number {
  const level = (action: Action) => input.amount?.(action) ?? Number(input.held(action));
  return Math.max(-1, Math.min(1, level(plus) - level(minus)));
}

/** A frame with nothing pressed: what the body is stepped by while a menu is open, so the world goes on. */
export const IDLE: InputFrame = {
  held: () => false,
  pressed: () => false,
  released: () => false,
  lookX: 0,
  lookY: 0,
  wheel: 0,
  locked: true,
};

/** The pads the page sees, where it has the Gamepad API. */
const padsNow = (): readonly (PadState | null)[] =>
  typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];

/** Listens to the keyboard, the mouse and the wheel on a canvas, and reads the pad each frame; `frame()` hands over
 *  each frame's input. Clicking the canvas locks the pointer to look round; Escape lets it go. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedSince = new Set<string>();
  private readonly releasedSince = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private wheel = 0;
  private readonly canvas: HTMLCanvasElement;
  private readonly pad = new PadReader();
  private last = performance.now();
  /** The window over the game, by name, or null for none. */
  private windowUp: string | null = null;
  /** Whether the pad's run is on: clicked, it runs until the stick comes to rest. */
  private running = false;
  /** What the pad's buttons acted as when a window took them, let go at the next frame. */
  private letGo = new Set<string>();
  private readonly padHeard = new Set<(pressed: ReadonlySet<Action>, buttons: ReadonlySet<string>) => void>();
  /** Where the player is, whose binds say which of the pad's buttons wait to be told a tap from a hold. */
  context: Context = 'foot';
  /** The pad's part of the last frame alone, for what hears the keys as they come and the pad each frame. */
  padAlone: InputFrame = IDLE;

  /** Listens on `canvas`; while `typing` says words are being typed into the interface, keys are not the game's. */
  constructor(canvas: HTMLCanvasElement, typing: () => boolean = () => false) {
    this.canvas = canvas;
    const press = (name: string) => {
      if (!this.down.has(name)) this.pressedSince.add(name);
      this.down.add(name);
      BINDS.device = 'keys';
    };
    const release = (name: string) => {
      this.down.delete(name);
      this.releasedSince.add(name);
    };
    addEventListener('keydown', (event) => {
      const name = keyNameOf(event);
      if (event.code) wentDown.set(event.code, name);
      if (typing()) return;
      press(name);
      if (this.locked && event.key === ' ') event.preventDefault();
    });
    addEventListener('keyup', (event) => release(keyUpNameOf(event)));
    addEventListener('blur', () => {
      this.down.clear();
      wentDown.clear();
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('mousedown', (event) => {
      if (!this.locked) return;
      event.preventDefault();
      press(`mouse${event.button}`);
    });
    // A side button's own work (back, forward) is done on its release and its click, so those are kept too.
    addEventListener('mouseup', (event) => {
      if (this.locked) event.preventDefault();
      release(`mouse${event.button}`);
    });
    addEventListener('auxclick', (event) => {
      if (this.locked) event.preventDefault();
    });
    addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.lookX += event.movementX;
      this.lookY += event.movementY;
    });
    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.wheel += Math.sign(event.deltaY);
        BINDS.device = 'keys';
      },
      { passive: false },
    );
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Locks the pointer to the canvas, so the mouse looks round. */
  lock(): void {
    void this.canvas.requestPointerLock();
  }

  /** Says which window is up over the game (`top`, null for none): the pad's buttons are then the window's, and a
   *  button held as one opens, closes or gives way to another does nothing more until it is let go; what it acted as
   *  is let go at once. */
  window(top: string | null): void {
    if (top === this.windowUp) return;
    this.windowUp = top;
    for (const name of this.pad.staleNow()) this.letGo.add(name);
    this.running = false;
  }

  /** Hears the controls the pad pressed each frame, a window's own among them while one is up, and the names of
   *  what it pressed. */
  onPad(listener: (pressed: ReadonlySet<Action>, buttons: ReadonlySet<string>) => void): void {
    this.padHeard.add(listener);
  }

  /** The pad's buttons down now, for a control being bound. */
  get padButtons(): ReadonlySet<string> {
    return this.pad.buttonsDown;
  }

  frame(): InputFrame {
    const now = performance.now();
    const seconds = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    const binds = BINDS.now;
    const read = this.pad.step(padInputs(padOf(padsNow())), seconds, BINDS.waits(this.context));
    if (this.pad.touched) BINDS.device = 'pad';
    // Under a window the pad presses nothing of the game's, but whatever it lets go is let go, a stick's ways too.
    const released = new Set([...read.released, ...this.letGo]);
    this.letGo.clear();
    const pad: PadFrame = this.windowUp !== null ? { ...NO_PAD, released } : { ...read, released };
    // A ranged weapon turns the triggers round: RT, the swing's, fires, as the guard's left button does.
    const ranged = BINDS.ranged;
    const padNames = (action: Action) => {
      const turned = ranged && action === 'swing' ? 'guard' : ranged && action === 'guard' ? 'swing' : action;
      return binds[turned].pad;
    };
    const padIn = (action: Action, within: ReadonlySet<string>) => padNames(action).some((name) => within.has(name));
    const padAmount = (action: Action) => Math.max(0, ...padNames(action).map((name) => pad.amount(name)));
    if (padIn('run', pad.pressed)) this.running = true;
    if (!['up', 'down', 'left', 'right'].some((way) => pad.amount(`LS ${way}`) > 0)) this.running = false;
    const down = new Set(this.down);
    const pressedSince = new Set(this.pressedSince);
    const releasedSince = new Set(this.releasedSince);
    const keyIn = (action: Action, within: Set<string>) => binds[action].keys.some((name) => within.has(name));
    const running = this.running;
    const snapshot: InputFrame = {
      held: (action) => keyIn(action, down) || padIn(action, pad.down) || (action === 'run' && running),
      pressed: (action) => keyIn(action, pressedSince) || padIn(action, pad.pressed),
      released: (action) => keyIn(action, releasedSince) || padIn(action, pad.released),
      amount: (action) => Math.max(Number(keyIn(action, down)), padAmount(action)),
      lookX: this.lookX,
      lookY: this.lookY,
      wheel: this.wheel,
      // Played on the pad, the game has its controls without the pointer: a pad's press is never a click on the page.
      locked: this.locked || BINDS.device === 'pad',
    };
    this.padAlone = {
      ...IDLE,
      held: (action) => padIn(action, pad.down),
      pressed: (action) => padIn(action, pad.pressed),
      released: (action) => padIn(action, pad.released),
      amount: padAmount,
    };
    this.pressedSince.clear();
    this.releasedSince.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    const pressed = new Set(BIND_IDS.filter((id) => binds[id].pad.some((name) => read.pressed.has(name))));
    if (read.pressed.size > 0) for (const listener of this.padHeard) listener(pressed, read.pressed);
    return snapshot;
  }
}

/** The signs' keys by their place, named as they type without Shift. */
const SIGNS: Readonly<Record<string, string>> = {
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};

/** A key's name as it is bound: a key that types a letter by that letter in lower case, on any layout; a digit or a
 *  sign by its place on the row, since Shift (the run) turns 2 into '@' and ',' into '<'; any other key by its own
 *  name in lower case. */
export function keyNameOf(event: Pick<KeyboardEvent, 'code' | 'key'>): string {
  const typed = event.key.toLowerCase();
  if (/^Digit\d$/.test(event.code)) return event.code.slice('Digit'.length);
  return /^\p{L}$/u.test(typed) ? typed : (SIGNS[event.code] ?? typed);
}

/** The name each key last went down with, by its place (the input records it as each key goes down). */
const wentDown = new Map<string, string>();

/** A key let go, named as it went down: on a layout whose sign Shift changes, its own name may differ. */
export const keyUpNameOf = (event: Pick<KeyboardEvent, 'code' | 'key'>): string =>
  wentDown.get(event.code) ?? keyNameOf(event);
