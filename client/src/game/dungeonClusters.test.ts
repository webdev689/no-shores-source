import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { seeded } from '../seeded.ts';
import { fromEyeMatrix, type Shot } from './camera.ts';
import {
  CLUSTER_COUNT,
  CLUSTER_GRID,
  CLUSTER_WGSL,
  LightClusters,
  MOST_LISTED,
  SLICE_DEPTHS,
  SLICES_PER_LOG,
} from './dungeonClusters.ts';
import { type Burning, type Light, LIGHT_KINDS, lightAt, MOODS } from './dungeonLight.ts';

type Point = readonly [number, number, number];

/** Looking a little east of north and a little down, from inside a dungeon. */
const SHOT: Shot = { eye: [12, 20, 1.6], yaw: 0.4, pitch: 0.15, fov: 1.1, near: 0.1, far: 300 };
const FROM_EYE = fromEyeMatrix(SHOT, 16 / 9);

/** The shader's constants, as numbers. */
const constants = Object.fromEntries(
  [...CLUSTER_WGSL.matchAll(/^const (\w+) = ([\d.e+-]+)u?;$/gm)].map(([, name = '', value = '']) => [name, +value]),
);

/** The shader's own `cluster_at`, run as JavaScript. */
const clusterAt: (across: number, upward: number, ahead: number) => number = (() => {
  const wgsl = /fn cluster_at\(([^)]*)\) -> u32 \{([\s\S]*?)\n\}/.exec(CLUSTER_WGSL);
  assert.ok(wgsl, "the shader's cluster_at");
  const params = (wgsl[1] ?? '').replace(/: f32/g, '');
  const body = (wgsl[2] ?? '').replace(/\blet /g, 'const ').replace(/\bu32\(/g, '(');
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  return runInNewContext(`(${params}) => {${body}}`, { ...constants, clamp, floor: Math.floor, log: Math.log });
})();

/** Where the eye's matrix takes a point: across and up the screen before the divide, and how far ahead. */
function clipOf(point: Point): [number, number, number] {
  const offset = [point[0] - SHOT.eye[0], point[1] - SHOT.eye[1], point[2] - SHOT.eye[2]];
  const row = (first: number) =>
    offset.reduce((sum, value, axis) => sum + (FROM_EYE[first + axis * 4] ?? 0) * value, 0);
  return [row(0), row(1), row(3)];
}

/** Whether a point is drawn: past the near plane and on the screen. */
function drawn(point: Point): boolean {
  const [across, upward, ahead] = clipOf(point);
  return ahead > SHOT.near && Math.abs(across / ahead) <= 1 && Math.abs(upward / ahead) <= 1;
}

/** The lights a point's cluster lists, as the shader reads them. */
function listedAt(clusters: LightClusters, point: Point): number[] {
  const [across, upward, ahead] = clipOf(point);
  const word = clusters.words[clusterAt(across, upward, Math.max(ahead, 1e-6))] ?? 0;
  const first = CLUSTER_COUNT + (word & 0xffffff);
  return [...clusters.words.subarray(first, first + (word >>> 24))];
}

/** A point `distance` ahead of the eye, `across` metres to its right and `upward` up, in the dungeon's metres. */
function seen(across: number, upward: number, distance: number): Point {
  const [cosYaw, sinYaw, cosPitch, sinPitch] = [
    Math.cos(SHOT.yaw),
    Math.sin(SHOT.yaw),
    Math.cos(SHOT.pitch),
    Math.sin(SHOT.pitch),
  ];
  const forward = [cosPitch * sinYaw, -cosPitch * cosYaw, -sinPitch];
  const right = [cosYaw, sinYaw, 0];
  const up = [sinPitch * sinYaw, -sinPitch * cosYaw, cosPitch];
  const along = (axis: number) =>
    SHOT.eye[axis] + (forward[axis] ?? 0) * distance + (right[axis] ?? 0) * across + (up[axis] ?? 0) * upward;
  return [along(0), along(1), along(2)];
}

const lit = (place: Point, burning: Burning, number = 0): Light => ({ at: place, number, burning });

