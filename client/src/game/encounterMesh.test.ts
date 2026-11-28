import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meshBuilder } from '../models/model.ts';
import { SEAL_KIND, SEAL_STATE } from '../network/encounterMessages.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { ANCHOR_SLAB, drownedNow, layEncounters, PLATE, waterMesh } from './encounterMesh.ts';
import { COLOUR, IRON, ROLE } from './dungeonMesh.ts';

/** An Ascent of two pads over a room of two cells, and a Court of one anchor. */
const layout = {
  cell: 3.2,
  columns: 2,
  rows: 1,
  cells: [0, 0],
  end: 0,
  pictures: [123, 124],
  looks: [{ style: 'crypt', pictures: [123, 124] }],
  rooms: [{ look: 0 }],
  encounters: {
    seals: [
      {
        kind: SEAL_KIND.ascent,
        room: 0,
        pieces: [[4.8, 1.6, 0.8]],
        pads: [
          [0.8, 0.8, 2.4, 2.4, 0.4],
          [4, 0.8, 5.6, 2.4, 0.8],
        ],
        drowned: [0, 1],
        doors: [],
      },
    ],
    anchors: [[1.6, 1.6, 0]],
    reach: { rune: 0.9, plate: 1, relic: 3, anchor: 1, light: 1.25, slam: 4 },
  },
} as unknown as DungeonLayout;

test("an Ascent's pads stand to their tops in the room's stone, the last with its glowing seal stone", () => {
  const mesh = meshBuilder();
  layEncounters(mesh, layout);
  const model = mesh.model();
  const heights = Array.from({ length: model.positions.length / 3 }, (unused, index) => model.positions[index * 3 + 2]);
  const reaches = (top: number) => heights.some((height) => Math.abs((height ?? 0) - top) < 1e-6);
  assert.ok(reaches(0.4) && reaches(0.8), 'each pad to its own top');
  // The seal stone: the crystal part, standing on the last pad's top (0.8 m), STONE's 6 cm high, never the first's.
  const crystal = model.parts.find((part) => part.archive === COLOUR.crystal);
  assert.ok(crystal, 'the seal stone glows');
  const tops = Array.from({ length: crystal.count }, (unused, nth) => {
    const vertex = model.indices[crystal.start + nth] ?? 0;
    return model.positions[vertex * 3 + 2] ?? 0;
  });
  assert.deepEqual(
    [Math.min(...tops), Math.max(...tops)].map((height) => height.toFixed(3)),
    ['0.800', '0.860'],
  );
  assert.ok(
    model.parts.some((part) => part.archive === 123),
    "in its room's set",
  );
});

test("the drowned floor's foul water lies while its seal holds and is gone once it breaks", () => {
  const holding = { seals: [{ kind: SEAL_KIND.ascent, state: SEAL_STATE.running, progress: 0, marks: [0], relic: 1 }] };
  const broken = { seals: [{ ...holding.seals[0]!, state: SEAL_STATE.broken }] };
  assert.deepEqual(drownedNow(layout, holding as never), [0]);
  assert.deepEqual(drownedNow(layout, broken as never), []);
  const water = waterMesh(layout, [0]);
  assert.ok(
    water?.parts.every((part) => part.archive === COLOUR.foulWater),
    "foul water, not the dungeon's plain still water",
  );
  assert.equal(water?.indices.length, 12, 'one face over each drowned cell');
  assert.equal(waterMesh(layout, []), null);
});

test("a Weighing's plates stand as raised slabs of its room's stone, and a Litany's runes lay none", () => {
  const plates = (kind: number) => {
    const seal = { kind, room: 0, pieces: [[1.6, 1.6, 0] as const], pads: [], drowned: [], doors: [] };
    const mesh = meshBuilder();
    layEncounters(mesh, { ...layout, encounters: { ...layout.encounters!, seals: [seal], anchors: [] } });
    const model = mesh.model();
    return Array.from({ length: model.positions.length / 3 }, (unused, index) => model.positions[index * 3 + 2]);
  };
  assert.ok(
    plates(SEAL_KIND.weighing).some((height) => Math.abs((height ?? 0) - PLATE.height) < 1e-6),
    'raised to its height',
  );
  const runes = plates(SEAL_KIND.litany);
  assert.ok(runes.length > 0, "a rune's iron ring is set in the floor");
  assert.ok(
    runes.every((height) => (height ?? 1) < 0.01),
    'flush with it, round its mark',
  );
});

