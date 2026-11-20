// A page with just enough of the DOM for the display's parts to be built and read in a test: elements with classes,
// words, styles, data and children. No layout, no sheet: the tests read what the display writes.

/** An element of the stand-in page. */
export interface FakeElement {
  readonly tagName: string;
  className: string;
  textContent: string;
  hidden: boolean;
  readonly style: Record<string, string> & { setProperty(name: string, value: string): void };
  readonly dataset: Record<string, string>;
  readonly children: FakeElement[];
  parent: FakeElement | null;
  /** A page whose sheets are all laid already. */
  readonly ownerDocument: { getElementById(id: string): unknown };
  readonly classList: {
    toggle(name: string, wanted?: boolean): boolean;
    add(name: string): void;
    remove(name: string): void;
    contains(name: string): boolean;
  };
  append(...children: FakeElement[]): void;
  replaceChildren(...children: FakeElement[]): void;
  remove(): void;
  /** No layout: every box is empty at the page's corner. */
  getBoundingClientRect(): { left: number; top: number; width: number; height: number; right: number; bottom: number };
  /** No drawing: a canvas has no context. */
  getContext(kind: string): null;
  /** The attributes set, by name. */
  readonly attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
}

function fakeElement(tag: string): FakeElement {
  const classes = (made: FakeElement) => new Set(made.className.split(/\s+/).filter(Boolean));
  const style: FakeElement['style'] = Object.defineProperty({} as FakeElement['style'], 'setProperty', {
    value: (name: string, value: string) => (style[name] = value),
  });
  const made: FakeElement = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    hidden: false,
    style,
    dataset: {},
    ownerDocument: { getElementById: () => true },
    children: [],
    parent: null,
    classList: {
      toggle(name, wanted) {
        const now = classes(made);
        const shown = wanted ?? !now.has(name);
        if (shown === now.has(name)) return shown;
        if (shown) now.add(name);
        else now.delete(name);
        made.className = [...now].join(' ');
        return shown;
      },
      add: (name) => void made.classList.toggle(name, true),
      remove: (name) => void made.classList.toggle(name, false),
      contains: (name) => classes(made).has(name),
    },
    append(...children) {
      for (const child of children) {
        child.remove();
        child.parent = made;
        made.children.push(child);
      }
    },
    replaceChildren(...children) {
      for (const child of [...made.children]) child.remove();
      made.append(...children);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }),
    getContext: () => null,
    attributes: {},
    setAttribute: (name, value) => void (made.attributes[name] = value),
    remove() {
      if (!made.parent) return;
      made.parent.children.splice(made.parent.children.indexOf(made), 1);
      made.parent = null;
    },
  };
  return made;
}

/** Stands a page in for the global document while `run` goes, and hands it a root element to build in. */
export function onFakePage<Result>(run: (root: HTMLElement) => Result): Result {
  const holder = globalThis as { document?: unknown };
  const was = holder.document;
  holder.document = { createElement: fakeElement };
  try {
    return run(fakeElement('div') as unknown as HTMLElement);
  } finally {
    holder.document = was;
  }
}

/** Every element under `root` (itself first) whose classes hold all of `names`. */
export function findAll(root: HTMLElement, ...names: string[]): FakeElement[] {
  const fake = root as unknown as FakeElement;
  const here = names.every((name) => fake.classList.contains(name)) ? [fake] : [];
  return [...here, ...fake.children.flatMap((child) => findAll(child as unknown as HTMLElement, ...names))];
}

/** Counts from now every write `root` and what stands under it take: a style, a class, words, `hidden` or an aria
 *  property set, even to the value it had; and every layout read (`getBoundingClientRect`). A real page re-styles
 *  for each, so a display that has settled should take none. */
export function countWrites(root: HTMLElement): { writes: string[]; reads: number } {
  const counted = { writes: [] as string[], reads: 0 };
  const watch = (fake: FakeElement) => {
    const own = fake as unknown as Record<string, unknown>;
    for (const name of ['className', 'textContent', 'hidden', 'ariaLabel', 'ariaValueNow', 'ariaValueText']) {
      let value = own[name];
      Object.defineProperty(own, name, {
        get: () => value,
        set: (next: unknown) => {
          counted.writes.push(`${fake.className}.${name}`);
          value = next;
        },
      });
    }
    const style: Record<string, string> = { ...fake.style };
    own['style'] = new Proxy(style, {
      set: (target, name, next) => {
        counted.writes.push(`${fake.className}.style.${String(name)}`);
        return Reflect.set(target, name, next);
      },
      get: (target, name) =>
        name === 'setProperty'
          ? (property: string, next: string) => {
              counted.writes.push(`${fake.className}.style.${property}`);
              target[property] = next;
            }
          : Reflect.get(target, name),
    });
    own['getBoundingClientRect'] = () => {
      counted.reads += 1;
      return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    };
    const append = fake.append.bind(fake);
    fake.append = (...children) => {
      for (const child of children) watch(child);
      append(...children);
    };
    for (const child of fake.children) watch(child);
  };
  watch(root as unknown as FakeElement);
  return counted;
}

/** Asks for reduced motion, or not, while `run` goes. */
export function withMotionReduced<Result>(reduced: boolean, run: () => Result): Result {
  const holder = globalThis as { matchMedia?: unknown };
  const was = holder.matchMedia;
  holder.matchMedia = () => ({ matches: reduced });
  try {
    return run();
  } finally {
    holder.matchMedia = was;
  }
}
