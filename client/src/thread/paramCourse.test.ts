import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ParamCourse, paramDefault } from './paramCourse.ts';

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test("a parameter's course runs as the Web Audio specification runs it", () => {
  const course = new ParamCourse(1);
  near(course.valueAt(0), 1);
  course.add({ kind: 'set', time: 1, value: 0 }, 0);
  course.add({ kind: 'linear', time: 3, value: 1 }, 0);
  near(course.valueAt(0.5), 1);
  near(course.valueAt(2), 0.5);
  near(course.valueAt(4), 1);
  course.add({ kind: 'exponential', time: 5, value: 4 }, 4);
  near(course.valueAt(4.5), 2);
  course.add({ kind: 'target', time: 6, value: 0, constant: 1 }, 5);
  near(course.valueAt(7), 4 * Math.exp(-1));
});

test('a course cancelled, or held where it had come to, keeps only what stands before', () => {
  const course = new ParamCourse(0);
  course.add({ kind: 'linear', time: 10, value: 10 }, 0);
  course.hold(5);
  near(course.valueAt(8), 5);
  course.cancel(0);
  near(course.valueAt(8), 0);
});

test('a curve is laid between its values', () => {
  const course = new ParamCourse(0);
  course.add({ kind: 'curve', time: 0, curve: Float32Array.from([0, 2, 4]), length: 2 }, 0);
  near(course.valueAt(0.5), 1);
  near(course.valueAt(5), 4);
});

test("each parameter starts where a page's node of its kind starts it", () => {
  assert.equal(paramDefault('createGain', 'gain'), 1);
  assert.equal(paramDefault('createOscillator', 'frequency'), 440);
  assert.equal(paramDefault('createBiquadFilter', 'frequency'), 350);
  assert.equal(paramDefault('listener', 'forwardZ'), -1);
  assert.equal(paramDefault('createStereoPanner', 'pan'), 0);
});

test('a parameter eased toward a new target every frame keeps a short course, and reads as the specification runs it', () => {
  const course = new ParamCourse(0.5);
  const constant = 0.1;
  let [expected, last] = [0.5, 0];
  for (let frame = 1; frame <= 60 * 60; frame++) {
    const time = frame / 60;
    const target = Math.sin(frame / 50);
    course.add({ kind: 'target', time, value: target, constant }, time);
    near(course.valueAt(time), expected);
    // Between two frames the value eases from where it stood toward this frame's target.
    near(course.valueAt(time + 1 / 120), target + (expected - target) * Math.exp(-1 / 120 / constant));
    expected = target + (expected - target) * Math.exp(-1 / 60 / constant);
    last = time;
  }
  near(course.valueAt(last + 1 / 60), expected);
  assert.ok((course as unknown as { changes: unknown[] }).changes.length <= 3, 'a minute of frames keeps no history');
});
