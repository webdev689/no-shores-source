import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENGULF_AT_S, FLASH_IN_S, WISP_LENGTH_S, WISP_S } from './wisp.ts';
import { chaseShot, clearBetween, ringEye, solidAt, wispAt, wispCourse } from './wispCourse.ts';
import { courseOf, inArea, readWreck, topAt } from './wreckLayout.ts';

const layout = readWreck();
const course = courseOf(layout);
const quiet = layout.zones[0]?.area ?? [0, 0, 0, 0];
const STEP = 1 / 60;

/** Where a player may stand on the quiet deck: along the path through it a metre apart, and where they wake, each
 *  facing four ways. */
function standing(): { feet: readonly [number, number, number]; facing: number }[] {
  const places: (readonly [number, number])[] = [layout.wake.at];
  for (const [index, point] of layout.path.entries()) {
    const next = layout.path[index + 1];
    if (!next) break;
    const length = Math.hypot(next[0] - point[0], next[1] - point[1]);
    for (let metres = 0; metres < length; metres += 1) {
      const share = metres / length;
      const place = [point[0] + (next[0] - point[0]) * share, point[1] + (next[1] - point[1]) * share] as const;
      if (inArea(quiet, place[0], place[1])) places.push(place);
    }
  }
  const facings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  return places.flatMap(([x, y]) => facings.map((facing) => ({ feet: [x, y, topAt(course, x, y)] as const, facing })));
}
const PLACES = standing();
const nearAny = (x: number, y: number, metres: number) =>
  course.some(
    (block) => x > block.minX - metres && x < block.maxX + metres && y > block.minY - metres && y < block.maxY + metres,
  );

test('the quiet deck is stood on at many places for these tests', () => {
  assert.ok(PLACES.length > 40, `${PLACES.length}`);
  assert.ok(layout.masts.length > 0 && layout.masts.every(([x, y]) => inArea(quiet, x, y)), 'its mast on it');
});

test('the wisp comes in over the sea, clear of the wreck, wherever on the quiet deck the player stands', () => {
  for (const { feet, facing } of PLACES) {
    const flown = wispCourse(feet, facing, layout);
    const { at } = wispAt(flown, 0);
    assert.ok(!nearAny(at[0], at[1], 2), `from ${at.map((value) => value.toFixed(1)).join(', ')}: over the sea`);
    assert.ok(Math.hypot(at[0] - feet[0], at[1] - feet[1]) > 20, 'far out');
  }
});

test('it wanders the quiet deck round its mast, then circles the player and engulfs them at the chest', () => {
  const [mastX, mastY] = layout.masts[0] ?? [0, 0];
  for (const { feet, facing } of PLACES.filter((unused, index) => index % 7 === 0)) {
    const flown = wispCourse(feet, facing, layout);
    let byMast = 0;
    for (let seconds = WISP_S.drift; seconds < WISP_S.drift + WISP_S.wander; seconds += 0.1) {
      const { at, part } = wispAt(flown, seconds);
      assert.equal(part, 'wander');
      if (Math.hypot(at[0] - mastX, at[1] - mastY) < 3.5) byMast++;
      assert.ok(inArea([quiet[0] - 3, quiet[1] - 3, quiet[2] + 3, quiet[3] + 3], at[0], at[1]), 'over the quiet deck');
    }
    assert.ok(byMast >= 10, `round the mast: ${byMast} of its moments`);
    const engulfed = wispAt(flown, ENGULF_AT_S + FLASH_IN_S).at;
    assert.ok(Math.hypot(engulfed[0] - feet[0], engulfed[1] - feet[1]) < 0.05, 'over their feet');
    assert.ok(Math.abs(engulfed[2] - feet[2] - 1.15) < 0.05, 'at their chest');
  }
});

test('it never passes through a solid of the wreck, nor jumps from frame to frame', () => {
  for (const { feet, facing } of PLACES) {
    const flown = wispCourse(feet, facing, layout);
    let last = wispAt(flown, 0).at;
    for (let seconds = 0; seconds < ENGULF_AT_S + WISP_S.engulf; seconds += STEP) {
      const { at } = wispAt(flown, seconds);
      const own = Math.hypot(at[0] - feet[0], at[1] - feet[1]) < 0.4;
      assert.ok(
        own || !solidAt(course, at),
        `in a solid at ${seconds.toFixed(2)} s: ${at.map((value) => value.toFixed(2))}`,
      );
      const step = Math.hypot(at[0] - last[0], at[1] - last[1], at[2] - last[2]);
      assert.ok(step < 0.5, `${step.toFixed(2)} m in a frame at ${seconds.toFixed(2)} s`);
      last = at;
    }
  }
});

test('the ring camera sees the player and the wisp clear of the wreck throughout the rings and the engulfing', () => {
  for (const { feet, facing } of PLACES) {
    const flown = wispCourse(feet, facing, layout);
    const eye = ringEye(flown);
    const chest = [feet[0], feet[1], feet[2] + 1.15] as const;
    assert.ok(!solidAt(course, eye), 'not inside the wreck');
    assert.ok(clearBetween(course, eye, chest), `the player seen from ${eye.map((value) => value.toFixed(1))}`);
    for (let seconds = WISP_S.drift + WISP_S.wander; seconds < ENGULF_AT_S + WISP_S.engulf; seconds += 0.05)
      assert.ok(clearBetween(course, eye, wispAt(flown, seconds).at), `the wisp seen at ${seconds.toFixed(2)} s`);
  }
});

test('as it comes the camera follows it close, the wreck before it in the frame, never empty sky', () => {
  for (const { feet, facing } of PLACES.filter((unused, index) => index % 5 === 0)) {
    const flown = wispCourse(feet, facing, layout);
    for (let seconds = 0.5; seconds < WISP_S.drift + WISP_S.wander; seconds += 0.1) {
      const { at } = wispAt(flown, seconds);
      const { eye, look } = chaseShot(flown, seconds);
      const apart = Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]);
      assert.ok(apart > 1 && apart < 5, `${apart.toFixed(2)} m from it at ${seconds.toFixed(1)} s`);
      assert.ok(!solidAt(course, eye) && clearBetween(course, eye, at), 'seen clear');
      const toward = [look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]] as const;
      const length = Math.hypot(...toward);
      const inView = course.some((block) => {
        const middle = [(block.minX + block.maxX) / 2, (block.minY + block.maxY) / 2, block.top] as const;
        const to = [middle[0] - eye[0], middle[1] - eye[1], middle[2] - eye[2]] as const;
        const cos = (to[0] * toward[0] + to[1] * toward[1] + to[2] * toward[2]) / (Math.hypot(...to) * length);
        return cos > Math.cos(0.4);
      });
      assert.ok(inView, `the wreck in the frame at ${seconds.toFixed(1)} s`);
      const toWisp = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]] as const;
      const onIt =
        (toWisp[0] * toward[0] + toWisp[1] * toward[1] + toWisp[2] * toward[2]) / (Math.hypot(...toWisp) * length);
      assert.ok(onIt > Math.cos(0.3), `the wisp near the middle of the frame at ${seconds.toFixed(1)} s`);
      assert.ok(look[2] <= eye[2] + 0.5, 'looking level or down, never up into the sky');
    }
  }
});

test('its whole coming is as long as before', () => {
  assert.equal(wispAt(wispCourse(PLACES[0]?.feet ?? [0, 0, 0], 0, layout), WISP_LENGTH_S).part, 'gone');
});
