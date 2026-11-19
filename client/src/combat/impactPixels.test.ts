import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bits, MOST_BITS } from './bits.ts';
import {
  CRACKED_SHIELD,
  STEEL,
  forksSprite,
  layFlat,
  layUpright,
  ringSprite,
  sixStarSprite,
  slashSprite,
  starSprite,
  tonguesSprite,
} from './impactPixels.ts';
import { ditherKeeps } from './markSprites.ts';
import { CLEAR, HOT, stopOf } from './spellPixels.ts';

const middleOf = (picture: { width: number; height: number }) => [(picture.width - 1) / 2, (picture.height - 1) / 2];
const count = (picture: { cells: Int8Array }) => picture.cells.filter((stop) => stop !== CLEAR).length;

test('a star is white-hot at its heart and reaches its radius along its four rays, made once', () => {
  const star = starSprite(8);
  const [column = 0, row = 0] = middleOf(star);
  assert.equal(stopOf(star, column, row), HOT);
  assert.notEqual(stopOf(star, column + 8, row), CLEAR);
  assert.equal(stopOf(star, column + 8, row + 8), CLEAR);
  assert.equal(starSprite(8), star, 'kept, not made again');
});

test('a ring lies at its radius, and a broken one keeps some of its sixteenths', () => {
  const ring = ringSprite(10, 2);
  const [column = 0, row = 0] = middleOf(ring);
  assert.equal(stopOf(ring, column + 10, row), 2);
  assert.equal(stopOf(ring, column, row), CLEAR);
  const broken = count(ringSprite(10, 2, 1, 0.5, 1));
  assert.ok(broken > 0 && broken < count(ringSprite(10, 2, 1)));
});

test('every shape is drawn in the four stops and nothing between', () => {
  const shapes = [slashSprite(3, 37, 3), tonguesSprite(0.5, 2, 1), forksSprite(15, 4, 0), sixStarSprite(9, 5, 1)];
  for (const shape of [...shapes, CRACKED_SHIELD])
    assert.ok(shape.cells.every((stop) => stop === CLEAR || (stop >= 0 && stop <= 3)));
  assert.ok(shapes.every((shape) => count(shape) > 0));
});

test('the ordered dither keeps its share of the cells', () => {
  let keptCells = 0;
  for (let row = 0; row < 8; row++)
    for (let column = 0; column < 8; column++) if (ditherKeeps(column, row, 0.5)) keptCells++;
  assert.equal(keptCells, 32);
});

test('a picture laid upright faces the eye; one laid flat lies over the ground', () => {
  const out: number[] = [];
  layUpright(out, starSprite(4), STEEL, [0, 0, 1], [0, 5, 1]);
  assert.ok(out.length > 0 && out.length % 7 === 0);
  for (let start = 0; start < out.length; start += 7)
    assert.ok(Math.abs(out[start + 1] ?? 1) < 1e-9, 'across the view');
  const flat: number[] = [];
  layFlat(flat, ringSprite(6, 1), STEEL, [0, 0, 2]);
  for (let start = 0; start < flat.length; start += 7) assert.ok(Math.abs((flat[start + 2] ?? 0) - 2.035) < 1e-9);
  const near: number[] = [];
  layUpright(near, starSprite(4), STEEL, [0, 0.3, 1], [0, 0, 1]);
  assert.equal(near.length, 0, 'too near the eye, left out');
});

test('bits cool a stop at a time, come to rest on their ground, and are capped', () => {
  const bits = new Bits(() => 0.5);
  bits.throw([0, 0, 1], [1, 0], 3, { ramp: STEEL, speed: [2, 2], life: [1, 1], floor: 0.5 });
  for (let frame = 0; frame < 30; frame++) bits.update(1 / 60);
  assert.ok(
    bits.flying.every((bit) => bit.z === 0.5 && bit.up === 0),
    'resting',
  );
  bits.update(0.6);
  assert.equal(bits.flying.length, 0);
  bits.throw([0, 0, 1], [0, 0], MOST_BITS + 50, { ramp: STEEL, speed: [1, 1], life: [1, 1] });
  assert.equal(bits.flying.length, MOST_BITS);
});
