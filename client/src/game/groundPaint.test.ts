import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LaidPath, LaidTile, NodeLayout } from '../layout/layouts.ts';
import { paintFormat } from '../terrain/groundColour.ts';
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
  return (paint.texels[(row * paint.width + column) * paint.channels + channel] - 128) / 32;
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

test("a building run's floor is painted, a keep's paved and a mine's in earth, along its way and over its beats", () => {
  const run = (kind: string) => ({
    name: kind,
    kind,
    place: 'rock',
    line: [
      [-30, 0],
      [0, 0],
    ] as [number, number][],
    beats: [{ at: [0, 0] as [number, number], radius: 15, level: 0 }],
    door: [20, 0] as [number, number],
  });
  const path: LaidPath = {
    tier: 'footpath',
    points: [
      [-40, 30],
      [40, 30],
    ],
    heights: [0, 0],
    crossings: [],
  };
  const paved = paintOfLayouts([{ ...layout([path], []), runs: [run('keep')] }], [0, 0], 2500, [0, 0]);
  const earthen = paintOfLayouts([{ ...layout([path], []), runs: [run('mine')] }], [0, 0], 2500, [0, 0]);
  assert.ok(paved && earthen);
  assert.ok(reachAt(paved, 8, 6, 1) > 1, "the keep's beat is paved off its line");
  assert.ok(reachAt(earthen, 8, 6, 0) > 1, "the mine's beat is earth off its line");
  assert.ok(reachAt(paved, 8, 6, 0) < 0, 'and the keep is not earth there');
});

/** A chalk layout whose claim is the square about the origin of half-side `half`, with `wings` carrying it out. */
const chalky = (half: number, wings: number[][] = [], middle: [number, number] = [0, 0]): NodeLayout =>
  ({
    ...layout([], []),
    stone: 'chalk',
    sculpt: {
      claim: [
        [middle[0] - half, middle[1] - half],
        [middle[0] + half, middle[1] - half],
        [middle[0] + half, middle[1] + half],
        [middle[0] - half, middle[1] + half],
      ],
      wings,
    },
  }) as unknown as NodeLayout;

test('chalk paints its layout’s claim, its wings and the fade band past them, and no further', () => {
  const paint = paintOfLayouts([chalky(50, [[50, 0, 250, 0, 10]])], [0, 0], 2500, [0, 0]);
  assert.ok(paint);
  assert.ok(reachAt(paint, 0, 0, 2) > 3, 'its claim is deep inside');
  assert.ok(reachAt(paint, 200, 0, 2) > 3, 'a wing, out past the claim, is chalk too');
  assert.ok(reachAt(paint, 0, 100, 2) > 1, 'the fade band past the claim, where its cliffs stand, is chalk');
  assert.ok(reachAt(paint, 0, 195, 2) < -1, 'past the fade, the climate stone');
  assert.ok(reachAt(paint, 0, 0, 0) <= -3.9 && reachAt(paint, 0, 0, 1) <= -3.9, 'chalk is neither path nor paving');
});

test('chalk stops at another layout’s claim, lying inside its band', () => {
  const next = { ...chalky(50, [], [150, 0]), stone: undefined } as NodeLayout;
  const paint = paintOfLayouts([chalky(50), next], [0, 0], 2500, [0, 0]);
  assert.ok(paint);
  assert.ok(reachAt(paint, 75, 0, 2) > 1, 'the gap between the claims is chalk');
  assert.ok(reachAt(paint, 150, 0, 2) < -1, 'a neighbour’s claim is not');
});

test('a claim of over a thousand points is painted in about a second, whatever its points', () => {
  const circle = Array.from({ length: 1500 }, (_unused, k) => [
    600 * Math.cos((k / 1500) * 2 * Math.PI),
    600 * Math.sin((k / 1500) * 2 * Math.PI),
  ]);
  const round = { ...layout([], []), ring: circle, stone: 'chalk', sculpt: { claim: circle, wings: [] } };
  const before = performance.now();
  const paint = paintOfLayouts([round as unknown as NodeLayout], [0, 0], 2500, [0, 0]);
  assert.ok(paint && reachAt(paint, 0, 0, 2) > 3);
  assert.ok(performance.now() - before < 2000, `took ${Math.round(performance.now() - before)} ms`);
});

test('the paint has two channels, and four only where a chalk layout is in it', () => {
  const plain = paintOfLayouts([layout([], [tile([0, 0], 1)])], [0, 0], 2500, [0, 0]);
  const white = paintOfLayouts([chalky(50)], [0, 0], 2500, [0, 0]);
  assert.ok(plain && white);
  assert.deepEqual([plain.channels, white.channels], [2, 4]);
  assert.deepEqual([paintFormat(plain.channels), paintFormat(white.channels)], ['rg8unorm', 'rgba8unorm']);
});
