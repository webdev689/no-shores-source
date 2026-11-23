import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meshBuilder } from '../models/model.ts';
import { SEAL_KIND, SEAL_STATE } from '../network/encounterMessages.ts';
import type { DungeonLayout } from './dungeonLayout.ts';
import { drownedNow, layEncounters, PLATE, waterMesh } from './encounterMesh.ts';
import { COLOUR, ROLE } from './dungeonMesh.ts';

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
  assert.ok(
    model.parts.some((part) => part.archive === COLOUR.crystal),
    'the seal stone glows',
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
    const seal = { kind, room: 0, pieces: [[1.6, 1.6, 0]], pads: [], drowned: [], doors: [] };
    const mesh = meshBuilder();
    layEncounters(mesh, { ...layout, encounters: { ...layout.encounters!, seals: [seal], anchors: [] } });
    const model = mesh.model();
    return Array.from({ length: model.positions.length / 3 }, (unused, index) => model.positions[index * 3 + 2]);
  };
  assert.ok(
    plates(SEAL_KIND.weighing).some((height) => Math.abs((height ?? 0) - PLATE.height) < 1e-6),
    'raised to its height',
  );
  assert.equal(plates(SEAL_KIND.litany).length, 0, 'a rune is only its mark on the floor');
});

test("a plate is all of its room's trim, never the floor's own picture, so it stands apart from the floor", () => {
  const seal = { kind: SEAL_KIND.weighing, room: 0, pieces: [[1.6, 1.6, 0]], pads: [], drowned: [], doors: [] };
  const mesh = meshBuilder();
  layEncounters(mesh, { ...layout, encounters: { ...layout.encounters!, seals: [seal], anchors: [] } });
  const records = new Set(mesh.model().parts.map((part) => part.record));
  assert.deepEqual([...records], [ROLE.trim]);
});
