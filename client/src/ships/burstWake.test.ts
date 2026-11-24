import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOW_SPRAY_RATE, BurstWake, SURGE_SPRAY, WAKE_RATE } from './burstWake.ts';
import { Effects } from './effects.ts';

const SHIP = { anchor: [10, 20, 0] as const, heading: 0, halfLength: 8 };

test('a burst heaves spray off both bows and foam astern as it begins, a wake while it runs, and settles as it ends', () => {
  const effects = new Effects(3);
  const wake = new BurstWake(effects, 3);
  wake.frame(0, SHIP, 0, 0, 1 / 60);
  assert.equal(effects.count, 0, 'nothing while it does not burst');
  wake.frame(0, SHIP, 1, 0, 0);
  assert.equal(effects.count, 2 * SURGE_SPRAY + 1, 'a sheet off each bow and a ring of foam');
  const begun = effects.count;
  for (let frame = 1; frame <= 60; frame++) wake.frame(0, SHIP, 1 - frame / 240, frame / 60, 1 / 60);
  const ran = effects.count - begun;
  assert.ok(Math.abs(ran - (2 * BOW_SPRAY_RATE + WAKE_RATE)) <= 3, `a second's spray and wake: ${ran}`);
  const marks = effects.marks(1);
  const foam = marks.filter((mark) => mark.flat);
  assert.ok(foam.length >= WAKE_RATE, 'the wake lies on the water');
  // The wake is laid astern: south of a ship heading north.
  assert.ok(
    foam.every((mark) => mark.y > SHIP.anchor[1]),
    'astern',
  );
  const running = effects.count;
  wake.frame(0, SHIP, 0, 1.02, 1 / 60);
  assert.ok(effects.count > running, 'a last fall of spray and foam as it settles');
  const settled = effects.count;
  wake.frame(0, SHIP, 0, 1.04, 1 / 60);
  assert.equal(effects.count, settled, 'and nothing more once it is over');
});
