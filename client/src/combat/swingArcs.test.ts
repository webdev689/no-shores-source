import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directionOf } from '../rules/fighters.ts';
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
  weightOf,
} from './swingArcs.ts';
import { RAMP, SWING_WGSL, swingRampColour } from './swingLook.ts';
import { groundStrike } from './swingMesh.ts';

const DEGREE = Math.PI / 180;
const LOOK = { brightness: 1, trail: 1 };
/** A sword's sweep to the left, aimed north, landing 0.4 s into a 1 s swing, drawn the way its stroke goes. */
const swing = (over: Partial<Swing> = {}): Swing => ({
  id: 7,
  stroke: 3,
  elapsed: 0,
  strike: 0.4,
  end: 1,
  reach: 2.05,
  halfArc: 70 * DEGREE,
  aim: 0,
  way: directionOf(over.stroke ?? 3),
  leftHand: false,
  mirrored: false,
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

test('an arc goes the way its figure is drawn swinging, whatever way the stroke was asked', () => {
  // Asked to the left, drawn as the side cut to the right: aimed north, it travels east.
  const drawn = courseOf(swing({ stroke: 3, way: 'right' }));
  assert.ok(drawn.travel[0] > 0.9, `east: ${drawn.travel[0]}`);
  near(courseOf(swing({ stroke: 3, way: 'right' })).before, courseOf(swing({ stroke: 4 })).before);
});

test('the left hand strikes from the left shoulder; a mirrored figure swings left-handed, the other way', () => {
  assert.ok(courseOf(swing({ leftHand: true })).offset[0] < 0);
  assert.ok(courseOf(swing()).offset[0] > 0);
  const mirrored = courseOf(swing({ way: 'right', mirrored: true }));
  assert.ok(mirrored.offset[0] < 0, 'from the left shoulder');
  assert.ok(mirrored.travel[0] < -0.9, 'drawn to the right, mirrored: west');
  assert.ok(courseOf(swing({ way: 'downRight', mirrored: true })).travel[0] < -0.5, 'a slant mirrored too');
  assert.ok(courseOf(swing({ leftHand: true, mirrored: true })).offset[0] > 0, 'a left hand mirrored is the right');
});

test("a blow keeps the mirror it began with, though its figure's side turns mid-sweep", () => {
  const arcs = new SwingArcs();
  play(arcs, [[0, 0.3]], { way: 'right' });
  play(arcs, [[0.1, 0.4]], { way: 'right', mirrored: true });
  assert.equal(arcs.count, 1);
  // Swept to the right up to its landing, its streak lies west, where it came from; turned about, it would lie east.
  const mesh = arcs.mesh(EYE, LOOK);
  const across = Array.from(
    { length: mesh.length / SWING_FLOATS },
    (_unused, index) => (mesh[index * SWING_FLOATS] ?? 0) - 10,
  );
  assert.ok(
    Math.min(...across) < -1 && Math.max(...across) < 0.6,
    `west: ${Math.min(...across)} to ${Math.max(...across)}`,
  );
});

test("a weapon's arc burns in its metal's light, bare hands in a warm white", () => {
  assert.deepEqual(weaponTint('sword_daedric'), [1, 0.33, 0.22]);
  assert.deepEqual(weaponTint('axe_iron_l'), weaponTint('mace_iron'));
  assert.deepEqual(weaponTint(null), weaponTint('staff'));
});

const EYE: Vector = [10, 30, 1.6];
/** A striker's blow seen frame by frame, `elapsed` its time at each of `nows`. */
const play = (
  arcs: SwingArcs,
  steps: readonly (readonly [now: number, elapsed: number | null])[],
  over: Partial<Swing> = {},
) => {
  for (const [now, elapsed] of steps) arcs.seen(now, elapsed === null ? [] : [swing({ ...over, elapsed })], () => FEET);
};
const parts = (mesh: Float32Array) => {
  const found = new Set<number>();
  for (let vertex = 0; vertex < mesh.length; vertex += SWING_FLOATS) found.add(mesh[vertex + 6] ?? -1);
  return found;
};
const strongest = (mesh: Float32Array) =>
  Math.max(
    0,
    ...Array.from({ length: mesh.length / SWING_FLOATS }, (_unused, index) => mesh[index * SWING_FLOATS + 10] ?? 0),
  );

test('a blow seen again is one arc; a later one another; each laid as triangles while it sweeps, then let go', () => {
  const arcs = new SwingArcs();
  play(arcs, [
    [5, 0.2],
    [5.05, 0.25],
    [5.2, 0.4],
  ]);
  assert.equal(arcs.count, 1);
  // Seen from over its striker's shoulder, the arc is drawn where it is, not brought over its card.
  const mesh = arcs.mesh([10, 20.5, 1.6], LOOK);
  assert.ok(mesh.length > 0 && mesh.length % (SWING_FLOATS * 6) === 0, 'whole quads');
  const course = courseOf(swing());
  for (let vertex = 0; vertex < mesh.length; vertex += SWING_FLOATS) {
    if (mesh[vertex + 6] !== PART.band) continue;
    const from = [(mesh[vertex] ?? 0) - 10.18, (mesh[vertex + 1] ?? 0) - 19.85, (mesh[vertex + 2] ?? 0) - 1.3];
    assert.ok(Math.hypot(...from) <= course.tip * 1.06 + 1e-4, 'within the blade');
  }
  play(arcs, [[6, 0]]);
  assert.equal(arcs.count, 2, 'a later blow, begun anew');
  play(arcs, [[9, null]]);
  assert.equal(arcs.mesh(EYE, LOOK).length, 0, 'faded');
  assert.equal(arcs.count, 0, 'let go');
});

test("a blow keeps the rules' time, not the page's: it runs on a snapshot's span, then waits while the fight waits", () => {
  const arcs = new SwingArcs();
  play(arcs, [
    [0, 0.2],
    [0.05, 0.2],
  ]);
  const laid = (mesh: Float32Array) => mesh.length;
  const early = laid(arcs.mesh(EYE, LOOK));
  // The fight paused for two seconds: the same blow, never begun again, and its arc not run on past a snapshot's span.
  for (let now = 0.1; now < 2; now += 0.05) play(arcs, [[now, 0.2]]);
  assert.equal(arcs.count, 1, 'never begun again');
  const paused = new SwingArcs();
  play(paused, [
    [0, 0.2],
    [0.15, 0.2],
  ]);
  assert.equal(laid(arcs.mesh(EYE, LOOK)), laid(paused.mesh(EYE, LOOK)), 'run on by a snapshot span at most');
  assert.ok(early > 0);
});

test('a blow turned as it winds up sweeps where it is aimed at last', () => {
  const arcs = new SwingArcs();
  play(arcs, [[0, 0.2]]);
  play(arcs, [[0.2, 0.4]], { aim: Math.PI / 2 });
  const mesh = arcs.mesh(EYE, LOOK);
  let east = 0;
  for (let vertex = 0; vertex < mesh.length; vertex += SWING_FLOATS) east = Math.max(east, (mesh[vertex] ?? 0) - 10);
  assert.ok(east > 1, `it sweeps east, where it was turned: ${east}`);
});

test('a blow that meets something flares where its tip was, and only while it sweeps', () => {
  const arcs = new SwingArcs();
  play(arcs, [
    [0, 0],
    [0.41, 0.41],
  ]);
  arcs.struck(7, 1);
  play(arcs, [[0.43, 0.43]]);
  const flared = arcs.mesh(EYE, LOOK);
  assert.ok(parts(flared).has(PART.flare) && parts(flared).has(PART.band) && parts(flared).has(PART.strip));
  assert.ok(strongest(flared) > 1.5, `brighter than plain: ${strongest(flared)}`);
  // Struck before its fast part began, or by another striker: no flare, only the plain streak and its glint.
  const late = new SwingArcs();
  play(late, [[0, 0.1]]);
  late.struck(7, 1);
  late.struck(8, 1);
  play(late, [[0.33, 0.43]]);
  assert.ok(strongest(late.mesh(EYE, LOOK)) <= 1);
});

test('dark at no brightness, and held back by a hit-stop', () => {
  const arcs = new SwingArcs();
  play(arcs, [[0, 0.3]]);
  assert.equal(arcs.mesh(EYE, { brightness: 0, trail: 1 }).length, 0);
  assert.equal(arcs.count, 1, 'kept');
  // Held back by the whole of its time, it has not yet begun its fast part: nothing is laid.
  assert.equal(arcs.mesh(EYE, LOOK, () => 0.3).length, 0);
});

test('a blow cut short stops where it was and fades from there, never sweeping on', () => {
  const struck = new SwingArcs();
  const cut = new SwingArcs();
  play(struck, [
    [0, 0],
    [0.3, 0.3],
    [0.47, 0.47],
  ]);
  play(cut, [
    [0, 0],
    [0.3, 0.3],
    [0.47, null],
  ]);
  // Uninterrupted, it still sweeps at 0.47; cut short at 0.3, its streak has faded by then.
  assert.ok(struck.mesh(EYE, LOOK).length > 0);
  assert.equal(cut.mesh(EYE, LOOK).length, 0);
  assert.equal(cut.count, 0, 'let go');
});

test('a thrust stabs as it lands, a flare at its tip that shows even end on, and none before', () => {
  const flares = (time: number) => {
    const arcs = new SwingArcs();
    play(arcs, [[0, time]], { stroke: 6, reach: 2.65, halfArc: 20 * DEGREE });
    const mesh = arcs.mesh(EYE, LOOK);
    let count = 0;
    for (let vertex = 0; vertex < mesh.length; vertex += SWING_FLOATS) if (mesh[vertex + 6] === PART.flare) count += 1;
    return count / 6;
  };
  assert.equal(flares(0.3), 1, 'its glint alone, still driving');
  assert.equal(flares(0.45), 2, 'landed: its stab at the tip, beside the glint of its withdrawing head');
  assert.equal(flares(0.7), 0, 'the stab over');
});

/** Each vertex of a mesh: its place, part, ramp and its shape's first two numbers. */
const vertices = (mesh: Float32Array) =>
  Array.from({ length: mesh.length / SWING_FLOATS }, (_unused, index) => {
    const start = index * SWING_FLOATS;
    const value = (offset: number) => mesh[start + offset] ?? Number.NaN;
    return { place: [value(0), value(1), value(2)] as const, part: value(6), ramp: value(11), first: value(3) };
  });

test('an arc is brought along the eye’s line until it stands over its own striker’s card, never moved on the screen', () => {
  const arcs = new SwingArcs();
  play(arcs, [
    [0, 0.3],
    [0.12, 0.42],
  ]);
  const card = Math.hypot(FEET[0] - EYE[0], FEET[1] - EYE[1]) - 0.35;
  const laid = vertices(arcs.mesh(EYE, LOOK));
  assert.ok(laid.length > 0);
  for (const { place } of laid) assert.ok(Math.hypot(place[0] - EYE[0], place[1] - EYE[1]) < card, 'over its card');
  // The same arc seen from close by is not brought in: each of its points lies on the line from the eye to the far one.
  const near = new SwingArcs();
  play(near, [
    [0, 0.3],
    [0.12, 0.42],
  ]);
  const far = vertices(near.mesh([10, 20.5, 1.6], LOOK));
  assert.equal(far.length, laid.length);
});

test('a blade’s element sets its arc’s ramp, a riposte’s is gold, a bare one burns in its metal', () => {
  const rampOf = (over: Partial<Swing>) => {
    const arcs = new SwingArcs();
    play(arcs, [[0, 0.42]], over);
    return new Set(vertices(arcs.mesh(EYE, LOOK)).map((vertex) => vertex.ramp));
  };
  assert.deepEqual(rampOf({}), new Set([RAMP.metal]));
  assert.deepEqual(rampOf({ look: 2 }), new Set([RAMP.volt]));
  assert.deepEqual(rampOf({ look: 3, special: true }), new Set([RAMP.gold]));
  assert.deepEqual(
    swingRampColour(RAMP.metal, 3, [0.74, 0.86, 1]).map((part) => Math.round(part * 100)),
    [97, 99, 100],
  );
  assert.deepEqual(swingRampColour(RAMP.metal, 0, [1, 1, 1]), [0.24, 0.24, 0.24]);
  assert.ok(SWING_WGSL.includes('@fragment fn swingFragment') && !/NaN|undefined|\$\{/.test(SWING_WGSL));
});

test('the element leaves the blade: Blaze’s embers outlive the cut, Volt forks while it is fast, Cosmic leaves stars', () => {
  const solids = (look: 1 | 2 | 3, time: number) => {
    const arcs = new SwingArcs();
    play(arcs, [[0, time]], { look });
    return vertices(arcs.mesh(EYE, LOOK)).filter((vertex) => vertex.part === PART.solid).length / 6;
  };
  assert.ok(solids(1, 0.45) > 3, 'embers shed through the cut');
  const embers = new SwingArcs();
  play(embers, [[0, 0.45]], { look: 1 });
  play(embers, [[0.25, null]]);
  assert.ok(
    vertices(embers.mesh(EYE, LOOK)).some((vertex) => vertex.part === PART.solid),
    'still rising after it',
  );
  assert.equal(solids(2, 0.42), 2 * 3 * 2, 'two forks of three legs, each a halo and a core');
  assert.equal(solids(2, 0.1), 0, 'none while the blade is slow');
  const stars = new SwingArcs();
  play(stars, [[0, 0.45]], { look: 3 });
  const flares = vertices(stars.mesh(EYE, LOOK)).filter((vertex) => vertex.part === PART.flare).length / 6;
  assert.ok(flares > 2, `stars along its path, and its glint: ${flares}`);
});

test('a heavy class swings wider and longer than a dagger, and its overhead strikes the ground', () => {
  assert.ok(weightOf(8).wide > weightOf(2).wide && weightOf(2).wide > weightOf(1).wide);
  assert.ok(weightOf(6).trail > weightOf(1).trail);
  assert.deepEqual(weightOf(), weightOf(2), 'a sword for none known');
  assert.ok(weightOf(3).blunt && !weightOf(8).blunt);
  const overhead = courseOf(swing({ stroke: 1, arms: 8, reach: 2.3 }));
  assert.ok(
    overhead.ground && !courseOf(swing({ stroke: 3, arms: 8 })).ground && !courseOf(swing({ stroke: 1 })).ground,
  );
  const struck = groundStrike(overhead, FEET);
  assert.ok(
    struck && struck.time > overhead.strike && struck.at[2] === FEET[2],
    'its head meets the ground after it lands',
  );
  const arcs = new SwingArcs();
  play(arcs, [[0, (struck?.time ?? 0) + 0.05]], { stroke: 1, arms: 8, reach: 2.3 });
  const ground = vertices(arcs.mesh(EYE, LOOK)).filter((vertex) => vertex.part === PART.solid);
  assert.ok(
    ground.some((vertex) => Math.abs(vertex.place[2] - 0.02) < 1e-6),
    'a crack on the ground',
  );
  assert.ok(
    ground.some((vertex) => vertex.ramp === RAMP.dust),
    'dust thrown off it',
  );
});

test('a smear trails its striker’s card for the first frames of its strike, back against the blade’s way', () => {
  const arcs = new SwingArcs();
  play(arcs, [[0, 0.39]]);
  assert.equal(arcs.smearOf(7, [1, 0]), null, 'not before the strike');
  play(arcs, [[0.02, 0.41]]);
  const smear = arcs.smearOf(7, [1, 0]);
  // A sweep to the left travels west: its smear lies east of the figure, in whole pixels.
  assert.ok(smear && smear.across > 0 && Number.isInteger(smear.across) && Number.isInteger(smear.up));
  play(arcs, [[0.1, 0.5]]);
  assert.equal(arcs.smearOf(7, [1, 0]), null, 'gone two frames on');
});

test('an arc laid far out in the world, measured from its eye, keeps its centimetres', () => {
  const far: Vector = [3_000_000, 3_000_000, 0];
  const laidFrom = (shift: Vector) => {
    const arcs = new SwingArcs();
    const feet: Vector = [FEET[0] + shift[0], FEET[1] + shift[1], FEET[2] + shift[2]];
    const eye: Vector = [EYE[0] + shift[0], EYE[1] + shift[1], EYE[2] + shift[2]];
    for (const [now, elapsed] of [
      [5, 0.2],
      [5.2, 0.4],
    ] as const)
      arcs.seen(now, [swing({ elapsed })], () => feet);
    return arcs.mesh(eye, LOOK, () => 0, eye);
  };
  const [near, out] = [laidFrom([0, 0, 0]), laidFrom(far)];
  assert.ok(near.length > 0 && near.length === out.length);
  let worst = 0;
  for (let vertex = 0; vertex < near.length; vertex += SWING_FLOATS)
    for (let axis = 0; axis < 3; axis++)
      worst = Math.max(worst, Math.abs((near[vertex + axis] ?? 0) - (out[vertex + axis] ?? 0)));
  assert.ok(worst < 0.01, `off by ${worst} m`);
});
