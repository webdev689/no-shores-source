import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openFile, saveFile } from './page.ts';

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
