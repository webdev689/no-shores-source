import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOW_RAMPS } from '../elementGlow.ts';
import { SCENE_STEPS, SCENE_STEP_MS, STILL_STEP, paintScene, sceneFrame, sceneOf, sceneStep } from './artScenes.ts';

const ARTS = [
  ['storm', 2],
  ['divine', 1],
  ['shadow', 3],
] as const;
const [COLS, ROWS, FOCUS] = [200, 100, 160];

test('the scene steps a few times a second, round a loop, and holds one step with less motion', () => {
  assert.equal(sceneStep(0, false), 0);
  assert.equal(sceneStep(SCENE_STEP_MS - 1, false), 0);
  assert.equal(sceneStep(SCENE_STEP_MS, false), 1);
  assert.equal(sceneStep(SCENE_STEP_MS * SCENE_STEPS, false), 0, 'the loop comes round');
  assert.equal(sceneStep(SCENE_STEP_MS * 7, true), STILL_STEP);
  assert.ok(1000 / SCENE_STEP_MS <= 8, 'no more than eight steps a second');
});

test('every cell is one of the Art’s four stops or none, painted in its ramp', () => {
  for (const [art, element] of ARTS) {
    const scene = sceneOf(art, COLS, ROWS, FOCUS);
    const tones = sceneFrame(scene, STILL_STEP);
    assert.equal(tones.length, COLS * ROWS);
    assert.ok(
      tones.every((tone) => tone <= 4),
      art,
    );
    assert.ok(
      tones.some((tone) => tone === 4),
      `${art} has a white-hot heart`,
    );
    const pixels = new Uint8ClampedArray(tones.length * 4);
    paintScene(tones, element, pixels);
    const stops = GLOW_RAMPS[element].map((stop) => stop.map((channel) => Math.round(channel * 255)).join(','));
    for (let cell = 0; cell < tones.length; cell += 97) {
      const [red, green, blue, alpha] = pixels.slice(cell * 4, cell * 4 + 4);
      if (tones[cell] === 0) assert.equal(alpha, 0);
      else assert.equal(`${red},${green},${blue}`, stops[(tones[cell] ?? 1) - 1]);
    }
  }
});

test('each scene moves from step to step and comes back to where it began after a loop', () => {
  for (const [art] of ARTS) {
    const scene = sceneOf(art, COLS, ROWS, FOCUS);
    const first = sceneFrame(scene, 0);
    assert.notDeepEqual(sceneFrame(scene, 1), first, `${art} moves`);
    assert.deepEqual(sceneFrame(scene, SCENE_STEPS), first, `${art} loops`);
    assert.deepEqual(sceneFrame(sceneOf(art, COLS, ROWS, FOCUS), 0), first, `${art} is the same each time it is made`);
  }
});

test('the scene fades out toward the left, where the screen’s words stand, and an unknown Art is empty', () => {
  for (const [art] of ARTS) {
    const tones = sceneFrame(sceneOf(art, COLS, ROWS, FOCUS), 0);
    for (let y = 0; y < ROWS; y++) assert.equal(tones.subarray(y * COLS, y * COLS + 40).some(Boolean), false, art);
  }
  assert.ok(sceneFrame(sceneOf('none', 20, 10, 15), 0).every((tone) => tone === 0));
});
