import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meshBuilder } from '../models/model.ts';
import { ceilingHeights } from './dungeonCeilings.ts';
import { HEAD_M, type KitPlacement, kitPlacements } from './dungeonKits.ts';
import type { CeilingForm, DungeonLayout, StyleKey } from './dungeonLayout.ts';
import { layModule, turnAbout } from './dungeonModules.ts';
import { FULL_PACKS } from './dungeonPacks.test.ts';

const EPS = 1e-6;

/** One room `width` by `depth` cells, `height` m to its walls' heads, rock round it: the way in on its north-west
 *  cell's west wall, the portal on its south-east cell's east wall, and pillars where given. */
function hall(
  style: StyleKey,
  ceiling: CeilingForm,
  [width, depth, height]: readonly [number, number, number],
  pillars: readonly (readonly [number, number, number])[] = [],
): DungeonLayout {
  const [columns, rows] = [width + 2, depth + 2];
  const cells = Array.from({ length: columns * rows }, (_unused, cell) => {
    const [column, row] = [cell % columns, Math.floor(cell / columns)];
    return column >= 1 && column <= width && row >= 1 && row <= depth ? 0 : -2;
  });
  const room = { x: 1, y: 1, width, depth, height, walk: 0, role: 'hall', name: 'the Hall', ceiling, look: 0 };
  return {
    name: 'The Hall of the Test',
    style,
    pictures: [122, 124],
    looks: [{ style, pictures: [122, 124] }],
    cellLooks: cells.map((kind) => (kind === -2 ? -1 : 0)),
    cell: 3.2,
    columns,
    rows,
    cells,
    ceilings: cells.map((kind) => (kind === -2 ? 0 : height)),
    rooms: [room],
    end: 0,
    wayIn: { cell: columns + 1, side: 2, room: 0 },
    arrival: { x: 5.2, y: 4.8, bearing: Math.PI / 2 },
    exitDoor: { x: 3.22, y: 4.8, width: 1.4, height: 2.4 },
    portal: { x: (width + 1) * 3.2 - 0.02, y: depth * 3.2 + 1.6, side: 0, width: 1.4, height: 2.4 },
    torches: [],
    torchReach: 8,
    fixtures: [],
    frames: [],
    doorway: { half: 0.9, jambDepth: 0.3, lintel: 2.8 },
    pillars,
    pillarHalf: 0.35,
    props: [],
    boxes: pillars.map(([x, y, top]) => [x - 0.35, y - 0.35, x + 0.35, y + 0.35, top] as const),
    landmarks: [],
    glows: [],
  };
}

const named = (placed: readonly KitPlacement[], piece: string) => placed.filter(({ module }) => module.endsWith(piece));
const boundsOf = (layout: DungeonLayout, name: string) => {
  const bounds = FULL_PACKS.get(layout.style)?.modules.get(name)?.bounds;
  assert.ok(bounds);
  return bounds;
};

/** Each wall set's cap and shaft: the cap's top, and the shaft's laid vertices' lowest and highest. */
function sets(layout: DungeonLayout) {
  const placed = kitPlacements(layout, FULL_PACKS);
  const caps = named(placed, 'wall.cap');
  const shafts = named(placed, 'wall.shaft');
  assert.equal(caps.length, shafts.length);
  assert.ok(caps.length > 0, 'a set stands');
  return caps.map((cap, index) => {
    const shaft = shafts[index];
    assert.ok(shaft);
    const mesh = meshBuilder();
    const module = FULL_PACKS.get(layout.style)?.modules.get(shaft.module);
    assert.ok(module);
    layModule(mesh, module, shaft.place, () => [1, 0]);
    const heights = Array.from(mesh.model().positions.filter((_value, index) => index % 3 === 2));
    return {
      cap,
      top: cap.place.origin[2] + boundsOf(layout, cap.module)[5],
      low: Math.min(...heights),
      high: Math.max(...heights),
    };
  });
}

test('in a room 2.8 m high a wall set and a pillar still stand: base, shaft and cap meeting, the cap’s top at 2.8 m', () => {
  const layout = hall('crypt', 'flat', [3, 3, 2.8], [[6.4, 6.4, 2.8]]);
  for (const { cap, top, low, high } of sets(layout)) {
    assert.ok(Math.abs(top - 2.8) < EPS, 'the cap meets the ceiling');
    assert.ok(Math.abs(low - 0.5) < 1e-5 && Math.abs(high - cap.place.origin[2]) < 1e-5, 'the shaft from base to cap');
  }
  const placed = kitPlacements(layout, FULL_PACKS);
  const [capital] = named(placed, 'pillar.capital');
  assert.ok(capital && Math.abs(capital.place.origin[2] + 0.6 - 2.8) < EPS);
  assert.equal(named(placed, 'feature.a').length, 0, 'a 3 m feature finds no wall low enough');
});

test('in a hall 5.6 m high the shaft stretches from the base to the cap, the cap’s top at the ceiling', () => {
  for (const { cap, top, low, high } of sets(hall('halls', 'flat', [5, 4, 5.6]))) {
    assert.ok(Math.abs(top - 5.6) < EPS);
    assert.ok(Math.abs(low - 0.5) < 1e-5 && Math.abs(high - cap.place.origin[2]) < 1e-5);
  }
});

for (const [form, size, rise] of [
  ['vault', [3, 2, 4], 1.6],
  ['dome', [3, 3, 4.4], 2.2],
] as const)
  test(`under a ${form} a set's cap meets the curve where it comes lowest over it, never through it; a boss hangs from its top`, () => {
    const layout = hall(form === 'vault' ? 'halls' : 'sanctum', form, size);
    const height = ceilingHeights(layout);
    let risen = 0;
    for (const { cap, top } of sets(layout)) {
      const [minX, minY, , maxX, maxY] = boundsOf(layout, cap.module);
      const [first, second] = [
        turnAbout([minX, minY, 0], cap.place.turns),
        turnAbout([maxX, maxY, 0], cap.place.turns),
      ];
      const [x, y] = cap.place.origin;
      const [column, row] = [cap.cell % layout.columns, Math.floor(cap.cell / layout.columns)];
      // Over the cell the cap stands in, as far as it reaches.
      const keep = (value: number, low: number) => Math.min(low + 3.2, Math.max(low, value));
      for (let step = 0; step <= 10; step++)
        for (let across = 0; across <= 10; across++) {
          const pointX = keep(x + first[0] + ((second[0] - first[0]) * step) / 10, column * 3.2);
          const pointY = keep(y + first[1] + ((second[1] - first[1]) * across) / 10, row * 3.2);
          assert.ok(top <= height(cap.cell)(pointX, pointY) + EPS, 'never through the ceiling');
        }
      assert.ok(top >= size[2] - EPS, 'at the wall’s head or over it');
      risen += top > size[2] + 0.1 ? 1 : 0;
    }
    if (form === 'vault') assert.ok(risen > 0, 'a set on an end wall rises with the vault');
    const bosses = named(kitPlacements(layout, FULL_PACKS), 'ceiling.a').concat(
      named(kitPlacements(layout, FULL_PACKS), 'ceiling.b'),
      named(kitPlacements(layout, FULL_PACKS), 'ceiling.c'),
    );
    assert.equal(bosses.length, 1, 'one on the ridge of three cells, one under the dome');
    const [boss] = bosses;
    assert.ok(boss && Math.abs(boss.place.origin[2] - (size[2] + rise)) < 1e-9, 'from the top of the curve');
    assert.ok(boss.place.origin[2] + boundsOf(layout, boss.module)[2] >= HEAD_M);
  });
