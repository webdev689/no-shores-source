// How kit pieces fit what else stands in a dungeon: the props hung on its walls and the rock of its caves.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type ForgedModel, meshBuilder } from '../models/model.ts';
import { propModel } from '../models/props.ts';
import { propTable } from '../models/fixtures.test.ts';
import { isCave } from './dungeonCeilings.ts';
import { cellAt, type Rect } from './dungeonCells.ts';
import { type KitPlacement, kitPlacements } from './dungeonKits.ts';
import { askDungeon, type DungeonLayout, SIDE_STEPS, type StyleKey } from './dungeonLayout.ts';
import { dungeonMesh, lookAt } from './dungeonMesh.ts';
import { type ModulePack, readModulePack, turnAbout } from './dungeonModules.ts';
import { FULL_PACKS } from './dungeonPacks.test.ts';
import { layModel } from './entrances.ts';

const module = await WebAssembly.compile(new Uint8Array(readFileSync('client/public/room.wasm')));
const land = 'content/world/land';
const NODES: readonly { id: string; name: string }[] = readdirSync(land).flatMap(
  (file) =>
    (JSON.parse(readFileSync(`${land}/${file}`, 'utf8')) as { nodes?: { id: string; name: string }[] }).nodes ?? [],
);
/** A real patrol's dungeon, by its node's id. */
function patrolDungeon(id: string, number: number): DungeonLayout {
  const node = NODES.find((each) => each.id === id);
  assert.ok(node, id);
  return askDungeon(module, id, node.name, number);
}
/** Real dungeons of every style, and the ones the game was seen in with a pilaster through a picture or a piece and
 *  an arch in a cave's rock. */
const LAYOUTS: readonly DungeonLayout[] = [
  patrolDungeon('saltgrass-downs', 1),
  patrolDungeon('gullwing-vale', 1),
  patrolDungeon('gullwing-vale', 0),
  patrolDungeon('greystone-tors', 0),
  patrolDungeon('greystone-tors', 2),
  ...Array.from({ length: 30 }, (_unused, patrol) =>
    [0, 1, 2].map((number) => askDungeon(module, `patrol-${patrol}`, 'The Patrol', number)),
  ).flat(),
];
/** The published packs, where DUNGEON_MODULES names a build's folder, else every style's whole envelope. */
const PACKS: ReadonlyMap<StyleKey, ModulePack> = (() => {
  const folder = process.env.DUNGEON_MODULES;
  if (!folder) return FULL_PACKS;
  return new Map(
    [...FULL_PACKS.keys()].map((style) => {
      const bytes = readFileSync(`${folder}/${style}.modules`);
      return [style, readModulePack(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))];
    }),
  );
})();
const EPS = 1e-6;
// How near a drawn point, kept in float32 some 100 m from the grid's corner, comes to where it was laid.
const FLOAT_M = 1e-4;

const models = new Map<number, ForgedModel | null>();
const modelOf = (id: number) => {
  if (!models.has(id)) models.set(id, propModel(propTable, id));
  return models.get(id) ?? null;
};
/** Each prop's plan as the page draws it: its forged model laid where it stands, seen from above. */
function drawnPlans(layout: DungeonLayout): Rect[] {
  return layout.props.flatMap(([id, x, y, z, yaw]) => {
    const model = modelOf(id);
    if (!model) return [];
    const mesh = meshBuilder();
    layModel(mesh, model, [x, y, z], yaw);
    const { positions } = mesh.model();
    const axis = (first: number) => positions.filter((_value, index) => index % 3 === first);
    const [eastings, southings] = [axis(0), axis(1)];
    return [[Math.min(...eastings), Math.min(...southings), Math.max(...eastings), Math.max(...southings)] as const];
  });
}
const PROPS = new Map(LAYOUTS.map((layout) => [layout, drawnPlans(layout)] as const));
const PLACED = new Map(
  LAYOUTS.map((layout) => [layout, kitPlacements(layout, PACKS, PROPS.get(layout) ?? [])] as const),
);

