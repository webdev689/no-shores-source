import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type ForgedModel, meshBuilder } from '../models/model.ts';
import { climateArchive, DRESSING_ARCHIVE } from '../textures/climate.ts';
import { DUNGEON_LAYERS, dungeonBook } from './dungeonBook.ts';
import { dressingOf, stylePacks } from './dungeonDressing.ts';
import { placedLandmarks } from './dungeonLandmarks.ts';
import { askDungeon, type DungeonLayout, type StyleKey } from './dungeonLayout.ts';
import { COLOUR, dungeonMesh, lookAt, ROLE } from './dungeonMesh.ts';
import type { ModulePack } from './dungeonModules.ts';
import { FULL_PACKS } from './dungeonPacks.test.ts';

const module = await WebAssembly.compile(new Uint8Array(readFileSync('client/public/room.wasm')));
/** Real dungeons that stand landmarks, of every style. */
const LAYOUTS: readonly DungeonLayout[] = Array.from({ length: 12 }, (_unused, patrol) =>
  [0, 1, 2].map((number) => askDungeon(module, `patrol-${patrol}`, 'The Patrol', number)),
)
  .flat()
  .filter((layout) => layout.landmarks.length > 0);
const DOOR = [56, 2] as const;
const EPS = 1e-5;

/** The triangles a model holds of each picture. */
function counted(model: ForgedModel): Map<string, number> {
  return new Map(model.parts.map((part) => [`${part.archive}.${part.record}`, part.count / 3]));
}

/** Whether a model has an upward face at the floor over a cell. */
function floorOver(model: ForgedModel, layout: DungeonLayout, cell: number): boolean {
  const [column, row] = [cell % layout.columns, Math.floor(cell / layout.columns)];
  const inside = (vertex: number, axis: number, low: number) =>
    (model.positions[vertex * 3 + axis] ?? -1) >= low - EPS &&
    (model.positions[vertex * 3 + axis] ?? -1) <= low + layout.cell + EPS;
  return model.parts.some((part) => {
    if (part.record !== ROLE.floor || !layout.looks.some((look) => look.pictures.includes(part.archive))) return false;
    for (let index = part.start; index < part.start + part.count; index += 3) {
      const corners = [0, 1, 2].map((offset) => model.indices[index + offset] ?? 0);
      const flat = corners.every((vertex) => Math.abs(model.positions[vertex * 3 + 2] ?? 1) < EPS);
      if (
        flat &&
        corners.every((vertex) => inside(vertex, 0, column * layout.cell) && inside(vertex, 1, row * layout.cell))
      )
        return true;
    }
    return false;
  });
}

const dressed = (layout: DungeonLayout, packs: ReadonlyMap<StyleKey, ModulePack>) => {
  const dressing = dressingOf(layout, packs, 'temperate');
  return { dressing, model: dungeonMesh(layout, DOOR, dressing.lay, dressing) };
};

test("a landmark's piece lays its own floor: the code-built floor leaves its cells only where its style has a pack", () => {
  assert.ok(LAYOUTS.length > 10);
  for (const layout of LAYOUTS) {
    const cells = placedLandmarks(layout).flatMap((landmark) => landmark.cells);
    const withPacks = dressed(layout, FULL_PACKS);
    assert.deepEqual([...withPacks.dressing.floorless].sort(), [...cells].sort());
    for (const cell of cells)
      assert.ok(!floorOver(withPacks.model, layout, cell), `${layout.name}: no code floor on ${cell}`);
    const without = dressed(layout, new Map());
    assert.equal(without.dressing.floorless.size, 0);
    for (const cell of cells) assert.ok(floorOver(without.model, layout, cell));
  }
});

test("a dungeon with no packs draws as before, but each landmark's solids stand as plain stone boxes", () => {
  for (const layout of LAYOUTS) {
    const before = counted(dungeonMesh(layout, DOOR));
    const after = counted(dressed(layout, new Map()).model);
    const boxes = new Map<string, number>();
    for (const landmark of placedLandmarks(layout)) {
      const look = lookAt(layout, landmark.cells[0] ?? 0);
      const key = `${look.set}.${look.wall}`;
      boxes.set(key, (boxes.get(key) ?? 0) + landmark.solids.length * 12);
    }
    for (const [key, count] of after) assert.equal(count, (before.get(key) ?? 0) + (boxes.get(key) ?? 0), key);
    assert.equal(after.size, before.size);
  }
});

