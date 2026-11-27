import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finished } from './steps.ts';
import { GLOW_FLOATS, glowInstances, LEAST_PX, shownSize } from '../sky/glowPoints.ts';
import { glowsOf, LIGHT_LOOKS, POOL_TEXEL_M, poolMapSteps, postMeshes } from './nightLights.ts';
import type { CityLight } from './plan.ts';

const ORIGIN = [10_000, 20_000] as const;
const lamp = (east: number, south: number, kind: CityLight['kind'] = 'lamp'): CityLight => ({
  at: [ORIGIN[0] + east, ORIGIN[1] + south, 30],
  kind,
});

/** The light map's value at a point (east, south from the city's middle), 0 to 1. */
function poolAt(map: NonNullable<ReturnType<typeof readMap>>, east: number, south: number): number {
  const [column, row] = [Math.floor((east - map.west) / POOL_TEXEL_M), Math.floor((south - map.north) / POOL_TEXEL_M)];
  return (map.texels[row * map.width + column] ?? 0) / 255;
}
const readMap = (lights: readonly CityLight[]) => finished(poolMapSteps(lights, ORIGIN));

test('a lamp lays a pool of light round its foot, brightest under it and none past its reach', () => {
  const map = readMap([lamp(0, 0)]);
  assert.ok(map);
  assert.equal(map.width % 256, 0, 'rows as WebGPU copies them');
  const reach = LIGHT_LOOKS.lamp.poolM;
  assert.ok(poolAt(map, 0, 0) > 0.6, 'bright under the lamp');
  assert.ok(poolAt(map, reach * 0.5, 0) < poolAt(map, 0, 0) && poolAt(map, reach * 0.5, 0) > 0, 'falling off');
  assert.equal(poolAt(map, reach + POOL_TEXEL_M, 0), 0, 'nothing past its reach');
});

test('pools add where they meet, held to full', () => {
  const one = readMap([lamp(0, 0)]);
  const many = readMap(Array.from({ length: 6 }, () => lamp(0, 0)));
  assert.ok(one && many);
  assert.equal(poolAt(many, 0, 0), 1);
  assert.ok(poolAt(many, 4, 0) > poolAt(one, 4, 0));
});

test('no lights, no light map', () => {
  assert.equal(readMap([]), null);
});

test("Overlook's lights cost a light map of a few megabytes and a glow a light, however many thousands there are", () => {
  // twenty thousand lamps over a city 6.6 by 5 km, as Overlook's streets spread
  const lights = Array.from({ length: 20_000 }, (_slot, index) =>
    lamp((index % 200) * 33 - 3300, Math.floor(index / 200) * 50 - 2500),
  );
  const map = readMap(lights);
  assert.ok(map);
  assert.ok(map.texels.byteLength < 4 * 1024 * 1024, `${map.texels.byteLength} bytes`);
  const glows = glowsOf(lights);
  assert.equal(glowInstances(glows, ORIGIN).length, lights.length * GLOW_FLOATS, 'one instance a lamp over the land');
});

test("a lantern's glow lays its column on the water under it, a street lamp's does not", () => {
  const [street, quay, mouth] = glowsOf([lamp(0, 0), lamp(5, 0, 'lantern'), lamp(9, 0, 'mouth')]);
  assert.equal(street?.overWaterM, undefined);
  assert.ok((quay?.overWaterM ?? 0) > 30 && (mouth?.overWaterM ?? 0) > (quay?.overWaterM ?? 0));
  assert.ok((mouth?.sizeM ?? 0) > (quay?.sizeM ?? 0), 'the mouth reads from the sea');
  assert.equal(glowInstances([quay as never], ORIGIN).length, 2 * GLOW_FLOATS, 'the light and its column');
});

test('a glow stays a few pixels across however far off, dimmed as it is drawn larger than it stands', () => {
  const near = shownSize(0.7, 50, 1000);
  const far = shownSize(0.7, 3000, 1000);
  assert.ok(near.px > LEAST_PX && near.bright === 1);
  assert.equal(far.px, LEAST_PX);
  assert.ok(far.bright < 1 && far.bright >= 0.45);
});

test("each kind's post stands from its foot to over its flame, its lantern in the glow's layer", () => {
  const [lampPost, , mouthPost] = postMeshes(1, 2);
  assert.ok(lampPost && mouthPost);
  const heights = (mesh: typeof lampPost) => mesh.positions.filter((_value, index) => index % 3 === 1);
  assert.ok(Math.min(...heights(lampPost)) >= 0 && Math.max(...heights(lampPost)) > LIGHT_LOOKS.lamp.flameM);
  assert.ok(lampPost.layers.includes(2) && lampPost.layers.includes(1));
  assert.ok(Math.max(...heights(mouthPost)) > Math.max(...heights(lampPost)));
});
