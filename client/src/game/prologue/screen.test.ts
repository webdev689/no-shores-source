import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FakeElement, fakePage } from '../pageForTests.ts';
import { Screen } from '../../cinema/screen.ts';

const byTouch = (touch: boolean) =>
  Object.assign(globalThis, { matchMedia: (query: string) => ({ matches: touch && query === '(pointer: coarse)' }) });

test('played by touch, the skip is a hold on the view; with keys, a hold on Space', () => {
  for (const [touch, words] of [
    [true, 'Hold to skip'],
    [false, 'Hold Space to skip'],
  ] as const) {
    byTouch(touch);
    const { root } = fakePage();
    new Screen(root as never, new FakeElement('canvas') as never);
    assert.ok(root.find(words), words);
  }
  Object.assign(globalThis, { matchMedia: undefined });
});

test("while the screen stands, a touch on the view is the story's and the blur follows each frame at once", () => {
  const { root } = fakePage();
  const canvas = new FakeElement('canvas');
  const screen = new Screen(root as never, canvas as never);
  assert.equal(canvas.style['touchAction'], 'none', 'no drag on the view pans or reloads the page');
  assert.equal(root.style['touchAction'], 'none', 'nor one on the dialogue box over it');
  screen.blur(6);
  assert.equal(canvas.style['filter'], 'blur(6.0px)');
  screen.blur(0);
  assert.equal(canvas.style['filter'], '');
  screen.remove();
  assert.equal(canvas.style['touchAction'], '');
  assert.equal(root.style['touchAction'], '');
});
