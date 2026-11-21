// The page's side of the game in its worker: the page keeps what a browser allows nowhere else (the player's input,
// the pointer's lock, the pad, typing, sound, storage, the address) and sends the game what it hears, doing what the
// game asks of it. The game draws on the page's canvas from its worker.
import { CanvasEvents } from '../ui/canvasEvents.ts';
import { stopped, touchesHeld } from '../ui/page.ts';
import { drawSvgInPage } from '../ui/pictures.ts';
import { AudioHost } from './audioHost.ts';
import { EVENT_FIELDS, HEARD, MEDIA, QA_HOOKS, type Start, type ToGame, type ToPage, type View } from './pageOps.ts';

/** The keys a browser keeps for itself however the game is played: its own shortcuts, and the function keys. */
const browsersOwn = (event: KeyboardEvent) =>
  event.ctrlKey || event.metaKey || event.altKey || /^F\d+$/.test(event.key);

export class PageHost {
  private readonly canvas: HTMLCanvasElement;
  private readonly worker: Worker;
  private readonly events: CanvasEvents;
  private readonly audio: AudioHost;
  private ticking = false;
  private frames = 0;
  private questions = 0;
  /** Each hook's ask of the game, answered when the game answers. */
  private readonly asking = new Map<number, (answer: unknown) => void>();

  constructor(canvas: HTMLCanvasElement, worker: Worker) {
    [this.canvas, this.worker] = [canvas, worker];
    this.events = new CanvasEvents(canvas);
    this.audio = new AudioHost((reply, transfer) => this.post({ kind: 'audio', reply }, transfer));
    worker.addEventListener('message', (message: MessageEvent<ToPage>) => this.asked(message.data));
    for (const type of HEARD)
      addEventListener(type, (event) => this.heard(event), { passive: type !== 'wheel' ? undefined : false });
    document.addEventListener('visibilitychange', () => this.post({ kind: 'hidden', hidden: document.hidden }));
    document.addEventListener('pointerlockchange', () =>
      this.post({ kind: 'lock', locked: document.pointerLockElement === canvas }),
    );
    for (const query of MEDIA)
      matchMedia(query).addEventListener('change', (change) =>
        this.post({ kind: 'media', query, matches: change.matches }),
      );
    new ResizeObserver(() => this.post({ kind: 'view', view: this.view() })).observe(canvas);
    addEventListener('resize', () => this.post({ kind: 'view', view: this.view() }));
    this.frame();
    // A tool taking pictures reaches the game's hooks from the page, as it did while the game ran there.
    if (new URLSearchParams(location.search).has('spawn'))
      for (const hook of QA_HOOKS)
        Object.assign(window, {
          [hook]: (...args: unknown[]) =>
            new Promise((answer) => {
              const id = ++this.questions;
              this.asking.set(id, answer);
              this.post({ kind: 'qa', id, hook, args });
            }),
        });
  }

  /** What the game starts from: the canvas to draw on, and the page as it stands. */
  start(offscreen: OffscreenCanvas): Start {
    const entries = (storage: Storage) => {
      try {
        return Array.from({ length: storage.length }, (unused, index) => storage.key(index) ?? '').map(
          (key) => [key, storage.getItem(key) ?? ''] as const,
        );
      } catch {
        return [];
      }
    };
    return {
      kind: 'start',
      canvas: offscreen,
      href: location.href,
      local: entries(localStorage),
      session: entries(sessionStorage),
      view: this.view(),
      media: Object.fromEntries(MEDIA.map((query) => [query, matchMedia(query).matches])),
      hidden: document.hidden,
    };
  }

  private view(): View {
    const rect = this.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top, ratio: devicePixelRatio };
  }

  private post(message: ToGame, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }

  /** The interface's input since the last send, the pad's read now, before what comes next. */
  private flush(): void {
    const events = this.events.take();
    if (events.length > 0) this.post({ kind: 'ui', events, pointer: this.events.pointer });
  }

  /** Each of the page's frames: the pad read and the interface's input sent, the sound's clock, and a tick for a
   *  worker without frames of its own. */
  private frame(): void {
    requestAnimationFrame(() => {
      this.flush();
      if (this.ticking) this.post({ kind: 'tick' });
      // The sound's clock now and then, so the game's reckoning of it never drifts far.
      if (++this.frames % 60 === 0) this.audio.clock();
      this.frame();
    });
  }

  private heard(event: Event): void {
    const locked = document.pointerLockElement === this.canvas;
    // A gesture is the one moment a browser lets sound start; the game hears it after.
    if (event.type === 'pointerdown' || event.type === 'keydown') this.audio.wake();
    if (event instanceof KeyboardEvent) {
      // No key of the game's does the browser's own work (scroll, find, move the focus) unless words are typed.
      if (event.type === 'keydown' && !this.events.typingHere && !browsersOwn(event)) event.preventDefault();
    } else if (event.type === 'contextmenu' || event.type === 'wheel') event.preventDefault();
    else if (locked && /^(mousedown|mouseup|auxclick)$/.test(event.type)) event.preventDefault();
    this.flush();
    const fields = Object.fromEntries(
      EVENT_FIELDS.filter((field) => field in event).map((field) => [
        field,
        (event as unknown as Record<string, unknown>)[field],
      ]),
    );
    const where = event.target === this.canvas ? 'canvas' : 'window';
    this.post({ kind: 'event', on: where, type: event.type, fields, pointer: this.events.pointer });
  }

  private asked(message: ToPage): void {
    switch (message.kind) {
      case 'audio':
        this.audio.run(message.ops);
        return;
      case 'store': {
        const storage = message.area === 'local' ? localStorage : sessionStorage;
        try {
          if (message.key === null) storage.clear();
          else if (message.value === null) storage.removeItem(message.key);
          else storage.setItem(message.key, message.value);
        } catch {
          // A browser that keeps nothing: the game still holds it until the page closes.
        }
        return;
      }
      case 'go':
        if (message.how === 'open') window.open(message.url, '_blank', 'noopener');
        else if (message.how === 'reload') location.reload();
        else location[message.how](message.url);
        return;
      case 'lock':
        if (message.locked) void this.canvas.requestPointerLock()?.catch?.(() => undefined);
        else if (document.pointerLockElement === this.canvas) document.exitPointerLock();
        return;
      case 'capture':
        try {
          if (message.held) this.canvas.setPointerCapture(message.pointer);
          else this.canvas.releasePointerCapture(message.pointer);
        } catch {
          // The pointer was let go before the game asked.
        }
        return;
      case 'focus':
        this.canvas.focus();
        return;
      case 'sync':
        this.events.sync(message.typing, message.cursor);
        return;
      case 'touch':
        touchesHeld(this.canvas, message.held);
        return;
      case 'say':
        (document as Document & { ariaNotify?: (words: string) => void }).ariaNotify?.(message.words);
        return;
      case 'svg':
        drawSvgInPage(message.svg, message.width, message.height).then(
          (picture) => this.post({ kind: 'svg', id: message.id, picture }, [picture]),
          () => this.post({ kind: 'svg', id: message.id, picture: null }),
        );
        return;
      case 'ticks':
        this.ticking = true;
        return;
      case 'qa':
        this.asking.get(message.id)?.(message.answer);
        this.asking.delete(message.id);
        return;
      case 'stopped':
        stopped(message.message);
        this.worker.terminate();
        return;
    }
  }
}
