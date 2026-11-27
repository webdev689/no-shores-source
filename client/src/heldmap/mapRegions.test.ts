import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeldMap } from './heldMap.ts';
import { MapAsk } from './heldMapAsk.ts';
import { type MapRegion, regionsOf } from '../overworld/regions.ts';
import { MapRegions, middleOf, paintCard, regionAt, regionCells } from './mapRegions.ts';
import { recorder } from './painterForTests.ts';
import { INK } from './mapKey.ts';
import { PARCHMENT } from './mapLetters.ts';
import { difficultyColour, type MapWaters } from './watersWash.ts';
import type { Point2 } from '../overworld/ground.ts';
import { readFileSync } from 'node:fs';

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
// The other island's region's centre lies nearer its land's west edge than the Grey Reach's does, and its land is
// still its own.
const ringOf = (west: number, east: number): Point2[] => [
  [west, 0],
  [east, 0],
  [east, 100],
  [west, 100],
];
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
  [
    { id: 'continent-1', outline: ringOf(100, 400) },
    { id: 'continent-2', outline: ringOf(500, 600) },
  ],
);
const [shore, reach] = regions;
const judged = { waters, judge: () => ({ continent: 0, holder: 'home' as const }) };

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
  lit.names = { 'continent-1': 'Saltmere' };
  const ask = { pointer: { x: 140, y: 50 }, cellsNow: () => Uint8Array.from([9]) };
  const view = { left: 0, top: 0, scale: 1 };
  const ink = { x: 0, y: 0, width: 600, height: 100 };
  assert.deepEqual([...(lit.hover(judged, [40, 50], view, ink, ask, null) ?? [])], [0, 255, 0, 0, 0, 0]);
  assert.equal(lit.said()?.line, 'The Beacon Shore');
  assert.deepEqual([lit.said()?.card, lit.said()?.caption], [true, 'Saltmere'], 'on its card, its island under it');
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

