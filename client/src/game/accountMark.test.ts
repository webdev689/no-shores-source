import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headOf } from './accountMark.ts';

/** A figure 30 wide and 60 tall: a head 6 wide at the top, centred at 17, and a body under it 20 wide. */
function figure(): { width: number; height: number; pixels: Uint8ClampedArray } {
  const [width, height] = [30, 60];
  const pixels = new Uint8ClampedArray(width * height * 4);
  const fill = (west: number, north: number, across: number, down: number) => {
    for (let row = north; row < north + down; row++)
      for (let column = west; column < west + across; column++) pixels[(row * width + column) * 4 + 3] = 255;
  };
  fill(14, 5, 6, 8);
  fill(7, 13, 20, 47);
  return { width, height, pixels };
}

test("a figure's head is the square at the top of what is drawn, centred on the head's own rows", () => {
  const head = headOf(figure());
  assert.ok(head);
  assert.equal(head.width, head.height);
  assert.equal(head.width, 11, 'a fifth of the 55 rows drawn');
  // The head's six columns stand in the middle of the crop, not the body's twenty.
  const row = 3;
  const drawn = [...Array(head.width).keys()].filter(
    (column) => (head.pixels[(row * head.width + column) * 4 + 3] ?? 0) > 0,
  );
  assert.equal(drawn.length, 6);
  const [first = 0, last = 0] = [drawn[0], drawn.at(-1)];
  assert.ok(Math.abs(first - (head.width - 1 - last)) <= 1, `centred within a pixel: ${drawn.join(',')}`);
  assert.equal(headOf({ width: 4, height: 4, pixels: new Uint8ClampedArray(64) }), null, 'nothing drawn');
});
