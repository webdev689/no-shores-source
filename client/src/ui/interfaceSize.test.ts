import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interfaceScale, interfaceSize, setInterfaceSize, sizesOffered } from './interfaceSize.ts';

test("the interface's size is Auto's, the screen's ratio to a whole pixel, until a whole size is chosen", () => {
  assert.equal(interfaceSize(), 'auto');
  assert.deepEqual([interfaceScale(1), interfaceScale(1.5), interfaceScale(2)], [1, 2, 2]);
  setInterfaceSize('2');
  assert.deepEqual([interfaceScale(1), interfaceScale(2)], [2, 2], 'chosen, as a player asked, whatever the screen');
  setInterfaceSize('auto');
});

test('a size is offered where it leaves the view at least 960 by 540, and the one chosen always', () => {
  const words = (width: number, height: number) => sizesOffered(width, height).map((size) => size.words);
  assert.deepEqual(words(1920, 1080), ['Auto', '1x', '2x']);
  assert.deepEqual(words(2560, 1440), ['Auto', '1x', '2x']);
  assert.deepEqual(words(3840, 2160), ['Auto', '1x', '2x', '3x', '4x']);
  setInterfaceSize('3');
  assert.deepEqual(words(1920, 1080), ['Auto', '1x', '2x', '3x']);
  setInterfaceSize('auto');
});