test("a landmark's piece is laid turned to fill its footprint, in the pictures of its cell's look", () => {
  let laid = 0;
  for (const layout of LAYOUTS)
    for (const landmark of placedLandmarks(layout)) {
      const piece = FULL_PACKS.get(landmark.style)?.modules.get(landmark.module);
      assert.ok(piece);
      const only = { ...layout, landmarks: layout.landmarks.filter(([name]) => name === landmark.module) };
      const pack = new Map([[landmark.style, { style: landmark.style, modules: new Map([[landmark.module, piece]]) }]]);
      const mesh = meshBuilder();
      dressingOf(only, pack, 'temperate').lay(mesh);
      const model = mesh.model();
      const axis = (offset: number) =>
        Array.from(
          { length: model.positions.length / 3 },
          (_unused, vertex) => model.positions[vertex * 3 + offset] ?? 0,
        );
      const columns = landmark.cells.map((cell) => cell % layout.columns);
      const rows = landmark.cells.map((cell) => Math.floor(cell / layout.columns));
      const near = (value: number, wanted: number) => Math.abs(value - wanted) < EPS;
      assert.ok(
        near(Math.min(...axis(0)), Math.min(...columns) * layout.cell),
        `${landmark.module} from its west edge`,
      );
      assert.ok(near(Math.max(...axis(0)), (Math.max(...columns) + 1) * layout.cell), 'to its east');
      assert.ok(near(Math.min(...axis(1)), Math.min(...rows) * layout.cell), 'from its north edge');
      assert.ok(near(Math.max(...axis(1)), (Math.max(...rows) + 1) * layout.cell), 'to its south');
      const look = lookAt(layout, landmark.cells[0] ?? 0);
      const sets = new Set(layout.looks.flatMap((each) => each.pictures));
      const stone = model.parts.filter((part) => sets.has(part.archive));
      assert.ok(stone.length > 0 && stone.every((part) => part.archive === look.set), 'its stone its look’s set');
      laid++;
    }
  assert.ok(laid > 10);
});

test('every picture the pieces wear is in the book, the dressing set turned to the climate', () => {
  for (const layout of LAYOUTS.slice(0, 4)) {
    const { model } = dressed(layout, FULL_PACKS);
    const climate = { climate: 'desert', season: 'summer' } as const;
    const book = dungeonBook(layout, climate, DOOR, model.parts);
    assert.ok(
      model.parts.some((part) => part.archive === DRESSING_ARCHIVE),
      'the dressing set is worn',
    );
    assert.ok(model.parts.some((part) => part.archive === COLOUR.water));
    for (const part of model.parts) {
      if (part.archive < 0) continue;
      const turned = climateArchive(part.archive, part.record, climate.climate, climate.season);
      const layer = book.layerOf(part.archive, part.record);
      const picture = book.pictures[layer];
      assert.ok(
        picture && picture.archive === turned && picture.record === part.record,
        `${part.archive}.${part.record}`,
      );
    }
    assert.equal(book.layerOf(COLOUR.water, 0), DUNGEON_LAYERS.water);
  }
});

test('the packs of every style the looks wear are each asked for once, and one that does not come is left out', async () => {
  const layout = LAYOUTS.find((each) => each.looks.length === 2) ?? LAYOUTS[0];
  assert.ok(layout);
  const asked: StyleKey[] = [];
  const [first, second] = layout.looks.map((look) => look.style);
  const packs = await stylePacks(layout, async (style) => {
    asked.push(style);
    return style === first ? (FULL_PACKS.get(style) ?? null) : null;
  });
  assert.deepEqual(asked, [...new Set([first, second])]);
  assert.deepEqual([...packs.keys()], [first]);
});
