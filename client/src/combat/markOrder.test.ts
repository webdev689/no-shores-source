import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_FLOATS, ditherCode } from './marks.ts';
import { MarkOrder } from './markOrder.ts';

/** A triangle at `y` metres north of the origin, of opacity `opacity`, its red its own number. */
const triangle = (y: number, opacity: number, number: number): number[] =>
  [0, 1, 2].flatMap((corner) => [corner * 0.1, -y, 0, number, 0, 0, opacity]);

test('solid marks come first in the order given, the see-through after them, far to near from the eye', () => {
  const marks = [
    ...triangle(2, 0.5, 1),
    ...triangle(5, 1, 2),
    ...triangle(9, -1, 3),
    ...triangle(1, ditherCode(0.25), 4),
    ...triangle(4, 0.3, 5),
  ];
  const { laid, solid, clear } = new MarkOrder().lay(marks, [0, 0, 0]);
  assert.equal(solid, 6, 'the whole one and the dithered one');
  assert.equal(clear, 9);
  const numbers = Array.from(
    { length: laid.length / (3 * MARK_FLOATS) },
    (unused, index) => laid[index * 3 * MARK_FLOATS + 3],
  );
  assert.deepEqual(numbers, [2, 4, 3, 5, 1]);
});

test('a triangle with one see-through corner is see-through, and the order keeps no more than it is given', () => {
  const order = new MarkOrder();
  const mixed = triangle(3, 1, 1);
  mixed[6 + MARK_FLOATS] = 0.9;
  assert.equal(order.lay(mixed, [0, 0, 0]).clear, 3);
  const twice = order.lay([...triangle(3, 1, 1), ...triangle(4, 1, 2)], [0, 0, 0]);
  assert.equal(twice.laid.length, 6 * MARK_FLOATS);
  assert.equal(order.lay([], [0, 0, 0]).laid.length, 0);
});
