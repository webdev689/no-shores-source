import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Shot } from '../camera.ts';
import type { Story } from './story.ts';
import { wispAt, wispCourse } from './wispCourse.ts';
import { WispScene } from './wispScene.ts';
import { courseOf, readWreck, topAt } from './wreckLayout.ts';

const layout = readWreck();
const [x, y] = layout.wake.at;
const feet = [x, y, topAt(courseOf(layout), x, y)] as const;
const story = {
  stage: {
    parts: { ambience: { flash: () => undefined, thunder: () => undefined }, flames: { wind: [0, 0] } },
    play: async () => undefined,
    wind: () => [0, 0],
  },
} as unknown as Story;
/** The player's own shot over their shoulder, as the wisp's coming begins from it. */
const theirs: Shot = { eye: [x, y + 2, feet[2] + 2], yaw: 0, pitch: 0.2, fov: 0.87, near: 0.1, far: 60000 };

test('the wisp is seen near from its first moment, out over the sea: the camera cuts to it, not a pan from the player', () => {
  const scene = new WispScene(story, layout, { feet, facing: layout.wake.facing }, theirs, () => undefined);
  const course = wispCourse(feet, layout.wake.facing, layout);
  let before = 0;
  for (const seconds of [0.05, 0.3, 0.6, 1]) {
    const { shot } = scene.frame(seconds - before, seconds, theirs, feet);
    before = seconds;
    const { at } = wispAt(course, seconds);
    const apart = Math.hypot(at[0] - shot.eye[0], at[1] - shot.eye[1], at[2] - shot.eye[2]);
    assert.ok(apart < 5, `${apart.toFixed(1)} m from it at ${seconds} s`);
  }
});

test('its camera keeps out of the smoke as it is drawn, leaning in the fires’ own wind, not the weather’s', () => {
  const told = (weather: readonly [number, number], smoke: readonly [number, number]) =>
    ({
      stage: {
        parts: { ambience: { flash: () => undefined, thunder: () => undefined }, flames: { wind: smoke } },
        play: async () => undefined,
        wind: () => weather,
      },
    }) as unknown as Story;
  const [stormy, calm] = [told([14, 6], [0, 0]), told([0, 0], [0, 0])].map(
    (each) => new WispScene(each, layout, { feet, facing: layout.wake.facing }, theirs, () => undefined, 5),
  );
  for (let seconds = 5; seconds < 10; seconds += 0.25) {
    const [one, two] = [stormy, calm].map((scene) => scene?.frame(0.25, seconds, theirs, feet).shot.eye);
    assert.deepEqual(one, two, `the same shot at ${seconds.toFixed(2)} s`);
  }
});
