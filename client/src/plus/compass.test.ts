import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COMPASS,
  COMPASS_POINTS,
  COMPASS_SPAN,
  compassPlace,
  headingOf,
  markPlace,
  SHIP_MARK_COLOURS,
  SHIP_MARK_RANGE_M,
  shipsMarked,
  UNDER_COMPASS,
} from './compass.ts';

const near = (actual: number | null, expected: number, why: string) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-6, `${why}: ${actual}`);
/** A point `metres` from `from` at `bearing` turns clockwise from north (x east, y south). */
const toward = (from: readonly [number, number], bearing: number, metres: number): [number, number] => [
  from[0] + Math.sin(bearing * 2 * Math.PI) * metres,
  from[1] - Math.cos(bearing * 2 * Math.PI) * metres,
];

test('the strip shows a quarter of the circle: a point stands the shortest way round, and off the strip it is hidden', () => {
  assert.equal(COMPASS_SPAN, 0.25);
  near(compassPlace(0, 0.02), 0.42, 'north just left of the middle for a view a little east of it');
  assert.equal(compassPlace(0.02, 0.02), 0.5, 'dead ahead is the middle');
  near(compassPlace(0.98, 0.02), 0.34, 'and a point just west of north is left of it, not most of a turn right');
  assert.equal(compassPlace(0.5, 0.02), null, 'south is behind the view and not drawn');
  assert.equal(compassPlace(0.25, 0), null, 'east, a quarter turn away, is off a quarter-turn strip');
  assert.equal(compassPlace(COMPASS_SPAN / 2, 0), 1, 'the right end');
  assert.equal(compassPlace(-COMPASS_SPAN / 2, 0), 0, 'the left end');
  assert.deepEqual(
    COMPASS_POINTS.map(([letters]) => letters),
    ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    'eight points, in the order a player turning clockwise meets them',
  );
  assert.deepEqual(
    COMPASS_POINTS.map(([, bearing]) => bearing),
    [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875],
  );
});

test('the heading is the bearing the camera looks at, clockwise from north, whatever its pitch', () => {
  near(headingOf([0, -1, 0]), 0, 'north is -y');
  near(headingOf([1, 0, 0]), 0.25, 'east');
  near(headingOf([0, 1, 0]), 0.5, 'south');
  near(headingOf([-1, 0, 0]), 0.75, 'west');
  near(headingOf([0.5, -0.5, -0.7]), 0.125, 'north-east, looking down');
});

test('a mark stands at its bearing on the same strip as the points, so one north-east stands under NE', () => {
  const from: [number, number] = [5000, -3000];
  for (const heading of [0, 0.05, 0.1, 0.93]) {
    for (const [letters, bearing] of COMPASS_POINTS) {
      const place = compassPlace(bearing, heading);
      if (place === null) continue;
      near(markPlace(toward(from, bearing, 400), from, heading), place, `${letters} looking at ${heading}`);
    }
  }
  near(markPlace(toward(from, 0.3, 50), from, 0.3), 0.5, 'dead ahead is the middle');
  near(markPlace(toward(from, 0.04, 50), from, 0), 0.66, 'a little right of ahead');
  near(markPlace(from, from, 0.3), 0.5, 'a player standing on it: dead ahead');
});

test('a mark off the strip is held at the end on the side to turn toward, never hidden', () => {
  const from: [number, number] = [0, 0];
  assert.equal(markPlace(toward(from, 0.25, 100), from, 0), 1, 'east, looking north: the right end');
  assert.equal(markPlace(toward(from, 0.75, 100), from, 0), 0, 'west: the left end');
  assert.equal(markPlace(toward(from, 0.45, 100), from, 0), 1, 'behind on the right: turn right');
  assert.equal(markPlace(toward(from, 0.55, 100), from, 0), 0, 'behind on the left: turn left');
  const behind = markPlace(toward(from, 0.5, 100), from, 0);
  assert.ok(behind === 0 || behind === 1, 'dead behind: at an end');
});

test('ships are marked within 900 m of the player, and none farther', () => {
  assert.equal(SHIP_MARK_RANGE_M, 900);
  const from: [number, number] = [1000, 1000];
  const ships = [
    { x: 1000, y: 100, kind: 'hostile' as const },
    { x: 1000, y: 99, kind: 'ship' as const },
    { x: 1600, y: 1600, kind: 'struck' as const },
  ];
  assert.deepEqual(shipsMarked(ships, from), [ships[0], ships[2]]);
  assert.deepEqual(SHIP_MARK_COLOURS, { hostile: '#ee5745', ship: '#ebe0c2', struck: '#8f8f8f' });
});

test('the compass stands 18 px down, 520 px wide or 60% of a narrower view, and what stands under it 10 px under its rule', () => {
  assert.equal(UNDER_COMPASS, COMPASS.top + COMPASS.height + COMPASS.rule + COMPASS.gap);
  assert.equal(UNDER_COMPASS, 56);
  assert.deepEqual(COMPASS, { ...COMPASS, top: 18, width: 520, share: 0.6, height: 26, rule: 2, gap: 10 });
});
