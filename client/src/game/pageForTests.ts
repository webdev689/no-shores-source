// The page as the menu's tests need it in Node: the window's listeners, an event to send them, and a document that
// hears its own and is never hidden.

type Heard = (event: FakeEvent) => void;

export class FakeEvent {
  readonly type: string;
  defaultPrevented = false;
  readonly key: string;
  readonly code: string;
  readonly repeat = false;
  readonly ctrlKey: boolean;
  readonly metaKey = false;
  readonly altKey = false;
  readonly detail: unknown;
  constructor(type: string, init: { key?: string; code?: string; detail?: unknown; ctrlKey?: boolean } = {}) {
    this.type = type;
    this.key = init.key ?? '';
    this.code = init.code ?? '';
    this.detail = init.detail;
    this.ctrlKey = init.ctrlKey ?? false;
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
  stopPropagation(): void {}
  /** Whether a listener kept it from every listener after it. */
  stopped = false;
  stopImmediatePropagation(): void {
    this.stopped = true;
  }
}

class Listeners {
  private readonly heard = new Map<string, Set<Heard>>();
  addEventListener(type: string, heard: Heard): void {
    if (!this.heard.has(type)) this.heard.set(type, new Set());
    this.heard.get(type)?.add(heard);
  }
  removeEventListener(type: string, heard: Heard): void {
    this.heard.get(type)?.delete(heard);
  }
  dispatchEvent(event: FakeEvent): boolean {
    for (const heard of [...(this.heard.get(event.type) ?? [])]) if (!event.stopped) heard(event);
    return !event.defaultPrevented;
  }
}

/** A fresh window's listeners laid over the globals the menu reads, with a document of its own. */
export function fakeWindow(): { readonly window: Listeners } {
  const window = new Listeners();
  Object.assign(globalThis, {
    document: Object.assign(new Listeners(), { hidden: false, exitPointerLock: () => undefined }),
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    dispatchEvent: window.dispatchEvent.bind(window),
  });
  return { window };
}
