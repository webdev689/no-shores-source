import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOW_RAMPS } from '../elementGlow.ts';
import { MARK_FLOATS } from './marks.ts';
import {
  Tails,
  boltLine,
  colourOf,
  groundRing,
  groundStrip,
  groundWidth,
  jagged,
  lineRibbon,
  risingMotes,
  runeRing,
  trailLine,
} from './spellLines.ts';
import { BODY, DARK, HOT, LIGHT, Laid } from './spellPixels.ts';

type Point = readonly [number, number, number];

const colours = (laid: Laid) => {
  const out = laid.laid();
  const found = new Set<string>();
  for (let start = 0; start < out.length; start += MARK_FLOATS) found.add(out.slice(start + 3, start + 6).join(','));
  return found;
};

test('a jagged line keeps its ends and throws each joint aside no further than its jitter', () => {
  const [from, to]: Point[] = [
    [0, 0, 1],
    [10, 0, 1],
  ];
  const points = jagged(from, to, 5, 0.3, 42);
  assert.equal(points.length, 6);
  assert.deepEqual(points[0], from);
  assert.deepEqual(points[5], to);
  points.forEach((point, joint) => {
    assert.ok(Math.abs(point[0] - joint * 2) < 1e-9, 'each joint keeps its share of the way');
    assert.ok(Math.hypot(point[1], point[2] - 1) <= 0.3 * Math.SQRT2 + 1e-9);
  });
  assert.notDeepEqual(jagged(from, to, 5, 0.3, 43), points, 'struck afresh it lies otherwise');
});

test("lightning is a glow in the element's body under a white-hot core, nothing else between", () => {
  const out = new Laid();
  const points: Point[] = [
    [0, -5, 1],
    [1, -5, 1],
  ];
  boltLine(out, [0, 0, 1], points, 2, { core: 0.03, glow: 0.1 });
  assert.equal(out.length % MARK_FLOATS, 0);
  const ramp = GLOW_RAMPS[2];
  assert.deepEqual(colours(out), new Set([ramp[1], ramp[HOT]].map((colour) => colour?.join(','))));
});

test('a line on the ground lies just over it, as wide as asked', () => {
  const laid = new Laid();
  groundStrip(
    laid,
    [
      [0, 0, 2],
      [4, 0, 2],
    ],
    0.2,
    colourOf(3, DARK, 0.5),
  );
  const out = laid.laid();
  assert.equal(out.length, 6 * MARK_FLOATS);
  for (let start = 0; start < out.length; start += MARK_FLOATS) {
    assert.ok((out[start + 2] ?? 0) > 2 && (out[start + 2] ?? 0) < 2.1, 'over the ground');
    assert.ok(Math.abs(Math.abs(out[start + 1] ?? 0) - 0.1) < 1e-9, 'half its width either side');
    assert.equal(out[start + 6], 0.5);
  }
});

test('a trail is laid in three steps of its age, each a flat colour of its own; a single place lays none', () => {
  const points = Array.from({ length: 10 }, (unused, index) => ({
    at: [index * 0.3, -5, 1] as Point,
    age: index * 0.03,
  }));
  const out = new Laid();
  trailLine(out, [0, 0, 1], points, 1, 0.3);
  assert.equal(colours(out).size, 3);
  const none = new Laid();
  trailLine(none, [0, 0, 1], points.slice(0, 1), 1, 0.3);
  assert.equal(none.length, 0);
});

test('a tail keeps where its thing has been lately, newest first, and starts over when the clock goes back', () => {
  const tails = new Tails();
  tails.add(1, [0, 0, 0], 0, 0.25);
  tails.add(1, [1, 0, 0], 0.1, 0.25);
  const kept = tails.add(1, [2, 0, 0], 0.3, 0.25);
  assert.deepEqual(
    kept.map(({ at }) => at[0]),
    [2, 1],
  );
  assert.ok(Math.abs((kept[1]?.age ?? 0) - 0.2) < 1e-9);
  assert.equal(tails.add(1, [5, 0, 0], 0.05, 0.25).length, 1, 'a clock gone back');
  tails.keep(new Set());
  assert.equal(tails.add(1, [6, 0, 0], 0.2, 0.25).length, 1, 'let go');
});

