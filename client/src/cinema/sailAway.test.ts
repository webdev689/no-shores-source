import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAIL_AWAY, SailAway } from './sailAway.ts';

/** Runs a travel's fade in steps of `dt` until it is done or `seconds` pass, the room answering `answer` once asked;
 *  the steps it passes through in order, when the travel was asked, and when control came back. */
function run(answer: 'taken' | 'refused', ready: () => boolean = () => true, seconds = 30, dt = 0.05) {
  const asked: number[] = [];
  let time = 0;
  const away = new SailAway('The Elmwater', () => asked.push(time));
  const steps: string[] = [away.step];
  let control: number | null = null;
  while (time < seconds && away.step !== 'done') {
    if (asked.length && !away.answered) away.answer(answer === 'taken' ? null : 'The room said no.');
    away.advance(dt, ready());
    time += dt;
    if (steps.at(-1) !== away.step) steps.push(away.step);
    if (away.control && control === null) control = time;
  }
  return { away, steps, asked, control, time };
}

test('a travel fades out at once, the travel asked as it begins, waits black, fades in, and gives the ship back', () => {
  const { steps, asked, control } = run('taken');
  assert.deepEqual(steps, ['fade', 'black', 'lift', 'done']);
  assert.deepEqual(asked, [0], 'asked once, as the fade begins');
  const back = SAIL_AWAY.fadeS + SAIL_AWAY.blackLeastS + SAIL_AWAY.liftS;
  assert.ok(
    control !== null && control >= back - 1e-9 && control < back + 0.2,
    `control back after the fade in: ${control}`,
  );
});

test('the black waits at least its least, and longer until the new waters are ready', () => {
  const readyAt = 9;
  let clock = 0;
  const { steps, control } = run('taken', () => (clock += 0.05) >= readyAt);
  assert.deepEqual(steps, ['fade', 'black', 'lift', 'done']);
  assert.ok(control !== null && control >= readyAt + SAIL_AWAY.liftS, `waited for the waters: ${control}`);
});

test('a refused travel fades back in, with the reason, and gives the ship back', () => {
  const { away, steps } = run('refused');
  assert.deepEqual(steps, ['fade', 'black', 'lift', 'done']);
  assert.equal(away.refused, 'The room said no.');
});

test('the picture holds the helm’s view as it fades out and while black, and changes to the usual view only at black', () => {
  const away = new SailAway('The Elmwater', () => away.answer(null));
  let [darkest, last] = [0, away.helmShare];
  for (let frame = 0; frame < 200 && away.step !== 'done'; frame++) {
    away.advance(1 / 30, true);
    if (away.helmShare !== last)
      assert.equal(away.step === 'lift' && away.dark > 0.99, true, `changed at ${away.dark}`);
    [darkest, last] = [Math.max(darkest, away.dark), away.helmShare];
  }
  assert.equal(darkest, 1, 'it goes wholly black');
  assert.deepEqual([away.dark, away.helmShare], [0, 0], 'and fades in on the usual view');
});

test('the veil’s words say where the ship sails for while the picture is black', () => {
  const away = new SailAway('The Elmwater', () => undefined);
  assert.equal(away.veil, null);
  away.advance(SAIL_AWAY.fadeS - 0.1, true);
  assert.equal(away.veil, 'Sailing for The Elmwater');
});

test('the black waits on the waters no longer than its most, then fades in', () => {
  const { steps, control } = run('taken', () => false, 60);
  assert.deepEqual(steps, ['fade', 'black', 'lift', 'done']);
  assert.ok(control !== null && control <= SAIL_AWAY.fadeS + SAIL_AWAY.blackMostS + 3, `${control}`);
});
