import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Stack } from '../../ui/stack.ts';
import { fakeInterface, laidOf, wordsOf } from '../../ui/uiForTests.ts';
import { tapToStart } from './tap.ts';

/** The page's own pointer and keys, heard as the tap to start listens for them. */
function page() {
  const heard = new Set<() => void>();
  Object.assign(globalThis, {
    addEventListener: (_kind: string, listener: () => void) => heard.add(listener),
    removeEventListener: (_kind: string, listener: () => void) => heard.delete(listener),
  });
  return heard;
}

const settle = async () => {
  for (let turn = 0; turn < 5; turn++) await Promise.resolve();
};

test('the tap to start waits for both the tap and the world, then fades and goes', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const heard = page();
    const clock = { now: 0 };
    const stack = new Stack();
    const { ui } = fakeInterface();
    const words = () => wordsOf(laidOf(stack.node(ui)));
    let loaded: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => (loaded = resolve));
    let started = false;
    void tapToStart(stack, ready, () => clock.now).then(() => (started = true));
    assert.ok(words().includes('OVERLOOK'));
    assert.ok(words().includes('CLICK OR PRESS ANY KEY TO START'));
    assert.equal(
      laidOf(stack.node(ui)).find((each) => each.node.id === 'story-tap')?.node.solid,
      true,
      'it takes the pointer',
    );
    for (const listener of heard) listener();
    await settle();
    assert.equal(heard.size, 0, 'a tap or a key is heard once');
    assert.ok(words().includes('LOADING'), 'tapped before the world is ready, it says it loads');
    assert.equal(started, false);
    loaded();
    await settle();
    assert.ok(started);
    clock.now = 0.6;
    const tap = laidOf(stack.node(ui)).find((each) => each.node.id === 'story-tap');
    assert.ok(tap && (tap.node.opacity ?? 1) < 1, 'fading');
    assert.equal(tap?.node.through, true, 'and lets the pointer through');
    mock.timers.tick(1300);
    assert.deepEqual(words(), [], 'gone');
  } finally {
    mock.timers.reset();
    Object.assign(globalThis, { addEventListener: undefined, removeEventListener: undefined });
  }
});
