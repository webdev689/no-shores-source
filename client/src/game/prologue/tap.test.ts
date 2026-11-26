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
    assert.ok(
      laidOf(stack.node(ui)).some((each) => each.node.picture?.key === 'logo'),
      'the logo',
    );
    assert.match(laidOf(stack.node(ui)).find((each) => each.node.id === 'story-tap')?.node.label ?? '', /^No Shores\./);
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

test('while the tap to start stands, the key that taps it is its own', async () => {
  const heard = page();
  const { creationOpen, accountStep } = await import('./creation.ts');
  const stack = new Stack();
  void tapToStart(stack, new Promise(() => undefined));
  const left = new AbortController();
  void accountStep(stack, null, left.signal).catch(() => undefined);
  assert.equal(creationOpen(), false, 'the window under it takes no keys');
  for (const listener of [...heard]) listener();
  assert.equal(creationOpen(), true, 'tapped, the window takes them');
  left.abort();
  Object.assign(globalThis, { addEventListener: undefined, removeEventListener: undefined });
});

test('a window under the tap to start takes the focus only once it is tapped, so the tapping key presses nothing', async () => {
  const heard = page();
  const { accountStep } = await import('./creation.ts');
  const { fakeInterface } = await import('../../ui/uiForTests.ts');
  const stack = new Stack();
  const { ui, step } = fakeInterface();
  void tapToStart(stack, new Promise(() => undefined));
  const left = new AbortController();
  let ended = false;
  void accountStep(stack, null, left.signal).then(
    () => (ended = true),
    () => undefined,
  );
  step(() => stack.node(ui));
  assert.equal(ui.focusedId, null);
  for (const listener of [...heard]) listener();
  step(() => stack.node(ui), [{ kind: 'key', key: ' ' }]);
  await Promise.resolve();
  assert.equal(ended, false, 'the tapping key went on past nothing');
  assert.equal(ui.focusedId, 'creation-go-on', 'the way on has the focus after');
  left.abort();
  Object.assign(globalThis, { addEventListener: undefined, removeEventListener: undefined });
});

test('a pad button held as the title appears taps nothing; pressed anew, it taps', async () => {
  page();
  const pads = { pressed: true };
  Object.assign(navigator, { getGamepads: () => [{ buttons: [{ pressed: pads.pressed }] }] });
  try {
    const stack = new Stack();
    const { ui } = fakeInterface();
    let tapped = false;
    void tapToStart(stack, Promise.resolve()).then(() => (tapped = true));
    stack.node(ui);
    await settle();
    assert.equal(tapped, false, "a button held from before, as from the launcher's Play, taps nothing");
    pads.pressed = false;
    stack.node(ui);
    pads.pressed = true;
    stack.node(ui);
    await settle();
    assert.equal(tapped, true, 'pressed anew, it taps');
  } finally {
    Reflect.deleteProperty(navigator, 'getGamepads');
    Object.assign(globalThis, { addEventListener: undefined, removeEventListener: undefined });
  }
});
