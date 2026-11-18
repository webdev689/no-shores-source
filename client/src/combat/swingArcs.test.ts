import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PART,
  SWING_FLOATS,
  type Swing,
  SwingArcs,
  type Vector,
  courseOf,
  headAt,
  tipAt,
  weaponTint,
} from './swingArcs.ts';

const DEGREE = Math.PI / 180;
const LOOK = { brightness: 1, trail: 1 };
/** A sword's sweep to the left, aimed north, landing 0.4 s into a 1 s swing. */
const swing = (over: Partial<Swing> = {}): Swing => ({
  id: 7,
  stroke: 3,
  elapsed: 0,
  strike: 0.4,
  end: 1,
  reach: 2.05,
  halfArc: 70 * DEGREE,
  aim: 0,
  leftHand: false,
  special: false,
  tint: [1, 1, 1],
  ...over,
});
const FEET: Vector = [10, 20, 0];
const near = (actual: number, expected: number, within = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= within, `${actual} is not ${expected}`);

test("a sweep turns through its stroke's own arc and beyond: gathering speed to the landing, unbroken through it", () => {
  const course = courseOf(swing());
  near(course.before, 95 * DEGREE);
  near(course.after, 90 * DEGREE);
  assert.deepEqual(headAt(course, 0), { along: -course.before, speed: 0 }, 'at rest before its fast part');
  const landing = headAt(course, course.strike);
  near(landing.along, 0);
  near(landing.speed, 1);
  near(headAt(course, course.strike - 1e-4).speed, headAt(course, course.strike + 1e-4).speed, 1e-2);
  near(headAt(course, course.to + 1).along, course.after);
  let last = -Infinity;
  for (let time = 0; time <= course.to + 0.1; time += 0.005) {
    const { along } = headAt(course, time);
    assert.ok(along >= last - 1e-12, `it never turns back (${time})`);
    last = along;
  }
});

test('a blow lands ahead along its aim, its tip most of the way out to its reach less the body it strikes', () => {
  const course = courseOf(swing());
  near(course.tip, (2.05 - 0.35) * 0.75);
  const tip = tipAt(course, FEET, course.strike);
  const pivot = [FEET[0] + 0.18, FEET[1] - 0.15, FEET[2] + 1.3];
  near(Math.hypot(tip[0] - (pivot[0] ?? 0), tip[1] - (pivot[1] ?? 0), tip[2] - (pivot[2] ?? 0)), course.tip);
  assert.ok(tip[1] < FEET[1] - 1.2, 'north of the feet, where it is aimed');
  near(tip[0], pivot[0] ?? 0, 1e-9);
  // Turned to face east, the same blow lands east.
  const east = tipAt(courseOf(swing({ aim: Math.PI / 2 })), FEET, course.strike);
  assert.ok(east[0] > FEET[0] + 1.2 && Math.abs(east[1] - FEET[1]) < 0.2);
});

test('each stroke sweeps its own way: an overhead down, the sweeps across, the slants down and across', () => {
  const travel = (stroke: number) => courseOf(swing({ stroke })).travel;
  const [down, downLeft, left, right, downRight] = [1, 2, 3, 4, 5].map(travel);
  assert.ok(down && down[2] < -0.85 && down[0] < -0.3, 'an overhead comes down, slanting from the striking hand');
  assert.ok(left && left[0] < -0.9 && right && right[0] > 0.9, 'aimed north, a sweep left travels west, right east');
  assert.ok(downLeft && downLeft[0] < -0.5 && downLeft[2] < -0.5, 'a slant down and to the left');
  assert.ok(downRight && downRight[0] > 0.5 && downRight[2] < -0.5, 'a slant down and to the right');
  near(courseOf(swing({ stroke: 1 })).before, 95 * DEGREE, 1e-9);
});

test('a thrust drives out along its aim to its tip as it lands, from drawn back, and withdraws after', () => {
  const course = courseOf(swing({ stroke: 6, reach: 2.65, halfArc: 20 * DEGREE }));
  assert.equal(course.thrust, true);
  near(headAt(course, 0).along, course.tip * 0.3);
  near(headAt(course, course.strike).along, course.tip);
  near(headAt(course, course.to + 1).along, course.tip * 0.6);
  assert.ok(course.land[1] < -0.99, 'north');
});

test('the left hand strikes from the left shoulder, and through the eyes the pivot stands ahead', () => {
  assert.ok(courseOf(swing({ leftHand: true })).offset[0] < 0);
  assert.ok(courseOf(swing()).offset[0] > 0);
  const own = courseOf(swing({ firstPerson: true }));
  assert.ok(own.offset[1] < -0.3, 'ahead of the eye, north');
  assert.ok(own.tip < courseOf(swing()).tip);
});

test("a weapon's arc burns in its metal's light, bare hands in a warm white", () => {
  assert.deepEqual(weaponTint('sword_daedric'), [1, 0.33, 0.22]);
  assert.deepEqual(weaponTint('axe_iron_l'), weaponTint('mace_iron'));
  assert.deepEqual(weaponTint(null), weaponTint('staff'));
});

