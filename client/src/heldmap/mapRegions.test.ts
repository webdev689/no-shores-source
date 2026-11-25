import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeldMap } from './heldMap.ts';
import { MapAsk } from './heldMapAsk.ts';
import { type MapRegion, regionsOf } from '../overworld/regions.ts';
import { MapRegions, regionAt, regionCells } from './mapRegions.ts';
import type { MapWaters } from './watersWash.ts';

// A strip of six 100 m cells: the ship's water, three cells of its island's land, the water again, and another
// island's land, whose region's centre lies far off.
const waters: MapWaters = {
  columns: 6,
  rows: 1,
  cellM: 100,
  water: Int16Array.from([0, -1, -1, -1, 0, -1]),
  waters: [{ continent: 0, id: 'continent-1', name: 'The Home Waters', holder: 'home', levels: [1, 4] }],
  mainPorts: [],
};
const regions: MapRegion[] = regionsOf(
  JSON.stringify([
    {
      island: 'continent-1',
      regions: [
        { name: 'The Beacon Shore', centre: [150, 50], anchorage: [50, 50], nodes: [] },
        { name: 'The Grey Reach', centre: [330, 50], anchorage: [450, 50], nodes: [] },
      ],
    },
    { island: 'continent-2', regions: [{ name: 'The Far March', centre: [560, 50], anchorage: [700, 50], nodes: [] }] },
  ]),
);
const [shore, reach] = regions;
const judged = { waters, judge: () => 0 };

test("each point of an island's land lies in the region whose centre is nearest, the sea and other islands in none", () => {
  assert.equal(regionAt(waters, regions, 'continent-1', [140, 50]), shore);
  assert.equal(regionAt(waters, regions, 'continent-1', [260, 50]), reach, 'nearer the Reach than the Shore');
  assert.equal(regionAt(waters, regions, 'continent-1', [40, 50]), null, 'the sea');
  assert.equal(regionAt(waters, regions, 'continent-1', [550, 50]), null, "another island's land");
  assert.equal(regionAt(waters, regions, null, [140, 50]), null, 'no water known for the ship');
  assert.deepEqual([...regionCells(waters, regions, reach ?? null)], [0, 0, 255, 255, 0, 0]);
  assert.deepEqual([...regionCells(waters, regions, null)], [0, 0, 0, 0, 0, 0]);
});

test('the pointer coming onto a region lights its land, and leaving it lights the water under it again', () => {
  const lit = new MapRegions();
  lit.all = regions;
  const ask = { pointer: { x: 140, y: 50 }, cellsNow: () => Uint8Array.from([9]) };
  const view = { left: 0, top: 0, scale: 1 };
  const ink = { x: 0, y: 0 };
  assert.deepEqual([...(lit.hover(judged, [40, 50], view, ink, ask, null) ?? [])], [0, 255, 0, 0, 0, 0]);
  assert.equal(lit.said()?.line, 'The Beacon Shore');
  assert.equal(lit.said()?.region, true, "lettered as the waters' names are");
  assert.equal(lit.hover(judged, [40, 50], view, ink, ask, null), null, 'within it nothing changes');
  ask.pointer = { x: 40, y: 50 };
  assert.deepEqual([...(lit.hover(judged, [40, 50], view, ink, ask, null) ?? [])], [9], 'the water lit again');
  assert.equal(lit.said(), null);
  ask.pointer = { x: 260, y: 50 };
  assert.ok(lit.hover(judged, [40, 50], view, ink, ask, null), 'the Reach lit');
  ask.pointer = { x: 40, y: 50 };
  assert.equal(lit.hover(null, [40, 50], view, ink, ask, null), null, 'a pan: nothing changes');
  assert.equal(lit.said()?.line, 'The Grey Reach', 'still lit while the waters are away');
  assert.deepEqual([...(lit.hover(judged, [40, 50], view, ink, ask, null) ?? [])], [9], 'let go once they are back');
});

test("a click on a region of the ship's island sets a course to its anchorage, named for the region", () => {
  const map = Object.create(HeldMap.prototype) as HeldMap;
  const planned: (readonly number[])[] = [];
  Object.assign(map, {
    phase: { kind: 'open' },
    ink: { x: 0, y: 0, width: 600, height: 100 },
    mapView: { left: 0, top: 0, scale: 1 },
    placed: [],
    waters: judged,
    shipAt: [40, 50],
    land: null,
    ask: new MapAsk(),
    regions: new MapRegions(),
    plan: (to: readonly number[]) => {
      planned.push(to);
      return { ok: true, points: [[40, 50], to] };
    },
  });
  map.regions.all = regions;
  map.pointerDown(300, 50);
  map.pointerUp(300, 50);
  const choice = (map as unknown as { choice: { at: readonly number[]; name: string } }).choice;
  assert.deepEqual([choice.at, choice.name], [[450, 50], 'The Grey Reach']);
  assert.deepEqual(planned, [[450, 50]], 'the course is planned to the anchorage, as any course is');
});
