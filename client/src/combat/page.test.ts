// A page with just enough of the DOM for the display's parts to be built and read in a test: elements with classes,
// words, styles, data and children. No layout, no sheet: the tests read what the display writes.

/** An element of the stand-in page. */
export interface FakeElement {
  readonly tagName: string;
  className: string;
  textContent: string;
  hidden: boolean;
  readonly style: Record<string, string>;
  readonly dataset: Record<string, string>;
  readonly children: FakeElement[];
  parent: FakeElement | null;
  readonly classList: {
    toggle(name: string, wanted?: boolean): boolean;
    add(name: string): void;
    remove(name: string): void;
    contains(name: string): boolean;
  };
  append(...children: FakeElement[]): void;
  remove(): void;
}

function fakeElement(tag: string): FakeElement {
  const classes = (made: FakeElement) => new Set(made.className.split(/\s+/).filter(Boolean));
  const made: FakeElement = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    hidden: false,
    style: {},
    dataset: {},
    children: [],
    parent: null,
    classList: {
      toggle(name, wanted) {
        const now = classes(made);
        const shown = wanted ?? !now.has(name);
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
