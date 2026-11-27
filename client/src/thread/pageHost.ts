// The page's side of the game in its worker: the page keeps what a browser allows nowhere else (the player's input,
// the pointer's lock, the pad, typing, sound, storage, the address) and sends the game what it hears, doing what the
// game asks of it. The game draws on the page's canvas from its worker.
import { BRIDGE_NAME, type DesktopBridge, RELOCK_HOOK } from '../desktop.ts';
import { CanvasEvents } from '../ui/canvasEvents.ts';
import { BROWSERS_SIGN_INS, stopped, touchesHeld } from '../ui/page.ts';
import { drawSvgInPage } from '../ui/pictures.ts';
import { AudioHost } from './audioHost.ts';
import { PointerLock } from './pointerLock.ts';
import {
  EVENT_FIELDS,
  HEARD,
  MEDIA,
  type PadRead,
  QA_HOOKS,
  sideKey,
  type Start,
  type ToGame,
  type ToPage,
  type View,
} from './pageOps.ts';

/** The keys a browser keeps for itself however the game is played: its own shortcuts, and the function keys. */
const browsersOwn = (event: KeyboardEvent) =>
  event.ctrlKey || event.metaKey || event.altKey || /^F\d+$/.test(event.key);

/** Whether `event` is a press or release of the mouse's back or forward side button. */
const sideButton = (event: Event) => event instanceof MouseEvent && (event.button === 3 || event.button === 4);

/** The desktop app's bridge, which its shell puts on the page before the page's own script; none in a browser. */
const bridgeOf = (): DesktopBridge | null =>
  ((globalThis as unknown as Record<string, unknown>)[BRIDGE_NAME] as DesktopBridge | undefined) ?? null;

export class PageHost {
  private readonly canvas: HTMLCanvasElement;
  private readonly worker: Worker;
  private readonly events: CanvasEvents;
  private readonly audio: AudioHost;
  private ticking = false;
  /** Whether the game has said it started, after which an error it throws is logged, not the page's end. */
  private started = false;
  private frames = 0;
  private questions = 0;
  /** Each hook's ask of the game, answered when the game answers. */
  private readonly asking = new Map<number, (answer: unknown) => void>();
  private readonly desktop = bridgeOf();
  private readonly lock: PointerLock;

  constructor(canvas: HTMLCanvasElement, worker: Worker) {
    [this.canvas, this.worker] = [canvas, worker];
    this.events = new CanvasEvents(canvas);
    const desktop = this.desktop;
    this.lock = new PointerLock(canvas, document, desktop && (() => desktop.ask({ ask: 'relock' })));
    this.audio = new AudioHost((reply, transfer) => this.post({ kind: 'audio', reply }, transfer));
    worker.addEventListener('message', (message: MessageEvent<ToPage>) => this.asked(message.data));
    for (const type of HEARD)
      addEventListener(type, (event) => this.heard(event), { passive: type !== 'wheel' ? undefined : false });
    document.addEventListener('visibilitychange', () => this.post({ kind: 'hidden', hidden: document.hidden }));
    document.addEventListener('pointerlockchange', () => this.post({ kind: 'lock', locked: this.lock.changed() }));
    for (const query of MEDIA)
      matchMedia(query).addEventListener('change', (change) =>
        this.post({ kind: 'media', query, matches: change.matches }),
      );
    this.desktop?.onInfo((info) => this.post({ kind: 'desktop', info }));
    if (this.desktop) Object.assign(window, { [RELOCK_HOOK]: () => this.lock.again() });
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

  /** The page says why the game stopped, and the game's thread goes with it, so nothing plays or listens behind the
   *  words. */
  stop(why: string): void {
    stopped(why);
    this.worker.terminate();
  }

  /** An error the game's thread did not catch: before the game has started it is why the game could not start; after,
   *  one part of it failed, and the game goes on. A script that could not load sends a bare event, with no message. */
  thrown(error: ErrorEvent | Event): void {
    const message = error instanceof ErrorEvent ? error.message : '';
    if (this.started) console.error('the game:', message || error);
    else this.stop(`The game could not start: ${message || 'its script did not load'}.`);
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
      desktop: this.desktop?.info() ?? null,
    };
  }

  private view(): View {
    const rect = this.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top, ratio: devicePixelRatio };
  }

  private post(message: ToGame, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }

  /** The pads read now and sent, while there are any and once as the last goes. */
  private padsSent = false;
  private sendPads(): void {
    const read = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    const pads: PadRead[] = read.flatMap((pad) =>
      pad
        ? [
            {
              mapping: pad.mapping,
              buttons: pad.buttons.map(({ pressed, value }) => ({ pressed, value })),
              axes: [...pad.axes],
            },
          ]
        : [],
    );
    if (pads.length === 0 && !this.padsSent) return;
    this.padsSent = pads.length > 0;
    this.post({ kind: 'pads', pads });
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
      this.sendPads();
      if (this.ticking) this.post({ kind: 'tick' });
      // The sound's clock now and then, so the game's reckoning of it never drifts far.
      if (++this.frames % 60 === 0) this.audio.clock();
      this.frame();
    });
  }

  private heard(event: Event): void {
    const locked = this.lock.held;
    // A gesture is the one moment a browser lets sound start; the game hears it after.
    if (event.type === 'pointerdown' || event.type === 'keydown') this.audio.wake();
    if (event instanceof KeyboardEvent) {
      // No key of the game's does the browser's own work (scroll, find, move the focus) unless words are typed.
      if (event.type === 'keydown' && !this.events.typingHere && !browsersOwn(event)) event.preventDefault();
    } else if (event.type === 'contextmenu' || event.type === 'wheel') event.preventDefault();
    // A side button is the game's with the pointer free too (`binds.ts`), so it never takes the page back or forward.
    else if (/^(mousedown|mouseup|auxclick)$/.test(event.type) && (locked || sideButton(event))) event.preventDefault();
    this.flush();
    const fields = Object.fromEntries(
      EVENT_FIELDS.filter((field) => field in event).map((field) => [
        field,
        (event as unknown as Record<string, unknown>)[field],
      ]),
    );
    const where = event.target === this.canvas ? 'canvas' : event.target === window ? 'window' : 'page';
    this.post({ kind: 'event', on: where, type: event.type, fields, pointer: this.events.pointer });
    const asKey = event instanceof MouseEvent ? sideKey(event.type, event.button, this.events.pointer) : null;
    if (asKey) this.post(asKey);
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
        else if (message.how === 'close') window.close();
        else if (message.how === 'reload') location.reload();
        else if (message.how === 'replaceState' || message.how === 'pushState')
          history[message.how](null, '', message.url);
        else location[message.how](message.url);
        return;
      case 'lock':
        this.lock.want(message.locked);
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
      case 'signIn': {
        const { id, keep } = message;
        const asked = keep ? BROWSERS_SIGN_INS.keep(keep).then(() => null) : BROWSERS_SIGN_INS.kept();
        void asked.then((kept) => this.post({ kind: 'signIn', id, kept }));
        return;
      }
      case 'ticks':
        this.ticking = true;
        return;
      case 'qa':
        this.asking.get(message.id)?.(message.answer);
        this.asking.delete(message.id);
        return;
      case 'desktop':
        this.desktop?.ask(message.ask);
        return;
      case 'started':
        this.started = true;
        this.desktop?.ask({ ask: 'drawn' });
        return;
      case 'stopped':
        this.stop(message.message);
        return;
    }
  }
}
