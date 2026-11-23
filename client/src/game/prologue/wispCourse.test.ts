import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIELD_OF_VIEW } from '../../editor/orbit.ts';
import { ENGULF_AT_S, FLASH_IN_S, WISP_LENGTH_S, WISP_S, wispLight } from './wisp.ts';
import {
  chasePlaces,
  chaseShot,
  clearBetween,
  wayBetween,
  ringEye,
  ringLook,
  SEEN_SHARE,
  solidAt,
  wispAt,
  wispCourse,
} from './wispCourse.ts';
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
/** How far from a wall a player's body keeps them, metres, and the highest step they stand beside (combat's tuning). */
const [BODY_M, STEP_M] = [0.35, 0.5];
/** Every place on the quiet deck a player's body fits, half a metre apart: hard against its rails and the wheel too. */
const STANDABLE = (() => {
  const places: (readonly [number, number, number])[] = [];
  for (let x = quiet[0]; x <= quiet[2]; x += 0.5)
    for (let y = quiet[1]; y <= quiet[3]; y += 0.5) {
      const deck = topAt(course, x, y);
      const walled = course.some(
        (block) =>
          block.top > deck + STEP_M &&
          x > block.minX - BODY_M &&
          x < block.maxX + BODY_M &&
          y > block.minY - BODY_M &&
          y < block.maxY + BODY_M,
      );
      if (deck > 0 && !walled) places.push([x, y, deck]);
    }
  return places;
})();
/** How far below level an eye at `eye` looks toward `look`, radians. */
const pitchOf = (eye: readonly number[], look: readonly number[]) =>
  Math.atan2(
    (eye[2] ?? 0) - (look[2] ?? 0),
    Math.hypot((look[0] ?? 0) - (eye[0] ?? 0), (look[1] ?? 0) - (eye[1] ?? 0)),
  );
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
      assert.ok(at[2] > feet[2] + 2, `over the deck, at ${(at[2] - feet[2]).toFixed(1)} m`);
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

test('the ring camera stands low and near, the player and the wisp in one frame and clear of the wreck', () => {
  for (const { feet, facing } of PLACES) {
    const flown = wispCourse(feet, facing, layout);
    const eye = ringEye(flown);
    const chest = [feet[0], feet[1], feet[2] + 1.15] as const;
    assert.ok(!solidAt(course, eye), 'not inside the wreck');
    assert.ok(clearBetween(course, eye, chest), `the player seen from ${eye.map((value) => value.toFixed(1))}`);
    const cone = (look: readonly number[], point: readonly number[]) => {
      const [toLook, toPoint] = [0, 1].map((which) =>
        [0, 1, 2].map((axis) => ((which ? point : look)[axis] ?? 0) - (eye[axis] ?? 0)),
      ) as [number[], number[]];
      const dot = toLook.reduce((sum, value, axis) => sum + value * (toPoint[axis] ?? 0), 0);
      return dot / (Math.hypot(...toLook) * Math.hypot(...toPoint));
    };
    let [moments, seenClear] = [0, 0];
    for (let seconds = WISP_S.drift + WISP_S.wander; seconds < ENGULF_AT_S + WISP_S.engulf; seconds += 0.05) {
      const { at } = wispAt(flown, seconds);
      moments++;
      if (clearBetween(course, eye, at)) seenClear++;
      const look = ringLook(flown, seconds, eye);
      assert.ok(cone(look, at) > Math.cos(0.4) && cone(look, chest) > Math.cos(0.4), 'both in the frame');
      const down = pitchOf(eye, look);
      assert.ok(down > -0.15 && down < 0.5, `looking a little down, not ${down.toFixed(2)} rad`);
    }
    assert.ok(seenClear >= moments * SEEN_SHARE, `the wisp seen clear at ${seenClear} of ${moments} moments`);
    assert.ok(eye[2] - feet[2] <= 3, `low: ${(eye[2] - feet[2]).toFixed(1)} m over the deck`);
    const middle = Math.hypot(eye[0] - feet[0], eye[1] - feet[1], eye[2] - feet[2] - 0.95);
    const share = (2 * Math.atan(0.95 / middle)) / FIELD_OF_VIEW;
    assert.ok(share >= 1 / 3, `the player ${share.toFixed(2)} of the frame's height`);
  }
});

