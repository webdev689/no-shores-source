// A document just large enough for the panel's pages, forms and composer, for tests that draw them in Node: elements,
// attributes, children, text, events and the few selectors the panel asks for.

type Listener = (event: { type: string; [key: string]: unknown }) => unknown;

export class FakeElement {
  readonly tagName: string;
  readonly attrs: Record<string, string> = {};
  children: FakeElement[] = [];
  readonly listeners: Record<string, Listener[]> = {};
  readonly style: Record<string, string> = {};
  value = '';
  checked = false;
  disabled = false;
  readOnly = false;
  hidden = false;
  open = false;
  ownText = '';
  selectionStart: number | null = null;
  selectionEnd: number | null = null;
  files: unknown[] | null = null;
  parent: FakeElement | null = null;
  private readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, wanted: boolean): boolean => (wanted ? !!this.classes.add(name) : this.classes.delete(name)),
    contains: (name: string): boolean => this.classes.has(name),
  };

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  setAttribute(name: string, value: string): void {
    this.attrs[name] = String(value);
    if (name === 'class') for (const one of value.split(/\s+/)) this.classes.add(one);
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  append(...nodes: unknown[]): void {
    for (const node of nodes) {
      const child =
        node instanceof FakeElement ? node : Object.assign(new FakeElement('#text'), { ownText: String(node) });
      child.parent = this;
      this.children.push(child);
      // a select takes the value of its first option, as a browser's does
      if (this.tagName === 'SELECT' && this.value === '' && child.tagName === 'OPTION')
        this.value = child.attrs.value ?? '';
    }
  }
  replaceChildren(...nodes: unknown[]): void {
    this.children = [];
    this.append(...nodes);
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  addEventListener(type: string, listener: Listener): void {
    (this.listeners[type] ??= []).push(listener);
  }
  dispatchEvent(event: { type: string; [key: string]: unknown }): void {
    for (const listener of this.listeners[event.type] ?? []) void listener(event);
  }
  click(): void {
    this.dispatchEvent({ type: 'click', preventDefault: () => {} });
  }
  focus(): void {
    this.dispatchEvent({ type: 'focus' });
  }
  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
  /** Type into a box as a person would: its value, then its input event. */
  type(text: string): void {
    this.value = text;
    this.dispatchEvent({ type: 'input' });
  }
  /** Pick a value in a select as a person would: its value, then its change event. */
  choose(value: string): void {
    this.value = value;
    this.dispatchEvent({ type: 'change' });
  }
  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join('');
  }
  set textContent(text: string) {
    this.children = [];
    this.ownText = String(text);
  }
  /** Every descendant, depth first. */
  *walk(): Generator<FakeElement> {
    for (const child of this.children) {
      yield child;
      yield* child.walk();
    }
  }
  private matches(selector: string): boolean {
    const className = /^\.([\w-]+)$/.exec(selector)?.[1];
    return className ? this.classes.has(className) : this.tagName === selector.toUpperCase();
  }
  querySelector(selector: string): FakeElement | null {
    return [...this.walk()].find((node) => node.matches(selector)) ?? null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    return [...this.walk()].filter((node) => node.matches(selector));
  }
  find(test: (node: FakeElement) => boolean): FakeElement | undefined {
    return [...this.walk()].find(test);
  }
  findAll(test: (node: FakeElement) => boolean): FakeElement[] {
    return [...this.walk()].filter(test);
  }
}

/** The fake an element made by the panel is, while the fake document is in place. */
export const fake = (node: unknown): FakeElement => {
  if (!(node instanceof FakeElement)) throw new Error('not drawn in the fake document');
  return node;
};

/** The buttons whose words are `label`. */
export const buttonsNamed = (root: FakeElement, label: string): FakeElement[] =>
  root.findAll((node) => node.tagName === 'BUTTON' && node.textContent === label);

/** The select a person knows by its `aria-label`. */
export const selectNamed = (root: FakeElement, label: string): FakeElement | undefined =>
  root.find((node) => node.tagName === 'SELECT' && node.attrs['aria-label'] === label);

/** The box a label names (its words before any counter), the `nth` of that name. */
export function boxFor(root: FakeElement, label: string, nth = 0): FakeElement | undefined {
  const named = root.findAll((node) => node.tagName === 'LABEL' && node.children[0]?.ownText === label)[nth];
  return root.find(
    (node) => (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') && node.attrs.id === named?.attrs.for,
  );
}

/** Run `body` with the fake document and window in place of the browser's, put back after. */
export async function withDocument<Result>(
  body: () => Result | Promise<Result>,
  extra: Record<string, unknown> = {},
): Promise<Result> {
  const names = ['document', 'window', 'location', 'localStorage', 'sessionStorage', 'fetch', ...Object.keys(extra)];
  const before = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const fakeDocument = { createElement: (tag: string) => new FakeElement(tag), getElementById: () => null };
  const fakeWindow = { Event: globalThis.Event, addEventListener: () => {} };
  for (const [name, value] of Object.entries({ document: fakeDocument, window: fakeWindow, ...extra }))
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  try {
    return await body();
  } finally {
    names.forEach((name, i) => {
      const held = before[i];
      if (held) Object.defineProperty(globalThis, name, held);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
}

/** Wait for the panel's answers to land: a few turns of the event loop. */
export const settle = async (turns = 5): Promise<void> => {
  for (let turn = 0; turn < turns; turn++) await new Promise((resolve) => setTimeout(resolve, 0));
};
