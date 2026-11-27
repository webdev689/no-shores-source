import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchorageLeft, lieOffRegionLeft } from './regionLeft.ts';

/** Off Overlook, on the Beacon Shore, and the Weirlands' anchorage, off the Gullwing Vale (`regions.json`). */
const OFF_OVERLOOK: [number, number] = [2_809_000, 1_200_000];
const WEIRLANDS: [number, number] = [2_334_343, 1_824_977];

test("leaving a zone of another region finds the ship at that region's anchorage; of its own, where it lay", () => {
  assert.deepEqual(anchorageLeft('gullwing-vale', OFF_OVERLOOK), WEIRLANDS);
  assert.equal(anchorageLeft('gullwing-vale', WEIRLANDS), null, 'already off the Weirlands');
  assert.equal(anchorageLeft('saltgrass-downs', OFF_OVERLOOK), null, 'the Beacon Shore, as the ship lies off');
  assert.equal(anchorageLeft('overlook-social', [0, 0]), null, 'a social space is no region’s');
  assert.equal(anchorageLeft('nowhere', OFF_OVERLOOK), null);
});

test('back at sea from the Gullwing Vale the ship lies at the anchorage facing as it did, asked by it as the page joins', () => {
  const laid: { x: number; y: number; heading: number }[] = [];
  const sea = {
    position: OFF_OVERLOOK,
    heading: 1.5,
    passage: { placeAt: (lie: (typeof laid)[number]) => laid.push(lie) },
  };
  lieOffRegionLeft(sea as never, 'gullwing-vale');
  assert.deepEqual(laid, [{ x: WEIRLANDS[0], y: WEIRLANDS[1], heading: 1.5 }]);
  lieOffRegionLeft(sea as never, 'saltgrass-downs');
  lieOffRegionLeft(sea as never, null);
  assert.equal(laid.length, 1, 'from its own region, or from no node, it lies where it was');
});
