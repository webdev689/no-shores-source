import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hullEdge, type HullMask } from '../../water/hullMask.ts';
import { dryFitted } from './wreckDry.ts';

/** A block of ground from its west, north, east and south edges, 2 m up. */
const ground = (minX: number, minY: number, maxX: number, maxY: number) => ({
  minX,
  minY,
  maxX,
  maxY,
  top: 2,
  bottom: 0,
});
// A raft lying east and west, 9 m by 3 m, with a spar of decking off its east end bent south: a hull's footprint,
// pointed at its bow, misses its corners and the bend.
const RAFT = [ground(0, 0, 9, 3), ground(9, 0, 10.2, 6)];
const FOOTPRINT: HullMask = { x: 4.5, y: 1.5, heading: Math.PI / 2, halfLength: 4.8, halfBeam: 1.6, way: 0 };
const covered = (masks: readonly HullMask[], x: number, y: number) =>
  masks.some((mask) => hullEdge(mask, [x, y]).outside < 0);

test('the fitted footprints cover every corner of the ground the export footprint missed', () => {
  const corners: [number, number][] = [
    [0.02, 0.02],
    [8.98, 2.98],
    [10.18, 5.98],
    [9.02, 5.98],
  ];
  assert.ok(
    corners.some(([x, y]) => !covered([FOOTPRINT], x, y)),
    "the hull's shape misses some of it",
  );
  const fitted = dryFitted([FOOTPRINT], RAFT);
  for (const [x, y] of corners) assert.ok(covered(fitted, x, y), `${x}, ${y}`);
});

test('a long footprint is laid in pieces, each following the ground, leaving the sea round the bend drawn', () => {
  const fitted = dryFitted([FOOTPRINT], RAFT);
  assert.ok(fitted.length >= 2, `${fitted.length} pieces`);
  // South of the raft's middle, away from the bend, is open sea.
  assert.ok(!covered(fitted, 4.5, 5.5));
});

test('a footprint given no ground is kept as the export laid it', () => {
  const far: HullMask = { ...FOOTPRINT, x: 400 };
  const fitted = dryFitted([FOOTPRINT, far], RAFT);
  assert.ok(fitted.includes(far));
});