test('a blow seen again is one arc; a later one another; each laid as triangles while it sweeps, then let go', () => {
  const arcs = new SwingArcs();
  const where = () => FEET;
  arcs.seen(5, [swing({ elapsed: 0.2 })], where);
  arcs.seen(5.05, [swing({ elapsed: 0.25 })], where);
  assert.equal(arcs.count, 1);
  const mesh = arcs.mesh(5.2, [10, 30, 1.6], LOOK);
  assert.ok(mesh.length > 0 && mesh.length % (SWING_FLOATS * 6) === 0, 'whole quads');
  const course = courseOf(swing());
  for (let vertex = 0; vertex < mesh.length; vertex += SWING_FLOATS) {
    if (mesh[vertex + 6] !== PART.band) continue;
    const from = [(mesh[vertex] ?? 0) - 10.18, (mesh[vertex + 1] ?? 0) - 19.85, (mesh[vertex + 2] ?? 0) - 1.3];
    assert.ok(Math.hypot(...from) <= course.tip * 1.06 + 1e-4, 'within the blade');
  }
  arcs.seen(6, [swing({ elapsed: 0 })], where);
  assert.equal(arcs.count, 2, 'a later blow');
  assert.equal(arcs.mesh(9, [10, 30, 1.6], LOOK).length, 0, 'faded');
  assert.equal(arcs.count, 0, 'let go');
});

test('a blow that meets something flares where its tip was, and only while it sweeps', () => {
  const parts = (mesh: Float32Array) => {
    const found = new Set<number>();
    for (let vertex = 0; vertex < mesh.length; vertex += SWING_FLOATS) found.add(mesh[vertex + 6] ?? -1);
    return found;
  };
  const strongest = (mesh: Float32Array) =>
    Math.max(
      ...Array.from({ length: mesh.length / SWING_FLOATS }, (_unused, index) => mesh[index * SWING_FLOATS + 10] ?? 0),
    );
  const arcs = new SwingArcs();
  arcs.seen(0, [swing()], () => FEET);
  arcs.struck(7, 1, 0.41);
  const flared = arcs.mesh(0.43, [10, 30, 1.6], LOOK);
  assert.ok(parts(flared).has(PART.flare) && parts(flared).has(PART.band) && parts(flared).has(PART.strip));
  assert.ok(strongest(flared) > 1.5, `brighter than plain: ${strongest(flared)}`);
  // Struck before its fast part began, or by another striker: no flare, only the plain streak and its glint.
  const late = new SwingArcs();
  late.seen(0, [swing()], () => FEET);
  late.struck(7, 1, 0.1);
  late.struck(8, 1, 0.41);
  assert.ok(strongest(late.mesh(0.43, [10, 30, 1.6], LOOK)) <= 1);
});

test('dark at no brightness, and held back by a hit-stop', () => {
  const arcs = new SwingArcs();
  arcs.seen(0, [swing()], () => FEET);
  assert.equal(arcs.mesh(0.3, [10, 30, 1.6], { brightness: 0, trail: 1 }).length, 0);
  assert.equal(arcs.count, 1, 'kept');
  // Held back by the whole of its time, it has not yet begun its fast part: nothing is laid.
  assert.equal(arcs.mesh(0.3, [10, 30, 1.6], LOOK, () => 0.3).length, 0);
});

test('a blow cut short stops where it was and fades from there, never sweeping on', () => {
  const struck = new SwingArcs();
  const cut = new SwingArcs();
  for (const arcs of [struck, cut]) arcs.seen(0, [swing()], () => FEET);
  struck.seen(0.3, [swing({ elapsed: 0.3 })], () => FEET);
  cut.seen(0.3, [], () => FEET);
  // Uninterrupted, it still sweeps at 0.47; cut short at 0.3, its streak has faded by then.
  assert.ok(struck.mesh(0.47, [10, 30, 1.6], LOOK).length > 0);
  assert.equal(cut.mesh(0.47, [10, 30, 1.6], LOOK).length, 0);
  assert.equal(cut.count, 0, 'let go');
});

test('a thrust stabs as it lands, a flare at its tip that shows even end on, and none before', () => {
  const flares = (time: number) => {
    const arcs = new SwingArcs();
    arcs.seen(0, [swing({ stroke: 6, reach: 2.65, halfArc: 20 * DEGREE, elapsed: time })], () => FEET);
    const mesh = arcs.mesh(0, [10, 30, 1.6], LOOK);
    let count = 0;
    for (let vertex = 0; vertex < mesh.length; vertex += SWING_FLOATS) if (mesh[vertex + 6] === PART.flare) count += 1;
    return count / 6;
  };
  assert.equal(flares(0.3), 1, 'its glint alone, still driving');
  assert.equal(flares(0.45), 2, 'landed: its stab at the tip, beside the glint of its withdrawing head');
  assert.equal(flares(0.7), 0, 'the stab over');
});
