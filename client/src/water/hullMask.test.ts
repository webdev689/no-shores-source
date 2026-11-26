import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HULL_WGSL,
  type HullMask,
  hullFoam,
  hullInside,
  lineAt,
  STATIONS,
  stationPlace,
  stationShare,
} from './hullMask.ts';

const SLOOP_AT_REST: HullMask = { x: 0, y: 0, heading: 0, halfLength: 3, halfBeam: 1, way: 0 };

test('no water stands inside its waterline; a metre past its beam it does', () => {
  assert.equal(hullInside(SLOOP_AT_REST, [0, 0], 0.01), 1);
  assert.equal(hullInside(SLOOP_AT_REST, [0, -2], 0.01), 1, 'forward, inside its length');
  assert.equal(hullInside(SLOOP_AT_REST, [2, 0], 0.01), 0, 'a metre off its starboard side (east, heading north)');
  assert.equal(
    hullInside({ ...SLOOP_AT_REST, heading: Math.PI / 2 }, [2, 0], 0.01),
    1,
    'heading east, that is its bow',
  );
});

test('foam gathers round it at way, most at its bow, and none at rest', () => {
  const underWay = { ...SLOOP_AT_REST, way: 2 };
  const [bow, stern] = [hullFoam(underWay, [0, -3.05]), hullFoam(underWay, [0, 3.05])];
  assert.equal(hullFoam(SLOOP_AT_REST, [0, -3.05]), 0);
  assert.ok(bow > 0.5 && bow > stern * 2, `bow ${bow}, stern ${stern}`);
  assert.equal(hullFoam(underWay, [0, -5]), 0, 'two metres off its bow the band is gone');
  assert.equal(hullFoam(underWay, [0, 0]), 0, 'none inside it');
});

test('each station stands where its place says, and a line reads its own value there', () => {
  const line = Float32Array.from({ length: STATIONS }, (_value, station) => Math.sin(station) * 0.5 + 0.5);
  for (let station = 0; station < STATIONS; station++) {
    assert.ok(Math.abs(stationPlace(stationShare(station)) - station) < 1e-9, `station ${station} placed back`);
    assert.ok(Math.abs(lineAt(line, stationShare(station)) - (line[station] ?? 0)) < 1e-6, `line at ${station}`);
  }
  assert.ok(stationShare(1) - stationShare(0) < stationShare(8) - stationShare(7), 'closer at its ends');
});

test("the water's WGSL places stations along its hull as the TypeScript does", () => {
  const found =
    /let place = \(asin\(clamp\(share, -1\.0, 1\.0\)\) \/ ([\d.]+) \+ 1\.0\) \* 0\.5 \* f32\(STATIONS - 1u\);/.exec(
      HULL_WGSL,
    );
  assert.ok(found, 'hull_half_beam places a share as stationPlace does');
  const quarter = Number(found[1]);
  for (const share of [-1, -0.97, -0.6, 0, 0.3, 0.88, 1]) {
    const wgsl = (Math.asin(share) / quarter + 1) * 0.5 * (STATIONS - 1);
    assert.ok(Math.abs(wgsl - stationPlace(share)) < 1e-5, `at ${share}: ${wgsl} against ${stationPlace(share)}`);
  }
});
