// The page as the game's worker sees it. A worker has no page, so the game's code, written for one, finds stand-ins
// where a page's would be: its storage (read here, every write sent on), its address, its size, its media queries,
// its document (hidden or not, the pointer's lock, a screen reader's announcements), its pads (as the page read them
// last), and its canvas (the page's, drawn on from here, its events heard as the page sends them). Each asks the page, through `send`, for what only a
// page can do.
import { canvasSize } from '../canvasSize.ts';
import { FrameGuard } from '../frameGuard.ts';
import { hearFromAway, type PageEvents } from '../ui/canvasEvents.ts';
import { type KeptSignIn, useSignIns } from '../ui/page.ts';
import { useSvgDrawer } from '../ui/pictures.ts';
import type { Typing, UiEvent } from '../ui/ui.ts';
import { HEARD, type PadRead, type Pointer, type Start, type ToGame, type ToPage, type View } from './pageOps.ts';

type Send = (message: ToPage, transfer?: Transferable[]) => void;

/** A page's storage, kept here as the page last had it; each change is sent to the page's own at once. */
export class KeptStorage {
  private readonly kept: Map<string, string>;
  private readonly area: 'local' | 'session';
  private readonly send: Send;

  constructor(entries: readonly (readonly [string, string])[], area: 'local' | 'session', send: Send) {
    [this.kept, this.area, this.send] = [new Map(entries), area, send];
  }
  get length(): number {
    return this.kept.size;
  }
  key(index: number): string | null {
    return [...this.kept.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.kept.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.kept.set(key, String(value));
    this.send({ kind: 'store', area: this.area, key, value: String(value) });
  }
  removeItem(key: string): void {
    this.kept.delete(key);
    this.send({ kind: 'store', area: this.area, key, value: null });
  }
  clear(): void {
    this.kept.clear();
    this.send({ kind: 'store', area: this.area, key: null, value: null });
  }
}

/** The page's address, read as a page's `location` is, and its history: leaving it or loading it again is the page's to
 *  do, and an entry replaced or pushed (a fragment taken off) changes the page's address and this one alike. */
export function addressOf(href: string, send: Send): { readonly location: Location; readonly history: History } {
  let url = new URL(href);
  const leave = (how: 'reload' | 'assign' | 'replace', to = url.href) =>
    send({ kind: 'go', how, url: new URL(to, url).href });
  const location = Object.defineProperties(
    {
      ancestorOrigins: [] as unknown as DOMStringList,
      reload: () => leave('reload'),
      assign: (to: string | URL) => leave('assign', String(to)),
      replace: (to: string | URL) => leave('replace', String(to)),
      toString: () => url.href,
    },
    Object.fromEntries(
      (['href', 'origin', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash'] as const).map(
        (part) => [part, { get: () => url[part], enumerable: true }],
      ),
    ),
  ) as unknown as Location;
  const entry = (how: 'replaceState' | 'pushState') => (_state: unknown, _unused: string, to?: string | URL | null) => {
    if (to === undefined || to === null) return;
    url = new URL(to, url);
    send({ kind: 'go', how, url: url.href });
  };
  const history = { replaceState: entry('replaceState'), pushState: entry('pushState'), length: 1 };
  return { location, history: history as unknown as History };
}

/** The interface's input as the page sends it, heard each frame; what it types in sent back as it changes. */
export class HeardEvents implements PageEvents {
  pointer: Pointer = null;
  private events: UiEvent[] = [];
  private said = '';
  private readonly send: Send;

  constructor(send: Send) {
    this.send = send;
  }

  heard(events: readonly UiEvent[], pointer: Pointer): void {
    this.events.push(...events);
    this.pointer = pointer;
  }

  take(): UiEvent[] {
    const taken = this.events;
    this.events = [];
    return taken;
  }

  sync(typing: Typing | null, cursor: string): void {
    const said = JSON.stringify([typing, cursor]);
    if (said === this.said) return;
    this.said = said;
    this.send({ kind: 'sync', typing, cursor });
  }
}

/** The page's document as the game reads it. */
class PageDocument extends EventTarget {
  hidden: boolean;
  pointerLockElement: object | null = null;
  private readonly send: Send;

  constructor(hidden: boolean, send: Send) {
    super();
    [this.hidden, this.send] = [hidden, send];
  }
  get visibilityState(): DocumentVisibilityState {
    return this.hidden ? 'hidden' : 'visible';
  }
  get fonts(): FontFaceSet | undefined {
    return (globalThis as { fonts?: FontFaceSet }).fonts;
  }
  exitPointerLock(): void {
    this.send({ kind: 'lock', locked: false });
  }
  ariaNotify(words: string): void {
    this.send({ kind: 'say', words });
  }
}

/** The page's canvas as the game holds it: drawn on here, sized by the page, its events the page's. */
function canvasOf(canvas: OffscreenCanvas, view: () => View, send: Send): HTMLCanvasElement {
  const style = {
    set touchAction(value: string) {
      send({ kind: 'touch', held: value === 'none' });
    },
    get touchAction() {
      return '';
    },
    cursor: '',
  };
  Object.defineProperties(canvas, {
    clientWidth: { get: () => view().width },
    clientHeight: { get: () => view().height },
    getBoundingClientRect: {
      value: () => {
        const { left, top, width, height } = view();
        return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height };
      },
    },
    requestPointerLock: { value: () => (send({ kind: 'lock', locked: true }), Promise.resolve()) },
    setPointerCapture: { value: (pointer: number) => send({ kind: 'capture', pointer, held: true }) },
    releasePointerCapture: { value: (pointer: number) => send({ kind: 'capture', pointer, held: false }) },
    focus: { value: () => send({ kind: 'focus' }) },
    style: { value: style },
    tabIndex: { value: 0, writable: true },
  });
  return canvas as unknown as HTMLCanvasElement;
}

/** An event as the page heard it, made again here with what the game reads of it. */
/** The page's event, and whether a listener has stopped it. Each stage of the worker's dispatch is a dispatch of its
 *  own, and a browser may forget the stop once one ends, so it is kept here. */
function eventOf(type: string, fields: Readonly<Record<string, unknown>>): [Event, () => boolean] {
  const event = Object.assign(new Event(type, { cancelable: true }), fields);
  let stopped = false;
  for (const name of ['stopPropagation', 'stopImmediatePropagation'] as const) {
    const own = event[name].bind(event);
    event[name] = () => ((stopped = true), own());
  }
  return [event, () => stopped];
}

/** The window's listeners for the page's own events, kept by phase, as a page's window keeps them: one heard in the
 *  capture phase runs before the event reaches the canvas, and stopping it there keeps it from the plain ones. A
 *  worker's global has no phases of its own, its own events being at their target. */
function phasedWindow(): { readonly capture: EventTarget; readonly bubble: EventTarget } {
  const phases = { capture: new EventTarget(), bubble: new EventTarget() };
  const heard: ReadonlySet<string> = new Set(HEARD);
  const scope = globalThis as unknown as EventTarget;
  const [add, remove] = [scope.addEventListener.bind(scope), scope.removeEventListener.bind(scope)];
  const phaseOf = (options?: boolean | EventListenerOptions) =>
    (typeof options === 'boolean' ? options : Boolean(options?.capture)) ? phases.capture : phases.bubble;
  Object.assign(globalThis, {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) {
      if (heard.has(type)) phaseOf(options).addEventListener(type, listener, options);
      else add(type, listener, options);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions) {
      if (heard.has(type)) phaseOf(options).removeEventListener(type, listener, options);
      else remove(type, listener, options);
    },
  });
  return phases;
}