/** A placement's plan seen from above. */
function planOf({ module: name, place }: KitPlacement): Rect {
  const bounds = PACKS.get(name.split('.')[0] as StyleKey)?.modules.get(name)?.bounds;
  assert.ok(bounds, name);
  const [minX, minY, , maxX, maxY] = bounds;
  const [first, second] = [turnAbout([minX, minY, 0], place.turns), turnAbout([maxX, maxY, 0], place.turns)];
  const [x, y] = place.origin;
  return [
    Math.min(first[0], second[0]) + x,
    Math.min(first[1], second[1]) + y,
    Math.max(first[0], second[0]) + x,
    Math.max(first[1], second[1]) + y,
  ];
}
const overlap = (a: Rect, b: Rect) => a[0] < b[2] - EPS && b[0] < a[2] - EPS && a[1] < b[3] - EPS && b[1] < a[3] - EPS;

test('no wall set or feature stands over a prop as it is drawn, a picture hung on the wall among them', () => {
  let [pieces, hung] = [0, 0];
  for (const layout of LAYOUTS) {
    const plans = PROPS.get(layout) ?? [];
    // A hung prop's origin stands behind its wall's face: its drawn plan lies in front of it.
    hung += layout.props.filter(([, , , z]) => z >= 1.5).length;
    for (const piece of PLACED.get(layout) ?? []) {
      if (!/\.(wall\.|feature\.)/.test(piece.module)) continue;
      const plan = planOf(piece);
      for (const prop of plans) assert.ok(!overlap(plan, prop), `${piece.module} over a prop in ${layout.name}`);
      pieces++;
    }
  }
  assert.ok(hung > 20 && pieces > 500, `${hung} hung props, ${pieces} wall pieces`);
});

/** A cell's side as a frame: its edge's left end seen from the cell, the way along it to the right, and the way into
 *  the rock. */
function edgeOf(layout: DungeonLayout, cell: number, side: number) {
  const [east = 0, south = 0] = SIDE_STEPS[side] ?? [];
  const half = layout.cell / 2;
  const [column, row] = [cell % layout.columns, Math.floor(cell / layout.columns)];
  const [edgeX, edgeY] = [(column + 0.5) * layout.cell + east * half, (row + 0.5) * layout.cell + south * half];
  const [leftX, leftY] = [edgeX - south * half, edgeY + east * half];
  return {
    along: (x: number, y: number) => (x - leftX) * south - (y - leftY) * east,
    into: (x: number, y: number) => (x - edgeX) * east + (y - edgeY) * south,
    east,
    south,
  };
}

/** The rock drawn on a cell's side: each triangle in its wall's picture along the edge and facing into the cell, its
 *  corners as how far along the edge, how far up and how far into the rock. */
function rockOf(model: ForgedModel, layout: DungeonLayout, cell: number, side: number): number[][][] {
  const { along, into, east, south } = edgeOf(layout, cell, side);
  const look = lookAt(layout, cell);
  const triangles: number[][][] = [];
  for (const part of model.parts) {
    if (part.archive !== look.set || part.record !== look.wall) continue;
    for (let index = part.start; index < part.start + part.count; index += 3) {
      const vertices = [0, 1, 2].map((offset) => model.indices[index + offset] ?? 0);
      const corners = vertices.map((vertex) => {
        const [x = 0, y = 0, z = 0] = [0, 1, 2].map((axis) => model.positions[vertex * 3 + axis]);
        return [along(x, y), z, into(x, y)];
      });
      const first = (vertices[0] ?? 0) * 3;
      const facing = -((model.normals[first] ?? 0) * east + (model.normals[first + 1] ?? 0) * south);
      const near = corners.every(
        ([place = 0, , depth = 0]) => place > -FLOAT_M && place < layout.cell + FLOAT_M && Math.abs(depth) < 0.3,
      );
      if (facing > 0.5 && near) triangles.push(corners);
    }
  }
  return triangles;
}

/** How far into the rock the drawn rock stands at a point of the wall, `along` it and `up` it; null where none is. */
function depthAt(rock: readonly number[][][], along: number, up: number): number | null {
  for (const [first = [], second = [], third = []] of rock) {
    // Each corner from the first: along, up and into the rock.
    const [toSecond, toThird] = [second, third].map((corner) =>
      [0, 1, 2].map((axis) => (corner[axis] ?? 0) - (first[axis] ?? 0)),
    );
    const [[secondAlong = 0, secondUp = 0, secondDepth = 0], [thirdAlong = 0, thirdUp = 0, thirdDepth = 0]] = [
      toSecond ?? [],
      toThird ?? [],
    ];
    const [pointAlong, pointUp] = [along - (first[0] ?? 0), up - (first[1] ?? 0)];
    const determinant = secondAlong * thirdUp - thirdAlong * secondUp;
    if (Math.abs(determinant) < 1e-12) continue;
    const share = (pointAlong * thirdUp - thirdAlong * pointUp) / determinant;
    const otherShare = (secondAlong * pointUp - pointAlong * secondUp) / determinant;
    if (share > -1e-9 && otherShare > -1e-9 && share + otherShare < 1 + 1e-9)
      return (first[2] ?? 0) + share * secondDepth + otherShare * thirdDepth;
  }
  return null;
}

