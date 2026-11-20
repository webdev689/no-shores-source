import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startGearWindow } from './gearWindow.ts';
import { holdOn } from './gearDom.ts';
import { OPEN_AT, STEP_BACK } from './gearScreen.ts';
import { FakeElement, FakeEvent, fakePage } from './pageForTests.ts';

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

test('Escape lets go of a hold under way, even where the page shown takes the step back itself', async () => {
  const { root, window } = fakePage();
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {}
    },
    setInterval: () => 0,
  });
  startGearWindow(
    root as never,
    null,
    () => null,
    () => null,
    () => null,
    () => false,
  );
  window.dispatchEvent(new FakeEvent(OPEN_AT, { detail: { view: 'inventory' } }));
  const body = root.all().find((node) => node.getAttribute('aria-labelledby') !== null);
  assert.ok(body);
  // A page with a step of its own, as a keeper's screen closing its choice of fragments.
  const shown = new FakeElement('div');
  shown.addEventListener(STEP_BACK, (event) => event.preventDefault());
  body.prepend(shown);
  const held = new FakeElement('button');
  shown.append(held);
  let bought = false;
  holdOn(held as never, () => (bought = true), { holdMs: 5 });
  const escape = new FakeEvent('keydown', { key: 'Escape' });
  escape.target = root;
  window.dispatchEvent(escape);
  await new Promise((done) => setTimeout(done, 30));
  assert.equal(bought, false, 'the step back let go of the hold');
});
