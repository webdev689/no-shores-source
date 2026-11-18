import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LaidPath, LaidTile, NodeLayout } from '../layout/layouts.ts';
import { paintOfLayouts, tileCorners } from './groundPaint.ts';

const ring = [
  [-50, -50],
  [50, -50],
  [50, 50],
  [-50, 50],
] as const;
const layout = (paths: LaidPath[], tiles: LaidTile[]): NodeLayout =>
  ({ id: 'downs', ring, paths, tiles }) as unknown as NodeLayout;
const tile = (middle: readonly [number, number], byte: number): LaidTile => ({
  at: middle,
  byte,
  turns: 0,
  corners: [0, 0, 0, 0],
});

/** A channel's distance from its edge at a world point, metres (positive inside), as the terrain reads it. */
function reachAt(paint: NonNullable<ReturnType<typeof paintOfLayouts>>, x: number, y: number, channel: number) {
  const [column, row] = [Math.floor((x - paint.west) / paint.texelM), Math.floor((y - paint.north) / paint.texelM)];
  return (paint.texels[(row * paint.width + column) * 2 + channel] - 128) / 32;
}

test('a path is painted to its width and not past it', () => {
  const path: LaidPath = {
    tier: 'footpath',
    points: [
      [-20, 0.5],
      [20, 0.5],
    ],
    heights: [0, 0],
    crossings: [],
  };
  const paint = paintOfLayouts([layout([path], [])], [0, 0], 2500, [0, 0]);
  assert.ok(paint);
  assert.ok(reachAt(paint, 0, 0.5, 0) > 1, 'its middle is well inside');
  assert.ok(Math.abs(reachAt(paint, 0, 1.5, 0) - 0.3) < 0.1, 'a metre off its middle, 0.3 m inside its 2.6 m');
  assert.ok(reachAt(paint, 0, 4.5, 0) < -2, 'past its edge it is outside');
  assert.ok(reachAt(paint, 0, 0.5, 1) <= -3.9, 'a path is not paving');
});

test('two dirt tiles side by side are one street, with no seam where they meet', () => {
  const paint = paintOfLayouts([layout([], [tile([0, 0], 1), tile([6.4, 0], 1)])], [0, 0], 2500, [0, 0]);
  assert.ok(paint);
  assert.ok(reachAt(paint, 3.2, 0, 0) > 3, 'their shared edge is deep inside');
  assert.ok(reachAt(paint, -3.6, 0, 0) > 0 && reachAt(paint, -6.6, 0, 0) < 0, 'it fades out across the next tile');
});

test("a transition tile's dirt lies at the corner its record keeps it, turned as the tile is", () => {
  // record 5 is dirt at its picture's top left only ('DWWW')
  assert.deepEqual(
    tileCorners({ byte: 5, turns: 0 }).map((corner) => corner.dirt),
    [1, 0, 0, 0],
  );
  // turned once, the picture's top left lies at the tile's south-west corner, as tileUvs lays it
  assert.deepEqual(
    tileCorners({ byte: 5, turns: 1 }).map((corner) => corner.dirt),
    [0, 0, 0, 1],
  );
  assert.deepEqual(tileCorners({ byte: 46, turns: 0 })[0], { dirt: 0, paving: 1 });
});
