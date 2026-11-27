import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRAVEL_FADE, TravelFade } from './travelFade.ts';

/** Runs a travel's fade in steps of `dt`, a binary fraction so they add up exactly, until it is done or `seconds` pass,
 *  the room answering `answer` once asked; the steps it passes through in order, when the travel was asked, and when
 *  control came back. */
function run(answer: 'taken' | 'refused', ready: () => boolean = () => true, seconds = 30, dt = 1 / 32) {
  const asked: number[] = [];
  let time = 0;
  const fade = new TravelFade('The Elmwater', () => asked.push(time));
  const steps: string[] = [fade.step];
  let control: number | null = null;
  while (time < seconds && fade.step !== 'done') {
    if (asked.length && !fade.answered) fade.answer(answer === 'taken' ? null : 'The room said no.');
    fade.advance(dt, ready());
    time += dt;
    if (steps.at(-1) !== fade.step) steps.push(fade.step);
    if (fade.control && control === null) control = time;
  }
  return { fade, steps, asked, control, time };
}

test('a travel fades out at once, the travel asked as it begins, waits black, fades in, and gives the ship back', () => {
  const { steps, asked, control } = run('taken');
  assert.deepEqual(steps, ['fade', 'black', 'lift', 'done']);
  assert.deepEqual(asked, [0], 'asked once, as the fade begins');
  const back = TRAVEL_FADE.fadeS + TRAVEL_FADE.blackLeastS + TRAVEL_FADE.liftS;
  assert.ok(
    control !== null && control >= back - 1e-9 && control < back + 0.2,
    `control back after the fade in: ${control}`,
  );
});

test('the black waits at least its least, and longer until the new waters are ready', () => {
  const readyAt = 9;
  let clock = 0;
  const { steps, control } = run('taken', () => (clock += 1 / 32) >= readyAt);
  assert.deepEqual(steps, ['fade', 'black', 'lift', 'done']);
  // The fade in begins within the step the waters were ready in.
  const ready = readyAt + TRAVEL_FADE.liftS - 1 / 32;
  assert.ok(control !== null && control >= ready, `waited for the waters: ${control}`);
});

test('a refused travel fades back in, with the reason, and gives the ship back', () => {
  const { fade, steps } = run('refused');
  assert.deepEqual(steps, ['fade', 'black', 'lift', 'done']);
  assert.equal(fade.refused, 'The room said no.');
});

test('the picture holds the helm’s view as it fades out and while black, and changes to the usual view only at black', () => {
  const fade = new TravelFade('The Elmwater', () => fade.answer(null));
  let [darkest, last] = [0, fade.helmShare];
  for (let frame = 0; frame < 200 && fade.step !== 'done'; frame++) {
    fade.advance(1 / 30, true);
    if (fade.helmShare !== last)
      assert.equal(fade.step === 'lift' && fade.dark > 0.99, true, `changed at ${fade.dark}`);
    [darkest, last] = [Math.max(darkest, fade.dark), fade.helmShare];
  }
  assert.equal(darkest, 1, 'it goes wholly black');
  assert.deepEqual([fade.dark, fade.helmShare], [0, 0], 'and fades in on the usual view');
});

test('the veil’s words say where the ship sails for while the picture is black', () => {
  const fade = new TravelFade('The Elmwater', () => undefined);
  assert.equal(fade.veil, null);
  fade.advance(TRAVEL_FADE.fadeS - 0.1, true);
  assert.equal(fade.veil, 'Sailing for The Elmwater');
});

test('the black waits on the waters no longer than its most, then fades in', () => {
  const { steps, control } = run('taken', () => false, 60);
  assert.deepEqual(steps, ['fade', 'black', 'lift', 'done']);
  assert.ok(control !== null && control <= TRAVEL_FADE.fadeS + TRAVEL_FADE.blackMostS + 3, `${control}`);
});