test('as it comes the camera follows it close, the wreck before it in the frame, never empty sky', () => {
  for (const { feet, facing } of PLACES.filter((unused, index) => index % 5 === 0)) {
    const flown = wispCourse(feet, facing, layout);
    for (let seconds = 0; seconds < WISP_S.drift + WISP_S.wander; seconds += 0.1) {
      const { at } = wispAt(flown, seconds);
      const { eye, look } = chaseShot(flown, seconds);
      const apart = Math.hypot(at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]);
      assert.ok(apart > 1.5 && apart < 5, `${apart.toFixed(2)} m from it at ${seconds.toFixed(1)} s`);
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

test('the camera eases from following the wisp to watching the rings, never through the wreck nor steeply down', () => {
  for (const { feet, facing } of PLACES.filter((unused, index) => index % 3 === 0)) {
    const flown = wispCourse(feet, facing, layout);
    const circleAt = WISP_S.drift + WISP_S.wander;
    const chase = chaseShot(flown, circleAt);
    const to = ringEye(flown);
    const looked = ringLook(flown, circleAt, to);
    for (let share = 0; share <= 1; share += 0.02) {
      const { eye, look } = wayBetween(flown, chase, { eye: to, look: looked })(share);
      assert.ok(!solidAt(course, eye), `inside the wreck ${share.toFixed(2)} of the way`);
      assert.ok(pitchOf(eye, look) <= Math.PI / 3, `never above 60 degrees down, ${share.toFixed(2)} of the way`);
    }
  }
});

/** Waist and shoulder heights over the feet, metres: the band the rings ride in once down. */
const [WAIST_M, SHOULDER_M] = [0.9, 1.45];

/** The wisp's moments through its circling, a sixtieth of a second apart, with how far round the player it has gone
 *  since the circling began (radians) and how far out from them it is (metres). */
function rings(flown: ReturnType<typeof wispCourse>, feet: readonly [number, number, number]) {
  const circleAt = WISP_S.drift + WISP_S.wander;
  const moments: { seconds: number; at: readonly [number, number, number]; round: number; out: number }[] = [];
  let [round, before] = [0, NaN];
  for (let seconds = circleAt; seconds < ENGULF_AT_S; seconds += STEP) {
    const { at } = wispAt(flown, seconds);
    const bearing = Math.atan2(at[1] - feet[1], at[0] - feet[0]);
    if (!Number.isNaN(before)) round += Math.abs(Math.atan2(Math.sin(bearing - before), Math.cos(bearing - before)));
    before = bearing;
    moments.push({ seconds, at, round, out: Math.hypot(at[0] - feet[0], at[1] - feet[1]) });
  }
  return moments;
}

test('its rings come down round the body: after the first, between waist and shoulder, clear, never widening', () => {
  assert.ok(STANDABLE.length > 40, `${STANDABLE.length} places a body fits`);
  for (const { feet, facing } of [...PLACES, ...STANDABLE.map((feet) => ({ feet, facing: 0 }))]) {
    const flown = wispCourse(feet, facing, layout);
    const moments = rings(flown, feet);
    assert.ok((moments.at(-1)?.round ?? 0) > 4 * Math.PI, 'more than two rings');
    let widest = Infinity;
    for (const { seconds, at, round, out } of moments) {
      const where = `at ${seconds.toFixed(2)} s for feet ${feet.map((value) => value.toFixed(3))} facing ${facing.toFixed(2)}`;
      if (seconds >= WISP_S.drift + WISP_S.wander + 0.6) {
        assert.ok(out <= widest + 1e-6, `widening to ${out.toFixed(2)} m ${where}`);
        widest = out;
      }
      if (round < 2 * Math.PI) continue;
      const up = at[2] - feet[2];
      assert.ok(up >= WAIST_M && up <= SHOULDER_M, `${up.toFixed(2)} m over the feet ${where}`);
      assert.ok(!solidAt(course, at), `in a solid ${where}`);
    }
  }
});

test('down at the chest, its light falls on the deck under the player through the rings', () => {
  const hard = STANDABLE.filter((unused, index) => index % 3 === 0).map((feet) => ({ feet, facing: 0 }));
  for (const { feet, facing } of [...PLACES.filter((unused, index) => index % 5 === 0), ...hard]) {
    const flown = wispCourse(feet, facing, layout);
    for (const { seconds, round } of rings(flown, feet)) {
      if (round < 2 * Math.PI) continue;
      const now = wispAt(flown, seconds);
      const light = wispLight(now, 0);
      assert.ok(light, 'it shines');
      const reach = Math.hypot(now.at[0] - feet[0], now.at[1] - feet[1], now.at[2] - feet[2]);
      assert.ok(
        reach < light.reachM,
        `the deck under them ${reach.toFixed(2)} m off, reach ${light.reachM.toFixed(2)}`,
      );
    }
  }
});

test('its camera keeps out of the fires’ smoke, following it, watching its rings and moving between', () => {
  for (const wind of [
    [0, 0],
    [4, -2],
  ] as const) {
    for (const { feet, facing } of PLACES.filter((unused, index) => index % 2 === 0)) {
      const flown = wispCourse(feet, facing, layout, wind);
      const circleAt = WISP_S.drift + WISP_S.wander;
      const where = `for feet ${feet.map((value) => value.toFixed(1))} facing ${facing.toFixed(2)} in wind ${wind}`;
      // Following it, out of the smoke wherever one of its places is: where the wisp flies through a column, none is.
      for (let seconds = 0; seconds <= circleAt; seconds += 0.1) {
        const clearOne = chasePlaces(flown, seconds).places.some((place) => !flown.smoky(place));
        const smoky = flown.smoky(chaseShot(flown, seconds).eye);
        assert.ok(!(smoky && clearOne), `following it at ${seconds.toFixed(1)} s ${where}`);
      }
      const rings = ringEye(flown);
      assert.ok(!flown.smoky(rings), `watching its rings ${where}`);
      const begun = { eye: rings, look: ringLook(flown, circleAt, rings) };
      for (let share = 0; share <= 1; share += 0.05) {
        const { eye } = wayBetween(flown, chaseShot(flown, circleAt), begun)(share);
        assert.ok(!flown.smoky(eye), `moving to the rings ${share.toFixed(2)} of the way ${where}`);
      }
    }
  }
});
