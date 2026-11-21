import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyText } from './page.ts';

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