/** Every corner a seal's mesh lays, with the picture it wears. */
function cornersOf(seal: object, ceilings?: readonly number[]) {
  const mesh = meshBuilder();
  const encounters = { ...layout.encounters!, seals: [seal], anchors: [] };
  layEncounters(mesh, { ...layout, ...(ceilings && { ceilings }), encounters } as DungeonLayout);
  const model = mesh.model();
  return model.parts.flatMap((part) =>
    Array.from({ length: part.count }, (unused, nth) => {
      const vertex = model.indices[part.start + nth] ?? 0;
      const [x, y, z] = [0, 1, 2].map((axis) => model.positions[vertex * 3 + axis] ?? 0) as [number, number, number];
      return { x, y, z, archive: part.archive, record: part.record };
    }),
  );
}

test('each rune and plate is ringed in iron inlaid just outside its mark, spoked to a hub, only in its room', () => {
  const pieces = [
    [1.4, 1.6, 0],
    [5, 1.6, 0],
  ] as const;
  const { rune } = layout.encounters!.reach;
  for (const [kind, mark] of [
    [SEAL_KIND.litany, rune],
    [SEAL_KIND.weighing, PLATE.half],
  ] as const) {
    const corners = cornersOf({ kind, room: 0, pieces, pads: [], drowned: [], doors: [] });
    const iron = corners.filter((corner) => corner.archive === COLOUR.gold);
    assert.ok(iron.length > 0 && iron.every((corner) => corner.z < 0.01), 'gilt, flush with the floor');
    assert.ok(
      iron.every((corner) => corner.x >= 0 && corner.x <= 6.4 && corner.y >= 0 && corner.y <= 3.2),
      'inlaid in its room alone, never past its walls',
    );
    // Round each piece, nothing of the rite inside its mark, where the mark is read.
    for (const [x, y] of pieces)
      assert.ok(
        iron.every((corner) => Math.hypot(corner.x - x, corner.y - y) > mark),
        'clear of the mark',
      );
    assert.ok(
      iron.some((corner) => Math.abs(Math.hypot(corner.x - 1.4, corner.y - 1.6) - (mark + 0.3)) < 0.1),
      'a ring just outside it',
    );
  }
});

test("an Ascent's pads take iron rungs up their sides, and a Holdfast's relic hangs on chains to the ceiling", () => {
  const ascent = layout.encounters!.seals[0]!;
  const rungs = cornersOf(ascent).filter((corner) => corner.archive === IRON[0]);
  assert.ok(rungs.length > 0, 'the taller pad has its rungs');
  // Each rung within a hand of its pad's sides, none on the 0.4 m pad, too low for one.
  assert.ok(rungs.every((corner) => corner.x >= 3.96 && corner.x <= 5.64 && corner.z <= 0.8));
  const relic = { kind: SEAL_KIND.holdfast, room: 0, pieces: [[1.6, 1.6, 0]], pads: [], drowned: [], doors: [] };
  // The iron hung over the floor.
  const hung = (ceilings: readonly number[]) =>
    cornersOf(relic, ceilings).filter((corner) => corner.archive === IRON[0] && corner.z > 0.1);
  const chains = hung([4.4, 4.4]);
  assert.ok(chains.length > 0, 'chained');
  assert.ok(
    chains.every((corner) => corner.z >= 2.6 - 1e-5 && corner.z <= 4.4 + 1e-5),
    'from the relic up to the ceiling, over every head',
  );
  assert.equal(hung([2.4, 2.4]).length, 0, 'none under it');
});

test("a plate is all of its room's trim, never the floor's own picture, so it stands apart from the floor", () => {
  const seal = {
    kind: SEAL_KIND.weighing,
    room: 0,
    pieces: [[1.6, 1.6, 0] as const],
    pads: [],
    drowned: [],
    doors: [],
  };
  // Its raised slab, apart from the gilt ring inlaid round it.
  const raised = cornersOf(seal).filter((corner) => corner.archive !== COLOUR.gold);
  assert.ok(raised.length > 0);
  assert.deepEqual([...new Set(raised.map((corner) => corner.record))], [ROLE.trim]);
});

test("each of the Court's anchors stands on a stepped slab of the end room's trim, raised to be seen across the room", () => {
  const mesh = meshBuilder();
  layEncounters(mesh, { ...layout, encounters: { ...layout.encounters!, seals: [] } });
  const model = mesh.model();
  const heights = Array.from({ length: model.positions.length / 3 }, (unused, index) => model.positions[index * 3 + 2]);
  assert.ok(
    heights.some((height) => Math.abs((height ?? 0) - ANCHOR_SLAB.height) < 1e-6),
    'raised to its height',
  );
  assert.ok(
    heights.some((height) => Math.abs((height ?? 0) - ANCHOR_SLAB.height / 2) < 1e-6),
    'stepped: a wider foot under its top',
  );
  assert.ok(ANCHOR_SLAB.height >= PLATE.height, 'no lower than a plate');
  assert.deepEqual([...new Set(model.parts.map((part) => part.record))], [ROLE.trim]);
});
