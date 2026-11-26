import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type ForgedModel, meshBuilder } from '../models/model.ts';
import { climateArchive, DRESSING_ARCHIVE } from '../textures/climate.ts';
import { dungeonBook, WATER_FLAG } from './dungeonBook.ts';
import { dressingOf, passagePieceLights, passagePiecesLaid, stylePacks } from './dungeonDressing.ts';
import { placedLandmarks } from './dungeonLandmarks.ts';
import { askDungeon, type DungeonLayout, type StyleKey } from './dungeonLayout.ts';
import { COLOUR, dungeonMesh, IRON, lookAt, ROLE } from './dungeonMesh.ts';
import { type ModulePack, PARTS, readModulePack } from './dungeonModules.ts';
import { storeyPlanes } from './dungeonStoreyPlanes.ts';
import { FULL_PACKS, packOf, propPlansOf, type Written } from './dungeonPacks.test.ts';
import manifest from '../../../content/dungeon/modules.json' with { type: 'json' };
import { MATERIALS } from '../city/pictures.ts';
import type { PassagePiece } from '../rules/passageRules.ts';
import { UNTOUCHED } from './passages/passagePieces.ts';

const module = await WebAssembly.compile(new Uint8Array(readFileSync('client/public/room.wasm')));
/** Real dungeons of every style, each storey that stands landmarks as the dressing draws it: one storey's dungeon. */
const PLANES = Array.from({ length: 12 }, (_unused, patrol) =>
  [0, 1, 2].map((number) => askDungeon(module, `patrol-${patrol}`, 'The Patrol', number)),
)
  .flat()
  .flatMap((layout) => storeyPlanes(layout))
  .filter((plane) => plane.layout.landmarks.length > 0);
const LAYOUTS: readonly DungeonLayout[] = PLANES.map((plane) => plane.layout);
const PORTAL_ON = new Set(PLANES.flatMap((plane) => (plane.portal ? [plane.layout] : [])));
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
  const dressing = dressingOf(layout, packs, 'temperate', propPlansOf(layout));
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
      dressingOf(only, pack, 'temperate', propPlansOf(only)).lay(mesh);
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
    for (const part of model.parts.filter((each) => each.archive === COLOUR.water)) {
      const bed = book.layerOf(part.record, ROLE.floor);
      assert.equal(book.pictures[bed]?.record, ROLE.floor, `water's bed in ${part.record}`);
      assert.equal(book.layerOf(part.archive, part.record), WATER_FLAG | bed);
    }
  }
});

/** Every style's pack without the pieces named. */
const without = (...pieces: string[]): ReadonlyMap<StyleKey, ModulePack> =>
  new Map(
    [...FULL_PACKS].map(([style, pack]) => {
      const kept = [...pack.modules].filter(([name]) => !pieces.some((piece) => name === `${style}.${piece}`));
      return [style, { ...pack, modules: new Map(kept) }] as const;
    }),
  );

/** Whether a model holds a code-built pillar at (x, y): a face wholly within its half-width of it. */
function pillarAt(model: ForgedModel, [x, y]: readonly number[], half: number): boolean {
  const near = (vertex: number) =>
    Math.abs((model.positions[vertex * 3] ?? 0) - (x ?? 0)) <= half + EPS &&
    Math.abs((model.positions[vertex * 3 + 1] ?? 0) - (y ?? 0)) <= half + EPS;
  for (let corner = 0; corner + 2 < model.indices.length; corner += 3)
    if ([0, 1, 2].every((offset) => near(model.indices[corner + offset] ?? 0))) return true;
  return false;
}

