import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAGE, touchesHeld } from './page.ts';

test('a link opens in a new tab, apart from the game', () => {
  const opened: unknown[][] = [];
  const before = globalThis.window;
  Object.assign(globalThis, { window: { open: (...given: unknown[]) => opened.push(given) } });
  try {
    PAGE.open('https://example.org/');
  } finally {
    Object.assign(globalThis, { window: before });
  }
  assert.deepEqual(opened, [['https://example.org/', '_blank', 'noopener']]);
});

test('a surface held keeps every touch from the page, and takes them back once let go', () => {
  const surface = { style: { touchAction: '' } };
  touchesHeld(surface, true);
  assert.equal(surface.style.touchAction, 'none');
  touchesHeld(surface, false);
  assert.equal(surface.style.touchAction, '');
});
