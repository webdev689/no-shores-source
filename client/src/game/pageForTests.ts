// A page of fake elements for tests that build the interface in Node: enough of the DOM for the windows, presses and
// fields the game makes (children, classes, attributes, text, focus, clicks, keys and listeners), and nothing more.
// Anything an element is asked for that this page does not keep is a harmless no-op, so a test meets only what it
// checks.

type Heard = (event: FakeEvent) => void;

export class FakeEvent {
  readonly type: string;
  target: FakeElement | null = null;
  defaultPrevented = false;
  readonly key: string;
  readonly code: string;
  readonly repeat = false;
  readonly ctrlKey = false;
  readonly metaKey = false;
  readonly altKey = false;
  readonly detail: unknown;
  constructor(type: string, init: { key?: string; code?: string; detail?: unknown } = {}) {
    this.type = type;
    this.key = init.key ?? '';
    this.code = init.code ?? '';
    this.detail = init.detail;
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
  stopPropagation(): void {}
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
    for (const heard of [...(this.heard.get(event.type) ?? [])]) heard(event);
    return !event.defaultPrevented;
  }
  listening(type: string): number {
    return this.heard.get(type)?.size ?? 0;
  }
}

export class FakeElement extends Listeners {
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string | ((name: string, value: string) => void)> = {
    setProperty: (name: string, value: string) => void (this.style[name] = value),
  };
  readonly dataset: Record<string, string> = {};
  className = '';
  value = '';
  type = '';
  id = '';
  disabled = false;
  hidden = false;
  inert = false;
  tabIndex = 0;
  private text = '';
  readonly classList = {
    add: (...names: string[]) => (this.className = [...new Set([...this.names(), ...names])].join(' ')),
    remove: (...names: string[]) =>
      (this.className = this.names()
        .filter((name) => !names.includes(name))
        .join(' ')),
    contains: (name: string) => this.names().includes(name),
    toggle: (name: string, wanted = !this.classList.contains(name)) => {
      if (wanted) this.classList.add(name);
      else this.classList.remove(name);
      return wanted;
    },
  };
  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
    // Whatever this page does not keep answers as a no-op, so the code under test runs past it.
    return new Proxy(this, {
      get: (target, key, receiver) =>
        key in target || typeof key === 'symbol' ? Reflect.get(target, key, receiver) : () => undefined,
    });
  }
  private names(): string[] {
    return this.className.split(' ').filter(Boolean);
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('');
  }
  set textContent(text: string) {
    this.replaceChildren();
    this.text = text;
  }
  get isConnected(): boolean {
    return this.parent?.isConnected ?? false;
  }
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  get lastChild(): FakeElement | null {
    return this.children[this.children.length - 1] ?? null;
  }
  get ownerDocument(): FakePage {
    return page;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  append(...more: (FakeElement | string)[]): void {
    for (const child of more) {
      if (typeof child === 'string') this.text += child;
      else {
        child.remove();
        child.parent = this;
        this.children.push(child);
      }
    }
  }
  prepend(...more: FakeElement[]): void {
    for (const child of more.reverse()) {
      child.remove();
      child.parent = this;
      this.children.unshift(child);
    }
  }
  replaceChildren(...more: FakeElement[]): void {
    for (const child of [...this.children]) child.remove();
    this.append(...more);
  }
  remove(): void {
    const parent = this.parent;
    if (!parent) return;
    parent.children.splice(parent.children.indexOf(this), 1);
    this.parent = null;
    if (page.activeElement && !page.activeElement.isConnected) page.activeElement = page.body;
  }
  contains(other: unknown): boolean {
    for (let node = other instanceof FakeElement ? other : null; node; node = node.parent)
      if (node === this) return true;
    return false;
  }
  focus(): void {
    if (this.isConnected) page.activeElement = this;
  }
  blur(): void {
    if (page.activeElement === this) page.activeElement = page.body;
  }
  click(): void {
    if (this.disabled) return;
    const event = new FakeEvent('click');
    event.target = this;
    this.dispatchEvent(event);
  }
  /** Every element under this one, in the page's order. */
  all(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.all()]);
  }
  /** The first element under this one whose own words are `words`. */
  find(words: string): FakeElement | undefined {
    return this.all().find((node) => node.textContent === words);
  }
  querySelector(): null {
    return null;
  }
  querySelectorAll(): FakeElement[] {
    return [];
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
}

class FakePage extends Listeners {
  readonly body = new FakeElement('body');
  readonly head = new FakeElement('head');
  activeElement: FakeElement | null = this.body;
  hidden = false;
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
  getElementById(): null {
    return null;
  }
  exitPointerLock(): void {}
}

const page = new FakePage();

/** A stand-in for one kind of element (`HTMLInputElement`...), known by its tag. */
const kindOf = (tagName: string) => ({
  [Symbol.hasInstance]: (node: unknown) => node instanceof FakeElement && node.tagName === tagName,
});
Object.defineProperty(page.body, 'isConnected', { get: () => true });

/** The fake page laid over the globals the interface reads (`document`, the window's listeners, `HTMLElement` and
 *  its kind), with a root element on its body for the code under test to build in. */
export function fakePage(): { readonly root: FakeElement; readonly page: FakePage; readonly window: Listeners } {
  const window = new Listeners();
  page.body.replaceChildren();
  page.activeElement = page.body;
  const root = new FakeElement('div');
  page.body.append(root);
  Object.assign(globalThis, {
    document: page,
    window: globalThis,
    HTMLElement: FakeElement,
    HTMLButtonElement: kindOf('BUTTON'),
    HTMLInputElement: kindOf('INPUT'),
    HTMLTextAreaElement: kindOf('TEXTAREA'),
    Node: FakeElement,
    Event: FakeEvent,
    CustomEvent: FakeEvent,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    dispatchEvent: window.dispatchEvent.bind(window),
  });
  return { root, page, window };
}