test('the mesh leaves out only the pillars, brackets and portal arch whose kit pieces were laid', () => {
  const pillared = LAYOUTS.filter((layout) => layout.pillars.length > 0);
  assert.ok(pillared.length > 2);
  for (const layout of pillared) {
    const full = dressingOf(layout, FULL_PACKS, 'temperate', propPlansOf(layout));
    assert.ok(full.pillars.size > 0 && full.torches.size > 0 && full.portal === PORTAL_ON.has(layout));
    const bare = dungeonMesh(layout, DOOR, undefined, full);
    layout.pillars.forEach((pillar, index) =>
      assert.equal(pillarAt(bare, pillar, layout.pillarHalf), !full.pillars.has(index), `pillar ${index}`),
    );
    const missing = dressingOf(layout, without('pillar.capital', 'sconce', 'portal'), 'temperate', propPlansOf(layout));
    assert.deepEqual([missing.pillars.size, missing.torches.size, missing.portal], [0, 0, false]);
    const model = dungeonMesh(layout, DOOR, undefined, missing);
    for (const pillar of layout.pillars) assert.ok(pillarAt(model, pillar, layout.pillarHalf), 'the code pillar');
    const plain = { pillars: new Set<number>(), torches: new Set<number>(), portal: false };
    const unkitted = dungeonMesh(layout, DOOR, undefined, {
      ...plain,
      floorless: missing.floorless,
      flats: missing.flats,
    });
    assert.deepEqual(counted(model), counted(unkitted), 'and every bracket and the portal’s arch');
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

/** A passage module of one upright triangle from its foot 1 m east, wearing `part`. */
const upright = (name: string, part: string): Written => {
  const worn = PARTS.indexOf(part);
  return {
    name,
    vertices: [
      [0, 0, 0, 0, -1, 0, worn],
      [1, 0, 0, 0, -1, 0, worn],
      [0, 0, 1, 0, -1, 0, worn],
    ],
    indices: [0, 1, 2],
  };
};
const PASSAGE_MODULES = readModulePack(
  packOf(
    [
      upright('passage.mouth.shut', 'iron'),
      upright('passage.mouth.open', 'wood'),
      upright('passage.lamp', 'glow'),
      upright('passage.kindle', 'glow'),
      upright('passage.tally-post', 'iron'),
      upright('passage.tally-post.broken', 'wood'),
    ],
    { style: 'passage' },
  ),
);

test("a passage zone's pieces are laid from the passages' pack as the deal stands, lit or cold, turned to their facing", () => {
  assert.ok(manifest.styles.passage, "the passages' pack is published and named in the manifest");
  const layout = LAYOUTS[0];
  if (!layout) throw new Error('no layout');
  const piece = (kind: PassagePiece['kind'], module: string, x: number, facing = 0): PassagePiece => ({
    kind,
    module,
    number: 0,
    at: [x, layout.cell * 1.5, 0],
    facing,
  });
  const pieces = [
    piece('mouth', 'passage.mouth.shut', layout.cell * 1.5, Math.PI / 2),
    piece('lamp', 'passage.lamp', layout.cell * 1.5),
    piece('kindle', 'passage.kindle', layout.cell * 1.5),
    piece('post', 'passage.tally-post', layout.cell * 1.5),
  ];
  const laid = (state: typeof UNTOUCHED) => {
    const mesh = meshBuilder();
    passagePiecesLaid(layout, PASSAGE_MODULES, 'temperate', pieces, state, false)(mesh);
    return mesh.model();
  };
  const look = lookAt(layout, layout.columns + 1);
  const timber = `${MATERIALS.temperate.timber[0]}.${MATERIALS.temperate.timber[1]}`;
  const [iron, glow, stone] = [`${IRON[0]}.${IRON[1]}`, `${COLOUR.glow}.0`, `${look.set}.${look.wall}`];
  const cold = counted(laid(UNTOUCHED));
  assert.equal(cold.get(stone), 2, 'the lamp and the dead lamp cold, in the cell’s stone');
  assert.equal(cold.get(glow), undefined);
  assert.equal(cold.get(timber), undefined);
  assert.equal(cold.get(iron), 2, 'the mouth shut and the post whole, in iron');
  const lit = counted(laid({ lampLit: true, openMouths: [0], kindled: [0], broken: [0] }));
  assert.equal(lit.get(glow), 2, 'the lamp and the dead lamp lit');
  assert.equal(lit.get(timber), 2, 'the mouth open and the post broken');
  // The mouth faces east: its triangle's far corner, 1 m east of its foot unturned, lies 1 m south of it.
  const model = laid(UNTOUCHED);
  const [x, y] = [layout.cell * 1.5, layout.cell * 1.5];
  const corners = Array.from({ length: model.positions.length / 3 }, (_unused, vertex) =>
    [0, 1, 2].map((axis) => model.positions[vertex * 3 + axis] ?? 0),
  );
  assert.ok(corners.some(([east, south]) => Math.abs((east ?? 0) - x) < EPS && Math.abs((south ?? 0) - y - 1) < EPS));
});

test('under ground a lit lamp, a lit dead lamp and an open mouth each light the room; cold and shut, none', () => {
  const piece = (kind: PassagePiece['kind'], number = 0): PassagePiece => ({
    kind,
    module: `passage.${kind}`,
    number,
    at: [10, 20, 0],
    facing: Math.PI / 2,
  });
  const pieces = [piece('lamp'), piece('kindle', 1), piece('mouth', 0), piece('mouth', 1), piece('post')];
  assert.deepEqual(passagePieceLights(pieces, UNTOUCHED), []);
  const lights = passagePieceLights(pieces, { lampLit: true, openMouths: [1], kindled: [1], broken: [] });
  assert.deepEqual(
    lights.map((light) => light.number),
    [0, 1, 2],
  );
  const [lamp, kindle, mouth] = lights;
  assert.ok(lamp && kindle && mouth);
  assert.deepEqual([lamp.at[2], kindle.at[2]], [1.8, 2.25], 'each from its glass, over the floor');
  // The open mouth faces east, into the room: its light stands behind its face, west of its foot, the way on.
  assert.ok(mouth.at[0] < 10 && Math.abs(mouth.at[1] - 20) < 1e-6);
});