/** What the worker does with each message the page sends, once the stand-ins are in place. */
export interface Away {
  readonly canvas: HTMLCanvasElement;
  readonly events: HeardEvents;
  heard(message: ToGame): void;
}

/** Puts the page's stand-ins in place in the worker from what the page sent at the start. */
export function pageAway(start: Start, send: Send): Away {
  let view = start.view;
  const media = new Map(Object.entries(start.media));
  const page = new PageDocument(start.hidden, send);
  const canvas = canvasOf(start.canvas, () => view, send);
  const events = new HeardEvents(send);
  const sized = () => {
    const size = canvasSize(view.width, view.height, view.ratio);
    if (start.canvas.width !== size.width) start.canvas.width = size.width;
    if (start.canvas.height !== size.height) start.canvas.height = size.height;
  };
  sized();
  const global = globalThis as unknown as Record<string, unknown>;
  const address = addressOf(start.href, send);
  Object.defineProperties(globalThis, {
    location: { value: address.location, configurable: true },
    history: { value: address.history, configurable: true },
    localStorage: { value: new KeptStorage(start.local, 'local', send), configurable: true },
    sessionStorage: { value: new KeptStorage(start.session, 'session', send), configurable: true },
    devicePixelRatio: { get: () => view.ratio, configurable: true },
    innerWidth: { get: () => view.width, configurable: true },
    innerHeight: { get: () => view.height, configurable: true },
    document: { value: page, configurable: true },
    window: { value: globalThis, configurable: true },
  });
  global['open'] = (url: string) => (send({ kind: 'go', how: 'open', url: new URL(url, start.href).href }), null);
  global['matchMedia'] = (query: string) => ({
    media: query,
    get matches() {
      return media.get(query) ?? false;
    },
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  const window = phasedWindow();
  const ticks = ticksOf(send);
  // A worker has no Gamepad API: the pads are read as the page last sent them.
  let pads: readonly PadRead[] = [];
  Object.defineProperty(navigator, 'getGamepads', { value: () => pads, configurable: true });
  hearFromAway(events);
  // Only a page decodes SVG: the page draws it, and sends the picture.
  const drawing = new Map<number, (picture: ImageBitmap | null) => void>();
  let drawn = 0;
  useSvgDrawer(
    (svg, width, height) =>
      new Promise((resolve, reject) => {
        const id = ++drawn;
        drawing.set(id, (picture) =>
          picture ? resolve(picture) : reject(new Error('the page could not draw an SVG')),
        );
        send({ kind: 'svg', id, svg, width, height });
      }),
  );
  // The password store is the page's: each ask goes to it, and its answer comes back.
  const signing = new Map<number, (kept: KeptSignIn | null) => void>();
  let asked = 0;
  const signIn = (keep: KeptSignIn | null) =>
    new Promise<KeptSignIn | null>((answer) => {
      const id = ++asked;
      signing.set(id, answer);
      send({ kind: 'signIn', id, keep });
    });
  useSignIns({ keep: async (kept) => void (await signIn(kept)), kept: () => signIn(null) });
  return {
    canvas,
    events,
    heard(message) {
      switch (message.kind) {
        case 'view':
          view = message.view;
          sized();
          return;
        case 'media':
          media.set(message.query, message.matches);
          return;
        case 'event': {
          events.pointer = message.pointer;
          // As on a page: down through the window's capture listeners, to the canvas, and back up through its plain
          // ones, each stage reached only if no listener before it stopped the event; at the window itself, both.
          const [event, stopped] = eventOf(message.type, message.fields);
          window.capture.dispatchEvent(event);
          if (message.on === 'canvas' && !stopped()) canvas.dispatchEvent(event);
          if (message.on === 'window' || !stopped()) window.bubble.dispatchEvent(event);
          return;
        }
        case 'ui':
          events.heard(message.events, message.pointer);
          return;
        case 'lock':
          page.pointerLockElement = message.locked ? canvas : null;
          page.dispatchEvent(new Event('pointerlockchange'));
          return;
        case 'hidden':
          page.hidden = message.hidden;
          page.dispatchEvent(new Event('visibilitychange'));
          return;
        case 'tick':
          ticks?.();
          return;
        case 'pads':
          pads = message.pads;
          return;
        case 'svg':
          drawing.get(message.id)?.(message.picture);
          drawing.delete(message.id);
          return;
        case 'signIn':
          signing.get(message.id)?.(message.kept);
          signing.delete(message.id);
          return;
        case 'qa': {
          const hook = global[message.hook] as ((...args: unknown[]) => unknown) | undefined;
          void Promise.resolve(hook?.(...message.args)).then((answer) => send({ kind: 'qa', id: message.id, answer }));
          return;
        }
        default:
          return;
      }
    },
  };
}

/** A worker without frames of its own (`requestAnimationFrame`) runs its callbacks on the page's: answers what to do
 *  on each of the page's ticks, or null where the worker has its own. */
function ticksOf(send: Send): (() => void) | null {
  if (typeof globalThis.requestAnimationFrame === 'function') return null;
  let waiting = new Map<number, FrameRequestCallback>();
  let next = 1;
  const guard = new FrameGuard();
  send({ kind: 'ticks' });
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: FrameRequestCallback) => (waiting.set(next, callback), next++),
    cancelAnimationFrame: (id: number) => waiting.delete(id),
  });
  return () => {
    const due = waiting;
    waiting = new Map();
    const now = performance.now();
    // As a browser's own frames run them: one callback that throws is reported, and the rest still run.
    for (const callback of due.values()) guard.run(() => callback(now));
  };
}
