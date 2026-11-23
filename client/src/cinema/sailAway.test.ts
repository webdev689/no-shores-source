import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAIL_AWAY, SailAway } from './sailAway.ts';

/** A ship at the world's middle heading east, and an eye at its helm a little aft and up. */
const lying = { x: 1_000, y: 2_000, heading: Math.PI / 2 };
const helm = { eye: [994, 2_000, 4] as [number, number, number], yaw: Math.PI / 2, pitch: 0.1, fov: 1 };

/** Runs a sail away in steps of `dt` until it is done or `seconds` pass, the room answering `answer` once asked;
 *  the steps it passes through in order, when the travel was asked, and when control came back. */
function run(answer: 'taken' | 'refused', ready: () => boolean = () => true, seconds = 30, dt = 0.05) {
  const asked: number[] = [];
  let time = 0;
  const away = new SailAway('The Elmwater', () => asked.push(time));
  const steps: string[] = [away.step];
  let control: number | null = null;
  while (time < seconds && away.step !== 'done') {
    time += dt;
    if (asked.length && !away.answered) away.answer(answer === 'taken' ? null : 'The room said no.');
    away.advance(dt, ready());
    away.shot(lying, helm);
    if (steps.at(-1) !== away.step) steps.push(away.step);
    if (away.control && control === null) control = time;
  }
  return { away, steps, asked, control, time };
}

test('the sail away runs out on its rail, fades, waits black, arrives, and gives the ship back', () => {
  const { steps, asked, control } = run('taken');
  assert.deepEqual(steps, ['out', 'fade', 'black', 'arrive', 'back', 'done']);
  assert.equal(asked.length, 1, 'the travel is asked once');
  assert.ok(Math.abs(asked[0]! - SAIL_AWAY.outS) < 0.11, `asked as the fade begins: ${asked[0]}`);
  const arrived = SAIL_AWAY.outS + SAIL_AWAY.fadeS + SAIL_AWAY.blackLeastS + SAIL_AWAY.arriveS;
  assert.ok(control !== null && control >= arrived, `control back only after the arrival: ${control}`);
});

test('the black waits at least its least, and longer until the new waters are ready', () => {
  const readyAt = 9;
  let clock = 0;
  const { steps, control } = run('taken', () => (clock += 0.05) >= readyAt);
  assert.deepEqual(steps, ['out', 'fade', 'black', 'arrive', 'back', 'done']);
  assert.ok(control !== null && control >= readyAt + SAIL_AWAY.arriveS, `waited for the waters: ${control}`);
});

test('a refused travel fades back in where the ship was, with the reason, and gives the ship back', () => {
  const { away, steps } = run('refused');
  assert.deepEqual(steps, ['out', 'fade', 'black', 'back', 'done']);
  assert.equal(away.refused, 'The room said no.');
});

test('the picture is never cut but at black: the eye moves no more than its rail allows between frames', () => {
  const asked: boolean[] = [];
  const away = new SailAway('The Elmwater', () => asked.push(true));
  let last = away.shot(lying, helm);
  const off = Math.hypot(...last.near.eye.map((value, axis) => value - helm.eye[axis]!));
  assert.ok(off < 1e-6, `it leaves from the helm: ${off} m off`);
  let darkest = 0;
  for (let frame = 0; frame < 400 && away.step !== 'done'; frame++) {
    if (asked.length) away.answer(null);
    away.advance(1 / 30, true);
    const shot = away.shot(lying, helm);
    const moved = Math.hypot(...shot.near.eye.map((value, axis) => value - last.near.eye[axis]!));
    darkest = Math.max(darkest, away.dark);
    if (away.dark < 1 && last.share > 0 && shot.share > 0) assert.ok(moved < 15, `a cut of ${moved} m at ${frame}`);
    last = shot;
  }
  assert.equal(darkest, 1, 'it goes wholly black');
  assert.equal(away.dark, 0, 'and lifts');
});

test('the veil’s words say where the ship sails for while the picture is black', () => {
  const away = new SailAway('The Elmwater', () => undefined);
  assert.equal(away.veil, null);
  away.advance(SAIL_AWAY.outS + SAIL_AWAY.fadeS - 0.1, true);
  assert.equal(away.veil, 'Sailing for The Elmwater');
});

test('the black waits on the waters no longer than its most, then arrives', () => {
  const { steps, control } = run('taken', () => false, 60);
  assert.deepEqual(steps, ['out', 'fade', 'black', 'arrive', 'back', 'done']);
  assert.ok(control !== null && control <= SAIL_AWAY.outS + SAIL_AWAY.fadeS + SAIL_AWAY.blackMostS + 6, `${control}`);
});
