import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAGE, copyText, openFile, saveFile, touchesHeld } from './page.ts';

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

/** A page of one kind of element, which remembers what was made and clicked. */
function fakePage() {
  const made: Record<string, unknown>[] = [];
  const page = globalThis as unknown as Record<string, unknown>;
  const element = () => {
    const listeners = new Map<string, () => void>();
    const one: Record<string, unknown> = {
      clicked: 0,
      addEventListener: (kind: string, run: () => void) => listeners.set(kind, run),
      click: () => (one['clicked'] = Number(one['clicked']) + 1),
      fire: (kind: string) => listeners.get(kind)?.(),
    };
    made.push(one);
    return one;
  };
  page['document'] = { createElement: element };
  return {
    made,
    done: () => {
      delete page['document'];
    },
  };
}

test('a file to save is handed over as a download of its words under its name', () => {
  const { made, done } = fakePage();
  const urls: Blob[] = [];
  const { createObjectURL, revokeObjectURL } = URL;
  URL.createObjectURL = (blob: Blob) => (urls.push(blob), 'blob:layout');
  URL.revokeObjectURL = () => undefined;
  saveFile('{}', 'layout.json');
  [URL.createObjectURL, URL.revokeObjectURL] = [createObjectURL, revokeObjectURL];
  done();
  assert.equal(made.length, 1);
  assert.equal(made[0]?.['download'], 'layout.json');
  assert.equal(made[0]?.['clicked'], 1);
  assert.equal(urls[0]?.type, 'application/json');
});

test('a file opened answers its words, and a chooser closed with none answers null', async () => {
  const { made, done } = fakePage();
  const opened = openFile('.json');
  const chooser = made[0] as { accept: string; files: unknown; fire: (kind: string) => void; clicked: number };
  assert.equal(chooser.accept, '.json');
  assert.equal(chooser.clicked, 1, 'the chooser opens at once');
  chooser.files = [{ text: () => Promise.resolve('{ "continents": [] }') }];
  chooser.fire('change');
  assert.equal(await opened, '{ "continents": [] }');
  const none = openFile('.json');
  (made[1] as { fire: (kind: string) => void }).fire('cancel');
  assert.equal(await none, null);
  done();
});
