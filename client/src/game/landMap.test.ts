import assert from 'node:assert/strict';
import { test } from 'node:test';
import manifest from '../../../content/modules/modules.json' with { type: 'json' };
import type { Solid } from '../city/plan.ts';
import type { NodeLayout } from '../layout/layouts.ts';
import { tableRows } from '../heldmap/landTable.ts';
import { landSheetOf } from './landMap.ts';
import type { Landmass } from './landmass.ts';
import type { NodeInfo } from './worldData.ts';

const RING = [
  [1000, 2000],
  [1200, 2000],
  [1200, 2100],
  [1000, 2100],
] as const;

const SOCIAL: NodeInfo = {
  id: 'overlook-social',
  kind: 'social',
  name: 'Overlook',
  continent: 'continent-1',
  ring: RING,
  spawns: [
    [1100, 2090],
    [1110, 2090],
  ],
  centre: [1100, 2050],
  stations: [
    { kind: 'mage', keeper: [1050, 2020], counter: [1050, 2022] },
    { kind: 'shape', keeper: [1060, 2020], counter: [1060, 2022] },
    { kind: 'chandler', keeper: [1070, 2020], counter: [1070, 2022] },
  ],
};

const solid = (material: Solid['material'], height: number, shape: Partial<Solid> = {}): Solid =>
  ({
    shape: 'block',
    at: [1100, 2050, 30],
    size: [10, 4, height],
    turn: 0,
    lean: 0,
    roll: 0,
    material,
    ...shape,
  }) as Solid;

/** The range of the hub's ranges with its arched passage: two piers, a lintel over the way and parapets. */
const GATE = manifest.modules.findIndex((module) => module.name === 'range-gate');

const landmass = (layouts: readonly NodeLayout[] = [], nodes: readonly NodeInfo[] = []) =>
  ({
    plan: { social: { areas: [{ name: 'Watch Court', at: [1100, 2050] }] } },
    drawnPlan: {
      landmark: [solid('stone', 30)],
      // The harbour way's wall, inside the ring, and an avenue's past it.
      works: [solid('stone', 6), solid('stone', 6, { at: [1220, 2050, 30] })],
      social: {
        solids: [
          solid('paving', 0.3),
          solid('path', 0.05),
          solid('lawn', 0.1),
          solid('stone', 4),
          solid('timber', 0.9),
          solid('stone', 4, { shape: 'module', module: 3, group: 1 } as Partial<Solid>),
          solid('stone', 4, { shape: 'overhang', seed: 1 } as Partial<Solid>),
          // A roof over a stall, its underside 4 m up.
          solid('roof', 1, { at: [1100, 2050, 34] }),
          solid('stone', 12, { shape: 'module', module: GATE, group: 0 } as Partial<Solid>),
        ],
        plants: [
          { growth: 'tree', at: [1080, 2040, 30], turn: 0, scale: 1 },
          { growth: 'bush', at: [1082, 2040, 30], turn: 0, scale: 1 },
        ],
      },
    },
    view: {
      rivers: [
        {
          points: [
            [900, 2050],
            [1300, 2050],
          ],
          flow: [4, 4],
        },
      ],
    },
    layouts,
    nodes,
  }) as unknown as Pick<Landmass, 'plan' | 'drawnPlan' | 'layouts' | 'view' | 'nodes'>;

/** Ground level with the plan's foot. */
const flat = () => 30;

