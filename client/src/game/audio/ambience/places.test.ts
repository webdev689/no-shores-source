import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seeded } from './dsp.ts';
import { type Lay, SHORE_REACH_M, cityPoint, placeCall, riverNear, shoreOf, shorePoints } from './places.ts';
import type { Spot } from './scapes.ts';

/** Land north of a straight coast at y = 200 (the sea south of it), rising to a ridge in the north-east; a river
 *  running north to south at x = 80; a port city's harbour, plaza and smith. */
const lay: Lay = {
  heightAt: (x, y) => (y > 200 ? -10 : 2 + Math.max(0, (x - y) / 10)),
  outline: [
    [-5000, -5000],
    [5000, -5000],
    [5000, 200],
    [-5000, 200],
  ],
  rivers: [
    {
      points: [
        [80, -2000],
        [80, 200],
      ],
    },
  ],
  harbour: [40, 190],
  city: [0, -100],
  plaza: { bounds: [-100, -40, 100, 40], level: 30 },
  smithy: [-80, -35, 31.2],
};
const bare: Lay = { ...lay, rivers: [], harbour: null, city: null, plaza: null, smithy: null };

test('the shore and the river are found where they are, and not past their reach', () => {
  assert.deepEqual(shoreOf([0, 0], lay.outline), { at: [0, 200], distance: 200 });
  assert.deepEqual(riverNear([0, 0], lay.rivers), [80, 0]);
  assert.equal(riverNear([-400, 0], lay.rivers), null);
  assert.equal(shorePoints([0, 0], lay.outline).length, 2);
  assert.equal(shorePoints([0, 200 - SHORE_REACH_M - 1], lay.outline).length, 0);
  assert.deepEqual(cityPoint(lay), [24, 114]);
  assert.equal(cityPoint(bare), null);
});

test('each call is placed at its kind of spot, within its distance and height', () => {
  const random = seeded(11);
  const ear = [0, 0, 3.7] as const;
  const range = { distance: [10, 50], lift: [4, 12] } as const;
  for (let nth = 0; nth < 300; nth++) {
    const canopy = placeCall('canopy', ear, lay, range, random);
    assert.ok(canopy && lay.heightAt(canopy[0], canopy[1]) >= 0.5, 'a bird in the trees stands over land');
    const around = placeCall('around', ear, lay, range, random);
    assert.ok(around);
    const away = Math.hypot(around[0], around[1]);
    assert.ok(away >= 10 - 1e-9 && away <= 50 + 1e-9);
    const shore = placeCall('shore', ear, lay, { distance: [0, 60], lift: [0, 1] }, random);
    assert.ok(shore && shore[1] === 200, 'a wave breaks on the shore');
    const harbour = placeCall('harbour', ear, lay, { distance: [0, 30], lift: [1, 2] }, random);
    assert.ok(harbour && Math.hypot(harbour[0] - 40, harbour[1] - 190) <= 30 + 1e-9);
    const plaza = placeCall('plaza', ear, lay, { distance: [0, 1], lift: [3, 9] }, random);
    assert.ok(plaza && plaza[0] >= -100 && plaza[0] <= 100 && plaza[2] >= 33 && plaza[2] <= 39);
    const hull = placeCall('hull', ear, lay, { distance: [1.5, 8], lift: [-2.5, 0] }, random);
    assert.ok(hull && hull[2] <= 3.7 && hull[2] >= 1.2);
  }
});

test('a wolf howls from the highest ground near, gulls fly over the water, and a port city places only there', () => {
  const random = seeded(5);
  const ear = [0, 0, 3.7] as const;
  const ridge = placeCall('ridge', ear, lay, { distance: [150, 600], lift: [2, 2] }, random);
  assert.ok(ridge);
  assert.ok(ridge[0] - ridge[1] > 300, 'the ridge is on the high ground to the north-east');
  const gull = placeCall('offshore', ear, lay, { distance: [20, 90], lift: [10, 35] }, random);
  assert.ok(gull && gull[1] > 200, 'over the sea, past the shore');
  const atSea = placeCall('offshore', [0, 1000, 3], lay, { distance: [20, 90], lift: [10, 35] }, random);
  assert.ok(atSea && Math.hypot(atSea[0], atSea[1] - 1000) <= 90 + 1e-9, 'round the ship at sea');
  for (const spot of ['harbour', 'city', 'plaza', 'smithy'] satisfies Spot[])
    assert.equal(placeCall(spot, ear, bare, { distance: [0, 10], lift: [0, 1] }, random), null);
  const inland = placeCall('shore', [0, -2000, 2], lay, { distance: [0, 60], lift: [0, 1] }, random);
  assert.equal(inland, null, 'no wave breaks far inland');
});
