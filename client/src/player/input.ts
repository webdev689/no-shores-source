/** DFO's controls, as the owner chose them ("same control scheme"): the key or mouse button each action is on. Keys
 *  are `KeyboardEvent.key` in lower case; mouse buttons are `mouse0` (left) to `mouse4` (the forward side button). */
export const BINDINGS = {
  forward: ['w'],
  back: ['s'],
  left: ['a'],
  right: ['d'],
  turnLeft: ['arrowleft'],
  turnRight: ['arrowright'],
  lookUp: ['insert'],
  lookDown: ['delete'],
  run: ['shift'],
  jump: [' '],
  crouch: ['c'],
  ready: ['z'],
  melee: ['1'],
  ranged: ['2'],
  // A healing charge, beside the loadouts' keys.
  heal: ['3'],
  swing: ['mouse2'],
  guard: ['mouse0', 'f'],
  dodge: ['v', 'mouse4'],
  // The Art's spells, on keys DFO's scheme leaves free: the Anima on R, the Tenets on Q (where casting was) and G.
  anima: ['r'],
  tenetOne: ['q'],
  tenetTwo: ['g'],
  perspective: ['mouse3'],
  mount: [','],
} as const;
export type Action = keyof typeof BINDINGS;

/** One frame's input: what is held, what was pressed or let go since the last frame, how far the mouse moved while the
 *  pointer was locked, and the wheel's notches (positive pulled back). */
export interface InputFrame {
  held(action: Action): boolean;
  pressed(action: Action): boolean;
  released(action: Action): boolean;
  readonly lookX: number;
  readonly lookY: number;
  readonly wheel: number;
  readonly locked: boolean;
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

/** Listens to the keyboard, the mouse and the wheel on a canvas; `frame()` hands over each frame's input. Clicking the
 *  canvas locks the pointer to look round; Escape lets it go. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressedSince = new Set<string>();
  private readonly releasedSince = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private wheel = 0;
  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const press = (name: string) => {
      if (!this.down.has(name)) this.pressedSince.add(name);
      this.down.add(name);
    };
    const release = (name: string) => {
      this.down.delete(name);
      this.releasedSince.add(name);
    };
    // A digit is named by its key, not its character: Shift (the run) turns 2 into '@', and other layouts differ.
    const keyName = (event: KeyboardEvent) =>
      /^Digit\d$/.test(event.code) ? event.code.slice('Digit'.length) : event.key.toLowerCase();
    addEventListener('keydown', (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      press(keyName(event));
      if (this.locked && event.key === ' ') event.preventDefault();
    });
    addEventListener('keyup', (event) => release(keyName(event)));
    addEventListener('blur', () => this.down.clear());
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

  frame(): InputFrame {
    const down = new Set(this.down);
    const pressedSince = new Set(this.pressedSince);
    const releasedSince = new Set(this.releasedSince);
    const any = (names: readonly string[], within: Set<string>) => names.some((name) => within.has(name));
    const snapshot: InputFrame = {
      held: (action) => any(BINDINGS[action], down),
      pressed: (action) => any(BINDINGS[action], pressedSince),
      released: (action) => any(BINDINGS[action], releasedSince),
      lookX: this.lookX,
      lookY: this.lookY,
      wheel: this.wheel,
      locked: this.locked,
    };
    this.pressedSince.clear();
    this.releasedSince.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.wheel = 0;
    return snapshot;
  }
}