test("a region's name stands anew by the pointer once the map moves, and nothing is lit off the map", () => {
  const lit = new MapRegions();
  lit.all = regions;
  const ask = { pointer: { x: 140, y: 50 }, cellsNow: () => Uint8Array.from([9]) };
  const ink = { x: 0, y: 0, width: 600, height: 100 };
  assert.ok(lit.hover(judged, [40, 50], { left: 0, top: 0, scale: 1 }, ink, ask, null));
  ask.pointer = { x: 180, y: 40 };
  assert.equal(lit.hover(judged, [40, 50], { left: 0, top: 0, scale: 1 }, ink, ask, null), null);
  assert.deepEqual([lit.said()?.x, lit.said()?.y], [140, 50], 'within it, where the pointer came in');
  // Panned by 20 m: the Beacon Shore still under the pointer, its name stands where the pointer is now.
  assert.equal(lit.hover(judged, [40, 50], { left: -20, top: 0, scale: 1 }, ink, ask, null), null);
  assert.deepEqual([lit.said()?.x, lit.said()?.y], [180, 40], 'after a pan, by the pointer');
  // The pointer off the map, though the world under it is the region's land: nothing lit.
  const narrow = { x: 0, y: 0, width: 100, height: 100 };
  assert.deepEqual([...(lit.hover(judged, [40, 50], { left: 0, top: 0, scale: 1 }, narrow, ask, null) ?? [])], [9]);
  assert.equal(lit.said(), null, 'off the map nothing is named');
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

/** Whether a point lies inside a ring, by the crossings of a line east from it. */
function inside(ring: readonly Point2[], [x, y]: Point2): boolean {
  let crossed = false;
  ring.forEach(([fromX, fromY], index) => {
    const [toX, toY] = ring[(index + 1) % ring.length] ?? [fromX, fromY];
    if (fromY > y !== toY > y && x < fromX + ((y - fromY) / (toY - fromY)) * (toX - fromX)) crossed = !crossed;
  });
  return crossed;
}

test("every point of an island's land lights a region of that island, and of no other, over the world's own", () => {
  const read = (name: string) => readFileSync(new URL(`../../../content/world/${name}`, import.meta.url), 'utf8');
  const islands = (JSON.parse(read('layout.json')) as { continents: { id: string; outline: Point2[] }[] }).continents;
  const world = regionsOf(read('regions.json'), islands);
  const [columns, rows, cellM] = [480, 310, 10_000];
  const middleOf = (cell: number): Point2 => [
    ((cell % columns) + 0.5) * cellM,
    (Math.floor(cell / columns) + 0.5) * cellM,
  ];
  // Land where an island's outline holds a cell's middle, the sea elsewhere.
  const owners = Array.from({ length: columns * rows }, (unused, cell) => {
    return islands.find((island) => inside(island.outline, middleOf(cell)))?.id ?? null;
  });
  const water = Int16Array.from(owners, (owner) => (owner ? -1 : 0));
  const land: MapWaters = { columns, rows, cellM, water, waters: [], mainPorts: [] };
  const sampled = new Map<string, number>();
  owners.forEach((owner, cell) => {
    if (!owner) return;
    sampled.set(owner, (sampled.get(owner) ?? 0) + 1);
    for (const { id } of islands) {
      const region = regionAt(land, world, id, middleOf(cell));
      if (id === owner)
        assert.equal(region?.island, id, `${id}'s land at ${middleOf(cell)} lies in a region of its own`);
      else assert.equal(region, null, `${owner}'s land at ${middleOf(cell)} is not ${id}'s`);
    }
  });
  assert.equal(sampled.size, islands.length, 'every island sampled');
  // A region's land lit whole is the land each of its points is judged to be.
  for (const region of world.filter((each) => each.island === 'continent-8')) {
    const cells = regionCells(land, world, region);
    for (let cell = 0; cell < cells.length; cell++)
      assert.equal(cells[cell] === 255, regionAt(land, world, 'continent-8', middleOf(cell)) === region, region.name);
  }
});

test("a hovered name's card is parchment in a double rule of ink, diamonds at its corners, whole inside the map", () => {
  const { painter, calls, texts, depth } = recorder();
  paintCard(painter, { line: 'The Beacon Shore', caption: 'Saltmere' }, [590, 4], { width: 600, height: 300 }, 1);
  assert.deepEqual(texts(), ['The Beacon Shore', 'Saltmere']);
  const fills = calls.filter((call) => call.name === 'fillRect');
  assert.equal(fills[0]?.fillStyle, PARCHMENT);
  const rules = calls.filter((call) => call.name === 'strokeRect');
  assert.equal(rules.length, 2, 'a double rule');
  assert.equal(calls.filter((call) => call.name === 'fill' && call.fillStyle === INK).length, 4, 'four diamonds');
  const [x, y] = calls.find((call) => call.name === 'translate')?.args as number[];
  const [left, top, width, height] = fills[0]?.args as number[];
  assert.ok(x + left >= 0 && x + left + width <= 600, 'inside the map across');
  assert.ok(
    y + top >= 0 && y + top + height <= 300,
    'inside the map down: under the point where over it would not fit',
  );
  assert.equal(depth(), 0);
});

test("a named island is lettered at its outline's middle with its water's level band; an unnamed one is not", () => {
  assert.deepEqual(middleOf(ringOf(100, 400)), [250, 50]);
  const islands = new MapRegions();
  islands.all = regions;
  islands.names = { 'continent-1': 'Saltmere' };
  const letters = islands.islandLetters(
    waters,
    (x, y) => [x / 2, y / 2],
    () => true,
  );
  assert.deepEqual(letters, [{ text: 'Saltmere', band: '1-4', colour: difficultyColour([1, 4]), x: 125, y: 25 }]);
  assert.deepEqual(
    islands.islandLetters(
      waters,
      (x, y) => [x, y],
      () => false,
    ),
    [],
    'none off the sheet',
  );
});

test("the pointer over a port's anchor shows its name on a card, before the region under it", () => {
  const map = Object.create(HeldMap.prototype) as HeldMap;
  const place = { id: 'overlook-port', name: 'Overlook', kind: 'port', at: [140, 50], sail: [140, 50] };
  const ask = new MapAsk();
  ask.pointer = { x: 143, y: 52 };
  Object.assign(map, { ink: { x: 0, y: 0, width: 600, height: 100 }, placed: [{ place, x: 140, y: 50 }], ask });
  const said = (map as unknown as { portUnder(): unknown }).portUnder();
  assert.deepEqual(said, { line: 'Overlook', x: 140, y: 50, card: true });
  ask.pointer = { x: 300, y: 50 };
  assert.equal((map as unknown as { portUnder(): unknown }).portUnder(), null, 'none away from every anchor');
});