test("a social space's sheet is its plan, from its ring's corner: grounds, walks, what stands, tall, low or overhead", () => {
  const sheet = landSheetOf(SOCIAL, landmass(), flat);
  assert.deepEqual(sheet.origin, [960, 1960], 'forty metres past the ring');
  assert.deepEqual([sheet.width, sheet.height], [280, 180]);
  assert.deepEqual(sheet.ring[0], [40, 40]);
  assert.deepEqual(
    sheet.grounds.map((ground) => ground.kind),
    ['paving', 'lawn'],
  );
  assert.equal(sheet.walks.length, 1);
  // The landmark, the harbour way's wall, the stone and the gate's two piers; not a module's second group, natural rock
  // or the city's avenues past the ring.
  assert.equal(sheet.standing.length, 5);
  assert.deepEqual(sheet.standing[0]?.[0], [135, 88]);
  assert.equal(sheet.low.length, 1, 'the bench-high timber');
  // The roof, and over the gate's passage its lintel and both parapets: walked under, so outlined, not filled.
  assert.equal(sheet.overhead.length, 4);
  assert.deepEqual(sheet.plants, [
    { tree: true, at: [120, 80] },
    { tree: false, at: [122, 80] },
  ]);
});

test("a module is read by its parts: the gate's way through stays open between its piers", () => {
  const sheet = landSheetOf(SOCIAL, landmass(), flat);
  const piers = sheet.standing.slice(-2).map((quad) => quad.map(([east]) => east));
  // The piers stand 3 to 6 m either side of the gate's middle (140 on the sheet); the 6 m between them is open.
  assert.deepEqual(
    piers.map((eastings) => [Math.min(...eastings), Math.max(...eastings)]),
    [
      [134, 137],
      [143, 146],
    ],
  );
});

test('a river is drawn where it runs across the sheet, as wide as its flow makes it', () => {
  const { rivers } = landSheetOf(SOCIAL, landmass(), flat);
  assert.ok(rivers.length > 0);
  for (const river of rivers) {
    assert.equal(river.width, 2.4 * 2 + 1.5);
    assert.equal(river.from[1], 90);
  }
});

test("a social space's keepers are marked by their glyphs at their counters, its places named, its landing marked", () => {
  const sheet = landSheetOf(SOCIAL, landmass(), flat);
  assert.deepEqual(sheet.places, [{ name: 'Watch Court', at: [140, 90] }]);
  assert.deepEqual(
    sheet.marks.map((mark) => [mark.glyph, mark.word]),
    [
      ['landing', 'Landing'],
      ['mage', 'The Mage'],
      ['chandler', 'Chandler'],
    ],
    'Shape keeps no stall',
  );
  assert.deepEqual(sheet.marks[1]?.at, [90, 62]);
});

test("a patrol area's sheet is its layout: paths, buildings, plantings, areas by name and every site's glyph", () => {
  const layout = {
    id: 'reach-1',
    ring: RING,
    paths: [
      {
        tier: 'track',
        points: [
          [1000, 2050],
          [1200, 2050],
        ],
        heights: [],
        crossings: [],
      },
      {
        tier: 'footpath',
        points: [
          [1100, 2000],
          [1100, 2100],
        ],
        heights: [],
        crossings: [],
      },
    ],
    buildings: [{ footprint: [1010, 2010, 1020, 2030] }],
    solids: [],
    plantings: [
      { kind: 'oak', points: [[1050, 2050]] },
      { kind: 'gorse', points: [[1051, 2050]] },
    ],
    areas: [{ kind: 'landing', name: 'The Landing', at: [1100, 2090], radius: 20 }],
    sites: [
      { kind: 'landing', at: [1100, 2090], radius: 20 },
      { kind: 'event', at: [1150, 2030], radius: 30, holds: 'The Clearing' },
      { kind: 'resource', at: [1160, 2030], radius: 2, holds: 'brineglass', node: [1160, 2035] },
      { kind: 'resource', at: [1170, 2030], radius: 2, holds: 'amber', node: [1170, 2035] },
      { kind: 'resource', at: [1180, 2030], radius: 2, holds: 'brineglass' },
    ],
  } as unknown as NodeLayout;
  const patrol: NodeInfo = { ...SOCIAL, id: 'reach-1', kind: 'patrol', name: 'The Reach', stations: [] };
  const sheet = landSheetOf(patrol, landmass([layout]), flat);
  assert.deepEqual(
    sheet.paths.map((path) => [path.track, path.width]),
    [
      [true, 4.5],
      [false, 2.6],
    ],
    'each as wide as the layout lays it',
  );
  assert.deepEqual(sheet.paths[0]?.points, [
    [40, 90],
    [240, 90],
  ]);
  assert.deepEqual(sheet.standing, [
    [
      [50, 50],
      [60, 50],
      [60, 70],
      [50, 70],
    ],
  ]);
  assert.deepEqual(
    sheet.plants.map((plant) => plant.tree),
    [true, false],
  );
  assert.deepEqual(sheet.places, [{ name: 'The Landing', at: [140, 130] }]);
  assert.deepEqual(
    sheet.marks.map((mark) => [mark.glyph, mark.word]),
    [
      ['landing', 'Landing'],
      ['event', 'Public event'],
      ['resource', 'Brineglass'],
    ],
    "a resource node named for the island's resource; one of no island's, or with no node, left off",
  );
});

