import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { tapToStart } from './tap.ts';

/** An element as far as the tap to start uses one: its text, classes and listeners. */
class Element {
  textContent = '';
  className = '';
  tabIndex = -1;
  readonly children: Element[] = [];
  readonly heard = new Map<string, () => void>();
  removed = false;
  readonly classList = {
    names: new Set<string>(),
    add: (name: string) => void this.classList.names.add(name),
  };
  append(...more: Element[]): void {
    this.children.push(...more);
  }
  setAttribute(): void {}
  focus(): void {}
  remove(): void {
    this.removed = true;
  }
  addEventListener(kind: string, heard: () => void): void {
    this.heard.set(kind, heard);
  }
}

/** A page of fake elements, its window's keys heard as the tap to start listens for them. */
function page() {
  const keys = new Set<() => void>();
  const document = {
    createElement: () => new Element(),
    getElementById: () => null,
    head: new Element(),
  };
  Object.assign(globalThis, {
    document,
    window: globalThis,
    addEventListener: (_kind: string, heard: () => void) => keys.add(heard),
    removeEventListener: (_kind: string, heard: () => void) => keys.delete(heard),
  });
  const root = Object.assign(new Element(), { ownerDocument: document });
  return { root, keys, screen: () => root.children[0] };
}

const settle = async () => {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
};

test('the tap to start waits for both the tap and the world, then fades and goes', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { root, keys, screen } = page();
    let loaded: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => (loaded = resolve));
    let started = false;
    void tapToStart(root as unknown as HTMLElement, ready).then(() => (started = true));
    const shown = screen();
    assert.ok(shown);
    assert.deepEqual(
      shown.children.map((child) => child.textContent),
      ['Overlook', 'Click or press any key to start', ''],
    );
    for (const key of keys) key();
    await settle();
    assert.equal(keys.size, 0, 'a key is heard once');
    assert.equal(shown.children[2]?.textContent, 'Loading', 'tapped before the world is ready, it says it loads');
    assert.equal(started, false);
    loaded();
    await settle();
    assert.ok(started);
    assert.ok(shown.classList.names.has('gone'));
    mock.timers.tick(1300);
    assert.ok(shown.removed);
  } finally {
    mock.timers.reset();
  }
});
