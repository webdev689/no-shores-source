import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAGE, copyText, touchesHeld } from './page.ts';

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

test('words copied go to the clipboard, and a page without one copies nothing and throws nothing', async () => {
  const copied: string[] = [];
  const clipboard = { writeText: async (words: string) => void copied.push(words) };
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: clipboard, configurable: true });
  copyText('shoulder: 0.8');
  assert.deepEqual(copied, ['shoulder: 0.8']);
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: undefined, configurable: true });
  assert.doesNotThrow(() => copyText('lost'));
  const refusing = { writeText: () => Promise.reject(new Error('not allowed')) };
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: refusing, configurable: true });
  copyText('refused');
  await new Promise((resolve) => setTimeout(resolve, 0));
});