test('the clusters are 16 tiles across, 9 up and 24 slices deep, each slice the same factor deeper from 0.25 m to 256 m, in the shader as on the page', () => {
  assert.equal(CLUSTER_COUNT, 16 * 9 * 24);
  assert.deepEqual(
    [constants.CLUSTER_COLUMNS, constants.CLUSTER_ROWS, constants.CLUSTER_SLICES, constants.CLUSTER_COUNT],
    [CLUSTER_GRID.columns, CLUSTER_GRID.rows, CLUSTER_GRID.slices, CLUSTER_COUNT],
  );
  assert.equal(constants.SLICES_NEAR, SLICE_DEPTHS.near);
  assert.equal(constants.SLICES_PER_LOG, SLICES_PER_LOG);
  const sliceOf = (ahead: number) => Math.floor(clusterAt(0, 0, ahead) / (CLUSTER_GRID.columns * CLUSTER_GRID.rows));
  const ratio = (SLICE_DEPTHS.far / SLICE_DEPTHS.near) ** (1 / CLUSTER_GRID.slices);
  for (let slice = 1; slice < CLUSTER_GRID.slices; slice++) {
    const start = SLICE_DEPTHS.near * ratio ** slice;
    assert.equal(sliceOf(start * 1.0001), slice, `slice ${slice} starts ${start.toFixed(3)} m ahead`);
    assert.equal(sliceOf(start * 0.9999), slice - 1);
  }
  assert.equal(sliceOf(0.05), 0, 'nearer than the slices: the first');
  assert.equal(sliceOf(1e5), CLUSTER_GRID.slices - 1, 'past them: the last');
  // The middle of the screen is the middle tiles; its corners the corner tiles, at any depth.
  const tiles = CLUSTER_GRID.columns * CLUSTER_GRID.rows;
  for (const ahead of [0.1, 1, 30]) {
    assert.equal(clusterAt(0, 0, ahead) % CLUSTER_GRID.columns, CLUSTER_GRID.columns / 2);
    assert.equal(clusterAt(-ahead, -ahead, ahead) % tiles, 0);
    assert.equal(clusterAt(ahead, ahead, ahead) % tiles, tiles - 1);
  }
});

test('every point a light reaches finds that light in the cluster the shader reads it from, at the screen edges and nearer than the slices begin', () => {
  const random = seeded(7);
  const between = (low: number, high: number) => low + (high - low) * random();
  // Torches ahead, some astride the screen's edges, two beside the eye, one behind it reaching past it, small candles.
  const lights: Light[] = [
    lit(seen(0, 0, 6), LIGHT_KINDS.torch, 0),
    lit(seen(-9, 0, 5), LIGHT_KINDS.torch, 1),
    lit(seen(4, 3.2, 3), LIGHT_KINDS.candles, 2),
    lit(seen(0.9, -0.4, 0.2), LIGHT_KINDS.candles, 3),
    lit(seen(0, 1, -3), LIGHT_KINDS.brazier, 4),
    lit(seen(12, -2, 30), LIGHT_KINDS.daylight, 5),
    lit(seen(-1.8, 0, 0.3), { ...LIGHT_KINDS.candles, reach: 2 }, 6),
    ...Array.from({ length: 25 }, (_unused, index) =>
      lit(seen(between(-20, 20), between(-3, 3), between(-5, 60)), LIGHT_KINDS.candles, 7 + index),
    ),
  ];
  const clusters = new LightClusters(32);
  assert.equal(clusters.build(lights, FROM_EYE, SHOT.eye), true);
  let tried = 0;
  for (const [index, { at, burning }] of lights.entries()) {
    for (let point = 0; point < 400; point++) {
      // Through its reach evenly, so most lie toward its edge, where a cluster would leave it out first.
      const [heading, rise, out] = [between(0, 2 * Math.PI), between(-1, 1), burning.reach * Math.cbrt(random())];
      const flat = Math.sqrt(1 - rise * rise);
      const inside: Point = [
        at[0] + out * flat * Math.cos(heading),
        at[1] + out * flat * Math.sin(heading),
        at[2] + out * rise,
      ];
      if (!drawn(inside)) continue;
      tried++;
      assert.ok(
        listedAt(clusters, inside).includes(index),
        `light ${index} at ${inside.map((value) => value.toFixed(2))}`,
      );
    }
  }
  assert.ok(tried > 4000, `${tried} points tried`);
  // Nearer than the slices begin: at the screen's corner by the light beside the eye, and at its right edge by the
  // light to the left whose reach just passes the eye, wider there than its sphere is where the slices begin.
  const corner = seen(-0.1, -0.06, 0.12);
  assert.ok(drawn(corner) && listedAt(clusters, corner).includes(3));
  const edge = seen(0.195, 0, 0.18);
  assert.ok(drawn(edge) && Math.hypot(...edge.map((value, axis) => value - (lights[6]?.at[axis] ?? 0))) < 2);
  assert.ok(listedAt(clusters, edge).includes(6));
});

