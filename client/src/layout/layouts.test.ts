import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { RUN_REACH_M, laidNodes, layoutFollower, type NodeLayout, placesOf } from './layouts.ts';

/** A layout whose section is a 100 m square round a point. */
function square(id: string, x: number, y: number): NodeLayout {
  const ring = [
    [x - 50, y - 50],
    [x + 50, y - 50],
    [x + 50, y + 50],
    [x - 50, y + 50],
  ] as const;
  return {
    id,
    kind: 'patrol',
    name: id,
    theme: '',
    ring,
    spawns: [],
    areas: [],
    paths: [],
    sites: [],
    buildings: [],
    props: [],
    tiles: [],
    solids: [],
    rooms: [],
    pads: [],
  };
}

test('the ground is painted again each time the eye moves on, and the city built only when its layouts change', () => {
  const layouts = [square('a', 0, 0), square('b', 3000, 0), square('c', 9000, 0)];
  const moves: string[] = [];
  const builds: string[] = [];
  const names = (near: readonly NodeLayout[]) => near.map((layout) => layout.id).join(',');
  const follow = layoutFollower(
    layouts,
    4000,
    1500,
    (near, spot) => moves.push(`${names(near)}@${spot[0]}`),
    (near) => builds.push(names(near)),
  );
  follow([0, 0], false);
  assert.deepEqual(moves, ['a,b@0'], 'gathered at once');
  assert.deepEqual(builds, [], 'nothing built before its tables come');
  follow([200, 0], true);
  assert.deepEqual(moves, ['a,b@0'], 'not moved far enough to gather again');
  assert.deepEqual(builds, ['a,b'], 'built once ready');
  follow([3500, 0], true);
  assert.deepEqual(moves, ['a,b@0', 'a,b@3500'], 'painted again round the new eye with the same layouts');
  assert.deepEqual(builds, ['a,b'], 'the same layouts are not built again');
  follow([6000, 0], true);
  assert.deepEqual(builds, ['a,b', 'b,c'], 'built again when the layouts near change');
});

test("a layout's places are its areas at their reach and its runs at their mouth, and its node takes them", () => {
  const laid: NodeLayout = {
    ...square('saltgrass-downs', 0, 0),
    spawns: [[0, 0]],
    areas: [{ kind: 'tower', name: 'The Old Beacon', at: [10, -20], radius: 30 }],
    runs: [{ name: 'The Chalk Adit', kind: 'mine', place: 'rock', mouth: [40, 5], line: [], beats: [], door: [60, 5] }],
  };
  const places = [
    { name: 'The Old Beacon', at: [10, -20], radius: 30 },
    { name: 'The Chalk Adit', at: [40, 5], radius: RUN_REACH_M },
  ];
  assert.deepEqual(placesOf(laid), places);
  assert.equal(RUN_REACH_M, 25);
  const drawn: Parameters<typeof laidNodes>[0][number] = {
    id: 'saltgrass-downs',
    ring: [],
    spawns: [],
    centre: [0, 0],
  };
  assert.deepEqual(laidNodes([drawn], [laid])[0]?.places, places);
  assert.equal(laidNodes([{ ...drawn, id: 'unlaid' }], [laid])[0]?.places, undefined, 'a node not laid names none');
});

test("a laid node's foes' sites are its caverns' and its runs' beats, as the bake writes them for its room", () => {
  const foes = (at: readonly [number, number], holds?: string) => ({ kind: 'foes' as const, at, radius: 10, holds });
  const laid: NodeLayout = {
    ...square('saltgrass-downs', 0, 0),
    spawns: [[0, 0]],
    areas: [
      { kind: 'coven', name: 'The Hollow', at: [10, -20], radius: 30 },
      { kind: 'camp', name: 'The Camp', at: [50, 50], radius: 30 },
    ],
    sites: [
      foes([10, -20], 'The Hollow'),
      foes([50, 50], 'The Camp'),
      foes([70, 5]),
      { kind: 'objective', at: [90, 5], radius: 20, holds: 'The Chalk Adit' },
    ],
  };
  const drawn: Parameters<typeof laidNodes>[0][number] = { id: 'saltgrass-downs', ring: [], spawns: [], centre: [0, 0] };
  assert.deepEqual(laidNodes([drawn], [laid])[0]?.foes, [
    [10, -20],
    [70, 5],
  ]);
});

test('a run whose name an area has already is left to the area, as the bake leaves it (Moorhold is both)', () => {
  const moors: NodeLayout = {
    ...square('driftwood-moors', 0, 0),
    areas: [{ kind: 'keep', name: 'Moorhold', at: [10, 10], radius: 40 }],
    runs: [
      { name: 'Moorhold', kind: 'keep', place: 'beyond', mouth: [60, 10], line: [], beats: [], door: [90, 10] },
      { name: 'The Wreck Stair', kind: 'ledge', place: 'rock', mouth: [-30, 0], line: [], beats: [], door: [-60, 0] },
    ],
  };
  assert.deepEqual(placesOf(moors), [
    { name: 'Moorhold', at: [10, 10], radius: 40 },
    { name: 'The Wreck Stair', at: [-30, 0], radius: RUN_REACH_M },
  ]);
});
