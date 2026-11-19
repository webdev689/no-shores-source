import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEEL } from '../combat/attackFeel.ts';
import { feelLine, feelOf } from './feelPanel.ts';

test('the kept feel reads back, each number held to its slider and each switch a switch; anything else is as made', () => {
  assert.deepEqual(
    feelOf(
      JSON.stringify({ arc: false, arcBrightness: 1.5, kickStrength: 9, lungeDistance: -1, stop: 'no', light: 1 }),
    ),
    {
      ...FEEL,
      arc: false,
      arcBrightness: 1.5,
      kickStrength: 2.5,
      lungeDistance: 0,
    },
  );
  assert.deepEqual(feelOf(null), FEEL);
  assert.equal(feelOf(JSON.stringify({ glowLook: 2 })).glowLook, 2);
  assert.equal(feelOf(JSON.stringify({ glowLook: 7 })).glowLook, 0, 'no such element');
  assert.deepEqual(feelOf('not a feel'), FEEL);
  assert.equal(
    feelLine({ ...FEEL, kick: false, arcTrail: 1.4 }),
    'Swing arc: brightness 1, trail 1.4; Hit-stop: length 1; Camera kick: off; Lunge: distance 1; Element glow: own gear; ' +
      'Light: on',
  );
});

test('the light is on as made, and a kept switch turns it off', () => {
  assert.equal(FEEL.light, true);
  assert.equal(feelOf(JSON.stringify({ light: false })).light, false);
  assert.equal(feelOf(JSON.stringify({ light: 'off' })).light, true, 'not a switch');
  assert.match(feelLine({ ...FEEL, light: false }), /; Light: off$/);
});
