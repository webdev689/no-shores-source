import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Aimed, fightPointer } from './fightPointer.ts';

/** A canvas the test presses on: it writes down each pointer it is asked to hold. */
function canvased() {
  const held: number[] = [];
  const canvas = Object.assign(new EventTarget(), {
    setPointerCapture: (id: number) => void held.push(id),
  }) as unknown as HTMLCanvasElement;
  const press = (type: string, button = 0) =>
    canvas.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { button, pointerId: 7 }));
  return { canvas, held, press };
}

function fought() {
  const done: string[] = [];
  const fight: Aimed = {
    aim: (held) => void done.push(held ? 'aim' : 'fire'),
    holdFire: () => void done.push('hold'),
    drag: () => void done.push('drag'),
    wheel: () => undefined,
  };
  return { fight, done };
}

test('a press holds the pointer to the canvas, so a button let go off it still comes up there', () => {
  const { canvas, held, press } = canvased();
  const { fight, done } = fought();
  fightPointer(canvas, () => fight);
  press('pointerdown', 2);
  assert.deepEqual(held, [7]);
  press('pointerup', 2);
  assert.deepEqual(done, ['aim', 'fire']);
});

test('an aim whose pointer is lost unreleased is let go unfired, and the next aim fires on its own release', () => {
  const { canvas, press } = canvased();
  const { fight, done } = fought();
  fightPointer(canvas, () => fight);
  press('pointerdown', 2);
  press('lostpointercapture');
  press('pointermove');
  assert.deepEqual(done, ['aim', 'hold'], 'no drag after the pointer is lost either');
  press('pointerdown', 2);
  press('pointerup', 2);
  press('lostpointercapture');
  assert.deepEqual(done, ['aim', 'hold', 'aim', 'fire']);
});
