import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boltPath } from './bolts.ts';
import { fallingOf } from './fall.ts';
import { AFTERNOON } from './skyUniform.ts';

const strike = { x: 1000, y: 2000, atS: 50.25, toGround: true, power: 0.8 };

test('a bolt to the ground runs from the cloud base to the strike, and every browser draws it alike', () => {
  const path = boltPath(strike, 900, 12);
  assert.deepEqual(path, boltPath(strike, 900, 12), 'the same strike makes the same bolt');
  const main = path.filter(([, , brightness]) => brightness === 1);
  assert.equal(main[0]?.[0][2], 900, 'it leaves the cloud base');
  assert.deepEqual(main.at(-1)?.[1], [1000, 2000, 12], 'it lands where the strike fell');
  assert.ok(
    path.some(([, , brightness]) => brightness < 1),
    'it has branches',
  );
  assert.notDeepEqual(boltPath({ ...strike, atS: 51 }, 900, 12), path, 'another strike makes another bolt');
});

test('a bolt in the cloud runs across under the base and never reaches the ground', () => {
  const path = boltPath({ ...strike, toGround: false }, 900, 12);
  assert.ok(path.every(([from, to]) => from[2] > 900 && to[2] > 900));
});

test('the fall is shared between rain and snow by the snow share, and sand comes on its own', () => {
  const falling = fallingOf({ ...AFTERNOON, falling: 0.8, snowShare: 0.25, sand: 0.4 });
  assert.ok(Math.abs(falling.rain - 0.6) < 1e-9 && Math.abs(falling.snow - 0.2) < 1e-9 && falling.sand === 0.4);
});
