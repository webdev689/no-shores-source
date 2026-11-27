import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anchorageLeft, lieOffRegionLeft, zoneLeft } from './regionLeft.ts';

/** Off Overlook, on the Beacon Shore; the Beacon Shore's anchorage, off the Saltgrass Downs; the Weirlands'; and the
 *  Cairn Heights', off another island (`regions.json`). */
const OFF_OVERLOOK: [number, number] = [2_809_000, 1_200_000];
const BEACON_SHORE: [number, number] = [2_805_282, 1_196_621];
const WEIRLANDS: [number, number] = [2_334_343, 1_824_977];
const CAIRN_HEIGHTS: [number, number] = [942_003, 183_118];

test("leaving a zone of another region finds the ship at that region's anchorage; of its own, where it lay", () => {
  assert.deepEqual(anchorageLeft('saltgrass-downs', WEIRLANDS, 'continent-1'), BEACON_SHORE, 'off the Weirlands');
  assert.equal(anchorageLeft('saltgrass-downs', OFF_OVERLOOK, 'continent-1'), null, 'the Beacon Shore, as it lies off');
  assert.equal(anchorageLeft('nowhere', OFF_OVERLOOK, 'continent-1'), null);
});

test('a ship in another island’s waters, or in none, stays where it lies whatever zone was left', () => {
  assert.equal(anchorageLeft('saltgrass-downs', CAIRN_HEIGHTS, 'continent-2'), null);
  assert.equal(anchorageLeft('saltgrass-downs', WEIRLANDS, null), null);
});

test('the ship lies off the nearest region of the left zone’s own island, though another island’s centre is nearer', () => {
  // Off continent-8's coast: the Windward Plateau's centre, on another island, is the nearest of all; the Bell Fens's
  // is the nearest of its own, so leaving the Bogmire Sloughs moves nothing.
  assert.equal(anchorageLeft('bogmire-sloughs', [4_234_000, 1_231_000], 'continent-8'), null);
});

test('back at sea from the Saltgrass Downs the ship lies at the anchorage facing as it did, asked by it as the page joins', () => {
  const laid: { x: number; y: number; heading: number }[] = [];
  const seaIn = (island: string | null, position = WEIRLANDS) => ({
    position,
    heading: 1.5,
    waterAt: () => (island === null ? null : { island }),
    passage: { placeAt: (lie: (typeof laid)[number]) => laid.push(lie) },
  });
  lieOffRegionLeft(seaIn('continent-1') as never, 'saltgrass-downs');
  assert.deepEqual(laid, [{ x: BEACON_SHORE[0], y: BEACON_SHORE[1], heading: 1.5 }]);
  lieOffRegionLeft(seaIn('continent-1', OFF_OVERLOOK) as never, 'saltgrass-downs');
  lieOffRegionLeft(seaIn('continent-1') as never, null);
  lieOffRegionLeft(seaIn('continent-2') as never, 'saltgrass-downs');
  assert.equal(laid.length, 1, 'from its own region, from no zone or off another island, it lies where it was');
});

test('only a patrol zone’s own land is a zone left: never its dungeon, a run, a test copy, a passage or a dungeon', () => {
  const foot = (kind: string, more: object = {}) =>
    ({ node: { id: 'saltgrass-downs', kind }, dungeon: null, run: null, launchedFor: null, ...more }) as never;
  assert.equal(zoneLeft(foot('patrol')), 'saltgrass-downs');
  // Launched for a Breach's real run, the player stood in the zone's own room.
  const launched = foot('patrol', { launchedFor: 'node-saltgrass-downs--breach-normal--run-abcd1234' });
  assert.equal(zoneLeft(launched), 'saltgrass-downs');
  assert.equal(zoneLeft(null), null);
  for (const left of [
    foot('dungeon'),
    foot('mission'),
    foot('patrol', { dungeon: {} }),
    foot('patrol', { run: {} }),
    foot('patrol', { launchedFor: 'node-saltgrass-downs--breach-normal--test-abcd1234' }),
    // A passage zone above ground stands as a patrol by its own room's name, which no region lists.
    foot('patrol', { node: { id: 'passage-continent-1--1--2', kind: 'patrol' } }),
  ])
    assert.equal(zoneLeft(left), null);
});