test("a Linked player's motes rise round them and cool a stop at a time as they rise", () => {
  const feet: Point = [3, 4, 10];
  const motes = risingMotes(7, feet, 12.5);
  assert.ok(motes.length > 0);
  for (const { at, stop } of motes) {
    assert.ok(Math.abs(Math.hypot(at[0] - 3, at[1] - 4) - 0.32) < 1e-9);
    const rise = (at[2] - 10.2) / 1.9;
    assert.ok(rise >= 0 && rise < 1);
    assert.equal(stop, HOT - Math.min(2, Math.floor(rise * 3)));
  }
  assert.notDeepEqual(risingMotes(7, feet, 12.7), motes, 'they move on with the clock');
});

test('a tail keeps one place a room tick, however fast the frames come, and answers where its thing is now first', () => {
  const tails = new Tails();
  for (let frame = 0; frame <= 24; frame++) tails.add(1, [frame, 0, 0], frame / 240, 0.25);
  const kept = tails.add(1, [25, 0, 0], 25 / 240, 0.25);
  assert.deepEqual(kept[0], { at: [25, 0, 0], age: 0 });
  assert.ok(kept.length <= 8, `a tenth of a second at 240 frames a second keeps ${kept.length}`);
});

test('a line is never thinner on the screen than its least, however far off', () => {
  const across = (eye: Point) => {
    const out = new Laid();
    lineRibbon(
      out,
      eye,
      [
        [0, 0, 1],
        [1, 0, 1],
      ],
      0.01,
      colourOf(2, HOT, 1),
      0.0024,
    );
    const values = out.laid();
    // The first vertex and the last of the first quad stand either side of the line's start.
    const last = 5 * MARK_FLOATS;
    return Math.hypot(
      (values[0] ?? 0) - (values[last] ?? 0),
      (values[1] ?? 0) - (values[last + 1] ?? 0),
      (values[2] ?? 0) - (values[last + 2] ?? 0),
    );
  };
  assert.ok(Math.abs(across([0.5, -1, 1]) - 0.01) < 1e-6, 'near, as wide as asked');
  assert.ok(across([0.5, -40, 1]) > 0.09, 'at 40 m, a pixel and a half');
  assert.ok(groundWidth([0, -20, 2], [0, 0, 0], 0.05) > 0.4, 'a line on the ground far off is widened');
  assert.equal(groundWidth([0, -2, 2], [0, 0, 0], 0.1), 0.1, 'near, as wide as asked');
});

test('a ring lies on the ground between its radii, whole or only its arc', () => {
  const out = new Laid();
  groundRing(out, [0, 0, 1], 1, 2, colourOf(1, LIGHT, 1));
  const values = out.laid();
  for (let start = 0; start < values.length; start += MARK_FLOATS) {
    const apart = Math.hypot(values[start] ?? 0, values[start + 1] ?? 0);
    assert.ok(apart > 0.99 && apart < 2.01 && (values[start + 2] ?? 0) > 1, 'between its radii, just over the ground');
  }
  const arc = new Laid();
  groundRing(arc, [0, 0, 1], 1, 2, colourOf(1, LIGHT, 1), [0, Math.PI / 2]);
  assert.ok(arc.length * 3 < values.length, 'a quarter is a quarter of the ring');
});

test("a rune ring is its element's stops alone: a dithered dark floor, a dotted body circle, an edge in light", () => {
  const out = new Laid();
  runeRing(out, [0, 0, 0], 4, 3);
  const ramp = GLOW_RAMPS[3];
  assert.deepEqual(colours(out), new Set([ramp[DARK], ramp[BODY], ramp[LIGHT]].map((colour) => colour.join(','))));
  const struck = new Laid();
  runeRing(struck, [0, 0, 0], 4, 3, { struck: true });
  assert.ok(colours(struck).has(ramp[HOT].join(',')), 'its edge white-hot as it strikes');
  const floor = (out.length / MARK_FLOATS / 6) * (0.1 * 0.1);
  assert.ok(floor < Math.PI * 4 * 4 * 0.25, 'its floor mostly bare');
});

test('laid vertices are written over in place each frame and cut to what was laid', () => {
  const out = new Laid();
  out.quad(0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, [0.5, 0.5, 0.5], 1);
  const kept = out.laid();
  assert.equal(kept.length, 6 * MARK_FLOATS);
  out.clear();
  out.vertex(9, 9, 9, [1, 1, 1], 1);
  assert.equal(out.laid(), kept, 'the same array');
  assert.deepEqual(kept, [9, 9, 9, 1, 1, 1, 1]);
});
