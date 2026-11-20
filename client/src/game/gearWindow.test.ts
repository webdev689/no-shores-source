import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startGearWindow } from './gearWindow.ts';
import { OPEN_AT } from './gearScreen.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';

test('while the story plays the menu never opens, by its keys or when asked, so the keys stay with the story', () => {
  const { root, window } = fakePage();
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {}
    },
    setInterval: () => 0,
  });
  let resting = true;
  startGearWindow(
    root as never,
    null,
    () => null,
    () => null,
    () => null,
    () => resting,
  );
  const menu = root.all().find((node) => node.getAttribute('aria-label') === 'Menu');
  assert.ok(menu);
  const press = (key: string) => {
    const event = new FakeEvent('keydown', { key });
    event.target = root;
    window.dispatchEvent(event);
  };
  press('i');
  window.dispatchEvent(new FakeEvent(OPEN_AT, { detail: { view: 'inventory' } }));
  assert.equal(menu.hidden, true);
  resting = false;
  press('i');
  assert.equal(menu.hidden, false, 'once the story has ended, I opens it');
});
