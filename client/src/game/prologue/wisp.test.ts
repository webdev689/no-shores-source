import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Laid } from '../../combat/spellPixels.ts';
import { ENGULF_AT_S, FLASH_IN_S, layEngulf, layWisp, WISP_LENGTH_S, WISP_S, wispAt, wispCourse } from './wisp.ts';

const feet = [0, 0, 2] as const;
const course = wispCourse(feet, 0);
const apart = (place: readonly number[]) => Math.hypot((place[0] ?? 0) - feet[0], (place[1] ?? 0) - feet[1]);

test('the wisp comes in from over the water, wanders the deck for 6 to 8 s, then circles the player ever closer', () => {
  const start = wispAt(course, 0);
  assert.equal(start.part, 'drift');
  assert.ok(apart(start.at) > 30 && start.at[2] > feet[2] + 6, 'far out and high over the water');
  const about = WISP_S.drift + WISP_S.wander;
  assert.ok(about >= 6 && about <= 8, `${about} s about the deck before it circles`);
  assert.equal(wispAt(course, WISP_S.drift + 1).part, 'wander');
  for (let seconds = WISP_S.drift; seconds < about; seconds += 0.25) {
    const { at } = wispAt(course, seconds);
    assert.ok(apart(at) < 12 && at[2] > feet[2] + 1.5, `over the deck at ${seconds} s`);
  }
  const rings = [0.8, 1.6, 2.4, 3.2].map((into) => wispAt(course, about + into));
  assert.ok(rings.every((ring) => ring.part === 'circle'));
  const radii = rings.map((ring) => apart(ring.at));
  assert.ok(
    radii.every((radius, index) => index === 0 || radius < (radii[index - 1] ?? 0)),
    `tightening: ${radii.map((radius) => radius.toFixed(2)).join(', ')}`,
  );
  const glows = rings.map((ring) => ring.glow);
  assert.ok(
    glows.every((glow, index) => index === 0 || glow > (glows[index - 1] ?? 0)),
    'and brighter',
  );
});

test('it never jumps from frame to frame, and engulfs the player at their chest', () => {
  let last = wispAt(course, 0).at;
  for (let seconds = 1 / 60; seconds < ENGULF_AT_S + FLASH_IN_S; seconds += 1 / 60) {
    const { at } = wispAt(course, seconds);
    const step = Math.hypot(at[0] - last[0], at[1] - last[1], at[2] - last[2]);
    assert.ok(step < 0.5, `${step.toFixed(2)} m in a frame at ${seconds.toFixed(2)} s`);
    last = at;
  }
  const engulfed = wispAt(course, ENGULF_AT_S + FLASH_IN_S);
  assert.equal(engulfed.part, 'engulf');
  assert.ok(apart(engulfed.at) < 0.05 && Math.abs(engulfed.at[2] - feet[2] - 1.15) < 0.05, 'at their chest');
  assert.equal(wispAt(course, WISP_LENGTH_S).part, 'gone');
});

test('it is drawn as a core, a halo, a trail of motes and arcs, never a plain dot; the engulfing wraps and rings', () => {
  const eye = [0, 8, 4] as const;
  const now = wispAt(course, WISP_S.drift + 1);
  const bare = new Laid();
  layWisp(bare, now, [], eye, 1);
  const trailed = new Laid();
  const trail = Array.from({ length: 20 }, (unused, index) => ({
    at: [now.at[0] + index * 0.05, now.at[1], now.at[2]] as const,
    age: index / 30,
  }));
  layWisp(trailed, now, trail, eye, 1);
  const quads = (laid: Laid) => laid.length / 7 / 6;
  assert.ok(quads(bare) > 40, `${quads(bare)} pieces: a core in steps, a halo and arcs`);
  assert.ok(quads(trailed) > quads(bare) + 10, 'its trail of motes');
  const halo = bare.values.filter((value, index) => index % 7 === 6 && value < 0).length;
  assert.ok(halo > 0, 'its halo laid as light added');
  const gone = new Laid();
  layWisp(gone, wispAt(course, WISP_LENGTH_S), trail, eye, 1);
  assert.equal(gone.length, 0, 'nothing once it has engulfed them');
  const wraps = new Laid();
  layEngulf(wraps, feet, eye, FLASH_IN_S / 2);
  const ringed = new Laid();
  layEngulf(ringed, feet, eye, FLASH_IN_S + 0.3);
  assert.ok(wraps.length > 0 && ringed.length > wraps.length * 0.5, 'arcs, then the ring as well');
});
