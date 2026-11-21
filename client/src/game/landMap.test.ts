import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Solid } from '../city/plan.ts';
import type { NodeLayout } from '../layout/layouts.ts';
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

const landmass = (layouts: readonly NodeLayout[] = []) =>
  ({
    plan: { social: { areas: [{ name: 'Watch Court', at: [1100, 2050] }] } },
    drawnPlan: {
      landmark: [solid('stone', 30)],
      works: [solid('stone', 6, { at: [5000, 5000, 0] })],
      social: {
        solids: [
          solid('paving', 0.3),
          solid('path', 0.05),
          solid('lawn', 0.1),
          solid('stone', 4),
          solid('timber', 0.9),
          solid('stone', 4, { shape: 'module', module: 3, group: 1 } as Partial<Solid>),
          solid('stone', 4, { shape: 'overhang', seed: 1 } as Partial<Solid>),
        ],
      },
    },
    layouts,
  }) as unknown as Pick<Landmass, 'plan' | 'drawnPlan' | 'layouts'>;

const flat = () => 20;

test("a social space's sheet is its plan: floors, walks and what stands, from its ring's corner", () => {
  const sheet = landSheetOf(SOCIAL, landmass(), flat);
  assert.deepEqual(sheet.origin, [960, 1960], 'forty metres past the ring');
  assert.deepEqual([sheet.width, sheet.height], [280, 180]);
  assert.deepEqual(sheet.ring[0], [40, 40]);
  assert.equal(sheet.floors.length, 2, 'the paving and the lawn');
  assert.equal(sheet.walks.length, 1);
  // The landmark and the wall; not the bench-high timber, a module's second group, natural rock or the far works.
  assert.equal(sheet.standing.length, 2);
  assert.deepEqual(sheet.standing[0]?.[0], [135, 88]);
});

test("a social space's keepers are marked by their counters and named, its places named, its landing marked", () => {
  const sheet = landSheetOf(SOCIAL, landmass(), flat);
  assert.deepEqual(sheet.places, [{ name: 'Watch Court', at: [140, 90] }]);
  assert.deepEqual(
    sheet.marks.map((mark) => [mark.kind, mark.name ?? '']),
    [
      ['landing', ''],
      ['vendor', 'The Mage'],
    ],
    'Shape keeps no stall',
  );
  assert.deepEqual(sheet.marks[1]?.at, [90, 62]);
});

test("a patrol area's sheet is its layout: paths, buildings, areas by name and every site", () => {
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
    areas: [{ kind: 'landing', name: 'The Landing', at: [1100, 2090], radius: 20 }],
    sites: [
      { kind: 'landing', at: [1100, 2090], radius: 20 },
      { kind: 'event', at: [1150, 2030], radius: 30, holds: 'The Clearing' },
    ],
  } as unknown as NodeLayout;
  const patrol: NodeInfo = { ...SOCIAL, id: 'reach-1', kind: 'patrol', name: 'The Reach', stations: [] };
  const sheet = landSheetOf(patrol, landmass([layout]), flat);
  assert.deepEqual(
    sheet.paths.map((path) => path.track),
    [true, false],
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
  assert.deepEqual(sheet.places, [{ name: 'The Landing', at: [140, 130] }]);
  assert.deepEqual(
    sheet.marks.map((mark) => mark.kind),
    ['landing', 'event'],
  );
});

test('land with no layout, an island, shows its ground, its edge and where players land', () => {
  const isle: NodeInfo = { ...SOCIAL, id: 'isle-cove-1', kind: 'patrol', name: 'A cove', stations: [] };
  const sheet = landSheetOf(isle, landmass(), (x) => (x < 1000 ? -1 : 3));
  assert.ok(sheet.coast.length > 0, 'its shore');
  assert.equal(sheet.standing.length, 0);
  assert.deepEqual(
    sheet.marks.map((mark) => mark.kind),
    ['landing'],
  );
});