test('a point is lit by its cluster’s lights alone exactly as by every light', () => {
  const random = seeded(11);
  const lights = Array.from({ length: 32 }, (_unused, index) =>
    lit(
      seen(-15 + random() * 30, -2 + random() * 4, random() * 40),
      index % 2 ? LIGHT_KINDS.torch : LIGHT_KINDS.lantern,
      index,
    ),
  );
  const clusters = new LightClusters(32);
  clusters.build(lights, FROM_EYE, SHOT.eye);
  for (let tried = 0; tried < 2000; tried++) {
    const point = seen(-10 + random() * 20, -2 + random() * 4, 0.2 + random() * 30);
    if (!drawn(point)) continue;
    const listed = listedAt(clusters, point).map((index) => lights[index] as Light);
    assert.ok(listed.length < lights.length);
    assert.deepEqual(lightAt(listed, point, 1.5, MOODS.crypt), lightAt(lights, point, 1.5, MOODS.crypt));
  }
});

test('a light is listed only round where it reaches: none behind the eye or off to the side, a few clusters ahead', () => {
  const clusters = new LightClusters(32);
  const counted = (lights: Light[]) => {
    assert.equal(clusters.build(lights, FROM_EYE, SHOT.eye), true);
    return clusters.listed;
  };
  assert.equal(counted([]), 0);
  assert.equal(counted([lit(seen(0, 0, -9), LIGHT_KINDS.torch)]), 0, 'behind the eye, short of it');
  assert.equal(counted([lit(seen(-40, 0, 5), LIGHT_KINDS.torch)]), 0, 'off to the left');
  assert.equal(counted([lit(seen(0, 30, 10), LIGHT_KINDS.torch)]), 0, 'far overhead');
  const ahead = counted([lit(seen(0, 0, 20), LIGHT_KINDS.torch)]);
  assert.ok(ahead > 0 && ahead < CLUSTER_COUNT / 10, `a torch 20 m ahead lists ${ahead} clusters`);
  // Each cluster's list starts where the one before it ends, and lists each light once, in order.
  const lights = [0, 1, 2].map((index) => lit(seen(index - 1, 0, 6), LIGHT_KINDS.torch, index));
  assert.equal(clusters.build(lights, FROM_EYE, SHOT.eye), true);
  let next = 0;
  for (let cluster = 0; cluster < CLUSTER_COUNT; cluster++) {
    const word = clusters.words[cluster] ?? 0;
    assert.equal(word & 0xffffff, next);
    const list = [...clusters.words.subarray(CLUSTER_COUNT + next, CLUSTER_COUNT + next + (word >>> 24))];
    assert.deepEqual(
      list,
      [...new Set(list)].sort((first, second) => first - second),
    );
    next += word >>> 24;
  }
  assert.equal(next, clusters.listed);
});

test('lists that would not fit answer false, so every fragment is lit by every light, and the next frame lists again', () => {
  const clusters = new LightClusters(32);
  const everywhere = { ...LIGHT_KINDS.torch, reach: 400 };
  const crowd = Array.from({ length: 32 }, (_unused, index) => lit(seen(0, 0, index * 0.1), everywhere, index));
  assert.ok(32 * CLUSTER_COUNT > MOST_LISTED);
  assert.equal(clusters.build(crowd, FROM_EYE, SHOT.eye), false);
  assert.equal(clusters.listed, 0);
  assert.equal(clusters.build(crowd.slice(0, 2), FROM_EYE, SHOT.eye), true);
  assert.equal(clusters.listed, 2 * CLUSTER_COUNT);
});