/** The side of its cell a wall piece stands on: its +y points into the cell, away from that side. */
const wallSide = ({ place }: KitPlacement) => {
  const [x, y] = turnAbout([0, 1, 0], place.turns);
  return SIDE_STEPS.findIndex(([east, south]) => east === -Math.round(x) && south === -Math.round(y));
};

test('on a cave wall no piece stands more than 0.1 m deep in the rock anywhere over it', () => {
  let pieces = 0;
  const looks = new Set<string>();
  for (const layout of LAYOUTS) {
    let model: ForgedModel | null = null;
    for (const piece of PLACED.get(layout) ?? []) {
      if (!/\.(wall\.|feature\.)/.test(piece.module) || !isCave(layout, piece.cell)) continue;
      model ??= dungeonMesh(layout, [56, 2]);
      const side = wallSide(piece);
      const rock = rockOf(model, layout, piece.cell, side);
      const { along, into } = edgeOf(layout, piece.cell, side);
      const [minX, minY, maxX, maxY] = planOf(piece);
      const spans = [along(minX, minY), along(maxX, maxY)];
      const [first, last] = [Math.max(0, Math.min(...spans)), Math.min(layout.cell, Math.max(...spans))];
      const bounds = PACKS.get(piece.module.split('.')[0] as StyleKey)?.modules.get(piece.module)?.bounds ?? [];
      const laid = (z: number) => {
        const stretch = piece.place.stretch;
        if (!stretch) return piece.place.origin[2] + z;
        return z <= 0 ? stretch.from + z : z >= 1 ? stretch.to + z - 1 : stretch.from + z * (stretch.to - stretch.from);
      };
      const [low, high] = [laid(bounds[2] ?? 0), laid(bounds[5] ?? 0)];
      const back = into(piece.place.origin[0], piece.place.origin[1]);
      for (let step = 0; step <= 12; step++)
        for (let rise = 0; rise <= 12; rise++) {
          const depth = depthAt(rock, first + ((last - first) * step) / 12, low + ((high - low) * rise) / 12);
          if (depth !== null)
            assert.ok(
              back - depth <= 0.1 + FLOAT_M,
              `${piece.module} ${(back - depth).toFixed(2)} m in ${layout.name}`,
            );
        }
      looks.add(piece.module.split('.')[0] ?? '');
      pieces++;
    }
  }
  assert.ok(pieces > 40, `${pieces} pieces on cave walls`);
  assert.deepEqual([...looks].sort(), ['caverns', 'mines']);
});

test('the portal and the exit door stand on flat rock in a cave: no bulge over their arches', () => {
  let walls = 0;
  for (const layout of LAYOUTS) {
    const [east = 0, south = 0] = SIDE_STEPS[layout.portal.side] ?? [];
    const portal = cellAt(layout, layout.portal.x - east * 0.5, layout.portal.y - south * 0.5);
    const openings = [
      [portal, layout.portal.side],
      [layout.wayIn.cell, layout.wayIn.side],
    ].filter(([cell = 0]) => isCave(layout, cell));
    if (openings.length === 0) continue;
    const model = dungeonMesh(layout, [56, 2]);
    for (const [cell = 0, side = 0] of openings) {
      const rock = rockOf(model, layout, cell, side);
      for (let step = -13; step <= 13; step++)
        for (let rise = 0; rise <= 31; rise++) {
          const depth = depthAt(rock, layout.cell / 2 + step / 10, rise / 10);
          assert.ok(depth !== null && Math.abs(depth) < FLOAT_M, `${depth} m off the wall in ${layout.name}`);
        }
      walls++;
    }
  }
  assert.ok(walls > 10, `${walls} openings in caves`);
});
