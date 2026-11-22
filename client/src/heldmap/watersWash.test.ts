import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ruinedPlaces } from './heldMapWaters.ts';
import {
  chartedWaters,
  difficultyColour,
  HOLDER_COLOURS,
  HATCHES,
  MAP_PARCHMENT,
  washedOver,
  type WaterHolder,
  labelPoints,
  levelColour,
  type MapWaters,
  washOf,
  waterWords,
} from './watersWash.ts';

const HOLDERS = ['home', 'grey-tithe', 'lattice'] as const;
/** A land cell in the rows the tests write. */
const LAND = -1;

/** The waters from rows of cells, 1,000 m a cell: each its water's index, or `LAND`. */
const gridOf = (rows: readonly (readonly number[])[]): MapWaters => {
  const cells = rows.flat();
  return {
    columns: rows[0]?.length ?? 0,
    rows: rows.length,
    cellM: 1_000,
    water: Int16Array.from(cells),
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

test('each holder washes its water in its own colour; the Lattice and the Tithe hatched', () => {
  const block = (cell: number) => Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => cell));
  for (const [cell, holder] of [
    [0, 'home'],
    [1, 'grey-tithe'],
    [2, 'lattice'],
  ] as const) {
    const grid = gridOf(block(cell));
    const wash = washOf(grid, new Uint8Array(9).fill(1));
    assert.deepEqual([...wash.colour.subarray(16, 20)], rgba(HOLDER_COLOURS[holder], 255), holder);
    assert.deepEqual(
      [wash.hatch[8], wash.hatch[9]],
      [holder === 'lattice' ? 255 : 0, holder === 'grey-tithe' ? 255 : 0],
      `${holder}'s hatching`,
    );
  }
});

test('the wash lies only on charted sea, and blends across a border rather than stepping', () => {
  const grid = gridOf([
    [0, 0, 2, 2],
    [0, 0, 2, 2],
    [LAND, LAND, LAND, LAND],
  ]);
  const charted = Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const wash = washOf(grid, charted);
  const alpha = (index: number) => wash.colour[index * 4 + 3];
  // The colour is kept multiplied by its alpha: divided back out, as the map's shader does.
  const red = (index: number) => ((wash.colour[index * 4] ?? 0) * 255) / (alpha(index) ?? 1);
  // A land cell far from any sea would have none; here every cell touches sea, but a cell next to land holds less.
  assert.ok((alpha(8) ?? 0) < (alpha(1) ?? 0), 'land dims the wash beside it');
  const [home, lattice] = [rgba(HOLDER_COLOURS.home, 0)[0] ?? 0, rgba(HOLDER_COLOURS.lattice, 0)[0] ?? 0];
  assert.ok(red(1) > home && red(1) < lattice, 'the cell beside the border is blended');
  assert.ok(red(2) > home && red(2) < lattice, 'from both sides');
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

test('the difficulty ramp runs green at the easiest level to deep purple at the hardest, blended between', () => {
  assert.equal(levelColour(1), '#256327');
  assert.equal(levelColour(30), '#5a1f6e');
  assert.equal(levelColour(22), '#a3241f', 'a stop is its own colour');
  assert.equal(levelColour(0), '#256327', 'under the easiest, the easiest');
  assert.equal(levelColour(40), '#5a1f6e', 'past the hardest, the hardest');
  const greens = [1, 8, 15, 22].map((level) => Number.parseInt(levelColour(level).slice(3, 5), 16));
  assert.ok(
    greens.every((green, index) => index === 0 || green < (greens[index - 1] ?? 0)),
    `${greens}`,
  );
});

test('a water takes the colour of the middle of its level band; one with no band takes none', () => {
  assert.equal(difficultyColour([1, 4]), levelColour(2.5));
  assert.equal(difficultyColour([26, 30]), levelColour(28));
  assert.equal(difficultyColour(null), null);
});

/** A colour, 0-255 a channel, in CIE L*a*b* (D65). */
function labOf(rgb: readonly number[]): [number, number, number] {
  const [red, green, blue] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const bend = (share: number) => (share > 0.008856 ? Math.cbrt(share) : 7.787 * share + 16 / 116);
  const x = bend((0.4124 * red + 0.3576 * green + 0.1805 * blue) / 0.95047);
  const y = bend(0.2126 * red + 0.7152 * green + 0.0722 * blue);
  const z = bend((0.0193 * red + 0.1192 * green + 0.9505 * blue) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

test('the holders’ washes are told apart on the parchment, by colour or by their hatching, and none darkens it much', () => {
  const washed = Object.fromEntries(
    (Object.keys(HOLDER_COLOURS) as WaterHolder[]).map((holder) => [
      holder,
      labOf(rgba(washedOver(holder), 0).slice(0, 3)),
    ]),
  ) as Record<WaterHolder, [number, number, number]>;
  const bare = labOf(MAP_PARCHMENT.map((channel, index) => channel * 0.92 + [58, 40, 22][index]! * 0.08));
  const holders = Object.keys(washed) as WaterHolder[];
  for (const [index, one] of holders.entries()) {
    assert.ok(bare[0] - washed[one][0] < 6, `${one}'s wash darkens the parchment by ${bare[0] - washed[one][0]}`);
    for (const other of holders.slice(index + 1)) {
      const [a, b] = [washed[one], washed[other]];
      const apart = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const hatchedApart = one in HATCHES !== other in HATCHES || (one in HATCHES && other in HATCHES);
      assert.ok(apart >= 10 || hatchedApart, `${one} and ${other}: ${apart.toFixed(1)} apart, and hatched alike`);
    }
  }
});

test('no holder is but home, the Grey Tithe and the Lattice, and the Lattice and the Tithe are hatched', () => {
  assert.deepEqual(Object.keys(HOLDER_COLOURS).sort(), ['grey-tithe', 'home', 'lattice']);
  assert.deepEqual(Object.keys(HATCHES).sort(), ['grey-tithe', 'lattice']);
});

test('a holder’s wash as the map shows it is its colour at the wash’s strength over the parchment', () => {
  // Home's teal over the parchment reads as the map's olive green, 161, 152, 110 (worked out apart from the code).
  assert.equal(washedOver('home'), '#a1986e');
});
