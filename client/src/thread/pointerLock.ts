// The pointer's lock as the game asks for it: taken when asked, and let go when the game no longer wants it, even
// where the browser grants a lock asked for before the game changed its mind. In the desktop app a lock the page may
// not take without a press (as after Escape) is taken for it by the shell, which presses the page's own hook.

/** The page's side of the lock: the element holding it, and the way to let it go. */
export interface LockPage {
  readonly pointerLockElement: Element | null;
  exitPointerLock(): void;
}

/** An element that can take the lock. */
export type Lockable = Element & { requestPointerLock(): Promise<void> | void };

export class PointerLock {
  private readonly canvas: Lockable;
  private readonly page: LockPage;
  private readonly refused: (() => void) | null;
  private wanted = false;

  /** The lock on `canvas`, on `page`; `refused` asks the shell to take it where the page was refused it. */
  constructor(canvas: Lockable, page: LockPage, refused: (() => void) | null) {
    [this.canvas, this.page, this.refused] = [canvas, page, refused];
  }

  /** Whether the canvas holds the lock. */
  get held(): boolean {
    return this.page.pointerLockElement === this.canvas;
  }

  /** The game asks for the lock, or to let it go. */
  want(locked: boolean): void {
    this.wanted = locked;
    if (locked) this.take(this.refused);
    else if (this.held) this.page.exitPointerLock();
  }

  /** The lock changed; answers whether the canvas holds it, letting go at once one granted after the game let go. */
  changed(): boolean {
    if (this.held && !this.wanted) {
      this.page.exitPointerLock();
      return false;
    }
    return this.held;
  }

  /** The shell's press: the lock taken again where the game still wants it. */
  again(): void {
    if (this.wanted && !this.held) this.take(null);
  }

  private take(refused: (() => void) | null): void {
    void Promise.resolve()
      .then(() => this.canvas.requestPointerLock())
      .catch(() => refused?.());
  }
}
