import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLOW_RAMPS } from '../elementGlow.ts';
import { MARK_FLOATS } from './marks.ts';
import { Tails, boltLine, colourOf, groundStrip, jagged, risingMotes, trailLine } from './spellLines.ts';
import { DARK, HOT } from './spellPixels.ts';

type Point = readonly [number, number, number];

const colours = (out: readonly number[]) => {
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
  const out: number[] = [];
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
  const out: number[] = [];
  groundStrip(
    out,
    [
      [0, 0, 2],
      [4, 0, 2],
    ],
    0.2,
    colourOf(3, DARK, 0.5),
  );
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
  const out: number[] = [];
  trailLine(out, [0, 0, 1], points, 1, 0.3);
  assert.equal(colours(out).size, 3);
  const none: number[] = [];
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
