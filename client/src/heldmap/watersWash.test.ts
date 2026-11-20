import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ruinedPlaces } from './heldMapWaters.ts';
import { chartedWaters, HOLDER_COLOURS, labelPoints, type MapWaters, washOf, waterWords } from './watersWash.ts';

const HOLDERS = ['home', 'contested', 'grey-tithe', 'pirates'] as const;
/** A land cell, and the seam's bit on a sea cell's water, in the rows the tests write. */
const LAND = -1;
const SEAM_BIT = 0x80;

/** The waters from rows of cells, 1,000 m a cell: each its water's index, `SEAM_BIT` set on the seam, or `LAND`. */
const gridOf = (rows: readonly (readonly number[])[]): MapWaters => {
  const cells = rows.flat();
  return {
    columns: rows[0]?.length ?? 0,
    rows: rows.length,
    cellM: 1_000,
    water: Int16Array.from(cells, (cell) => (cell === LAND ? -1 : cell & ~SEAM_BIT)),
    seam: Uint8Array.from(cells, (cell) => (cell !== LAND && cell & SEAM_BIT ? 1 : 0)),
    waters: HOLDERS.map((holder, continent) => ({
      continent,
      id: `continent-${continent + 1}`,
      name: null,
      holder,
      levels: null,
    })),
    mainPorts: [],
  };
};
const rgba = (hex: string, alpha: number) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
  alpha,
];

test('each holder washes its water in its own colour, the seam as contested and hatched', () => {
  const block = (cell: number) => Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => cell));
  for (const [cell, holder] of [
    [0, 'home'],
    [2, 'grey-tithe'],
    [3, 'pirates'],
    [1, 'contested'],
    [0 | SEAM_BIT, 'contested'],
  ] as const) {
    const grid = gridOf(block(cell));
    const wash = washOf(grid, new Uint8Array(9).fill(1));
    assert.deepEqual([...wash.colour.subarray(16, 20)], rgba(HOLDER_COLOURS[holder], 255), holder);
    assert.equal(wash.hatch[4], holder === 'contested' ? 255 : 0, `${holder} hatched only if contested`);
  }
});

test('the wash lies only on charted sea, and blends across a border rather than stepping', () => {
  const grid = gridOf([
    [0, 0, 3, 3],
    [0, 0, 3, 3],
    [LAND, LAND, LAND, LAND],
  ]);
  const charted = Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const wash = washOf(grid, charted);
  const alpha = (index: number) => wash.colour[index * 4 + 3];
  // The colour is kept multiplied by its alpha: divided back out, as the map's shader does.
  const red = (index: number) => ((wash.colour[index * 4] ?? 0) * 255) / (alpha(index) ?? 1);
  // A land cell far from any sea would have none; here every cell touches sea, but a cell next to land holds less.
  assert.ok((alpha(8) ?? 0) < (alpha(1) ?? 0), 'land dims the wash beside it');
  const [home, pirates] = [rgba(HOLDER_COLOURS.home, 0)[0] ?? 0, rgba(HOLDER_COLOURS.pirates, 0)[0] ?? 0];
  assert.ok(red(1) > home && red(1) < pirates, 'the cell beside the border is blended');
  assert.ok(red(2) > home && red(2) < pirates, 'from both sides');
  const uncharted = washOf(grid, Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]));
  assert.equal(uncharted.colour[0 * 4 + 3], 0, 'sea away from the charted has no wash');
  assert.ok((uncharted.colour[3 * 4 + 3] ?? 0) > 0, 'the charted cell and those by it do');
  const none = washOf(grid, new Uint8Array(12));
  assert.ok(
    none.colour.every((byte) => byte === 0),
    'nothing charted, no wash',
  );
  assert.throws(() => washOf(grid, new Uint8Array(3)), /not on the waters’ grid/);
});

test('a water is lettered from its sea cell farthest from land, other waters and the edge, once charted', () => {
  const grid = gridOf([
    [0, 0, 0, 0, 0, 2, 2],
    [0, 0, 0, 0, 0, 2, 2],
    [0, 0, 0, 0, 0, 2, 2],
    [0, 0, 0, 0, 0, LAND, LAND],
    [0, 0, 0, 0, 0, LAND, LAND],
  ]);
  const points = labelPoints(grid);
  assert.deepEqual(points.get(0), [2_500, 2_500], 'the middle of the open water');
  const [x, y] = points.get(2) ?? [0, 0];
  assert.equal(grid.water[Math.floor(y / 1_000) * grid.columns + Math.floor(x / 1_000)], 2, 'inside its own water');
  const charted = new Uint8Array(grid.water.length);
  charted[5] = 1;
  assert.deepEqual([...chartedWaters(grid, charted)], [2]);
  assert.equal(
    waterWords({ continent: 7, id: 'continent-8', name: 'The Fen Deeps', holder: 'grey-tithe', levels: [22, 26] }),
    'The Fen Deeps, 22-26',
  );
});

test('a city that is no port is drawn as ruins and named so; the ports as they are', () => {
  const place = (city: string, name: string) =>
    ({ id: `${city}-port`, name, kind: 'port', at: [0, 0], sail: [0, 0] }) as const;
  const node = { id: 'overlook-social', name: 'Overlook', kind: 'social', at: [0, 0], sail: [0, 0] } as const;
  const shown = ruinedPlaces([place('overlook', 'Overlook'), place('ashgrove', 'Ashgrove'), node], ['overlook']);
  assert.deepEqual(
    shown.map((each) => [each.kind, each.name]),
    [
      ['port', 'Overlook'],
      ['ruin', 'Ruins of Ashgrove'],
      ['social', 'Overlook'],
    ],
  );
  assert.equal(ruinedPlaces([place('ashgrove', 'Ashgrove')], null)[0]?.kind, 'port', 'before the waters are open');
});