test("a patrol zone's ways across to the island's other zones and its passage gates are each their own row", () => {
  const zone = (id: string, name: string): NodeInfo => ({ ...SOCIAL, id, kind: 'patrol', name, stations: [] });
  const mission: NodeInfo = { ...SOCIAL, id: 'burned-mill', kind: 'mission', name: 'The Burned Mill', stations: [] };
  const downs = zone('saltgrass-downs', 'The Saltgrass Downs');
  const nodes = [downs, zone('gullwing-vale', 'The Gullwing Vale'), zone('driftwood-moors', 'The Driftwood Moors')];
  const layout = {
    id: downs.id,
    ring: RING,
    paths: [],
    buildings: [],
    solids: [],
    areas: [],
    sites: [
      { kind: 'gate', at: [1010, 2010], radius: 10, holds: 'gullwing-vale' },
      { kind: 'gate', at: [1020, 2010], radius: 10, holds: 'driftwood-moors' },
      { kind: 'gate', at: [1030, 2010], radius: 40, holds: 'burned-mill' },
      { kind: 'door', at: [1040, 2010], radius: 3, holds: 'The Chalk Adit' },
      { kind: 'door', at: [1050, 2010], radius: 3, holds: 'Moorhold' },
    ],
  } as unknown as NodeLayout;
  const sheet = landSheetOf(downs, landmass([layout], [...nodes, mission]), flat, ['The Chalk Adit']);
  assert.deepEqual(
    sheet.marks.map((mark) => [mark.glyph, mark.word]),
    [
      ['crossing', 'To the Gullwing Vale'],
      ['crossing', 'To the Driftwood Moors'],
      ['gate', 'Gate'],
      ['passage', 'Passage gate'],
      ['door', 'Sealed door'],
    ],
    "a gate into an instance and a run's door that is no mouth keep their marks",
  );
  assert.deepEqual(
    sheet.places.filter((place) => place.near),
    [
      { name: 'The Gullwing Vale', at: [50, 50], near: true },
      { name: 'The Driftwood Moors', at: [60, 50], near: true },
    ],
    'each way across named beside its mark',
  );
  assert.deepEqual(
    tableRows(sheet).map((row) => [row.glyph, row.word]),
    [
      ['gate', 'Gate'],
      ['crossing', 'To the Gullwing Vale'],
      ['crossing', 'To the Driftwood Moors'],
      ['door', 'Sealed door'],
      ['passage', 'Passage gate'],
      ['you', 'You'],
    ],
    'the table names each way across by its zone, and the passage gate apart from a sealed door',
  );
});

test('land with no layout, an island, shows its ground, its edge and where players land', () => {
  const isle: NodeInfo = { ...SOCIAL, id: 'isle-cove-1', kind: 'patrol', name: 'A cove', stations: [] };
  const sheet = landSheetOf(isle, landmass(), (x) => (x < 1000 ? -1 : 3));
  assert.ok(sheet.coast.length > 0, 'its shore');
  assert.equal(sheet.standing.length, 0);
  assert.deepEqual(
    sheet.marks.map((mark) => mark.glyph),
    ['landing'],
  );
});
