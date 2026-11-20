// How kit pieces fit what else stands in a dungeon: the props hung on its walls and the rock of its caves.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type ForgedModel, meshBuilder } from '../models/model.ts';
import { propModel } from '../models/props.ts';
import { propTable } from '../models/fixtures.test.ts';
import { caveBulge } from './dungeonCaveWall.ts';
import { isCave } from './dungeonCeilings.ts';
import { cellAt, type Rect } from './dungeonCells.ts';
import { HEAD_M, type KitPlacement, kitsOf } from './dungeonKits.ts';
import { askDungeon, type DungeonLayout, openAt, SIDE_STEPS, type StyleKey } from './dungeonLayout.ts';
import { dungeonMesh, lookAt } from './dungeonMesh.ts';
import {
  layModule,
  type ModuleMesh,
  type ModulePack,
  type Place,
  readModulePack,
  turnAbout,
} from './dungeonModules.ts';
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
const KITS = new Map(LAYOUTS.map((layout) => [layout, kitsOf(layout, PACKS, PROPS.get(layout) ?? [])] as const));
const PLACED = new Map(LAYOUTS.map((layout) => [layout, KITS.get(layout)?.placed ?? []] as const));
/** A dungeon's mesh as its kits leave it: the rock flat behind the pieces on its caves' walls. */
const meshOf = (layout: DungeonLayout) =>
  dungeonMesh(layout, [56, 2], undefined, {
    pillars: new Set(),
    torches: new Set(),
    portal: false,
    floorless: new Set(),
    flats: KITS.get(layout)?.fitted.flats ?? new Map(),
  });

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

/** The rock drawn on every cell's side, by `cell * 4 + side`: each triangle in its cell's wall picture along the
 *  edge and facing into the cell, its corners as how far along the edge, how far up and how far into the rock. */
function rocksOf(model: ForgedModel, layout: DungeonLayout): Map<number, number[][][]> {
  const rocks = new Map<number, number[][][]>();
  for (const part of model.parts)
    for (let index = part.start; index < part.start + part.count; index += 3) {
      const vertices = [0, 1, 2].map((offset) => model.indices[index + offset] ?? 0);
      const points = vertices.map((vertex) => [0, 1, 2].map((axis) => model.positions[vertex * 3 + axis] ?? 0));
      const first = (vertices[0] ?? 0) * 3;
      const [normalX = 0, normalY = 0] = [model.normals[first], model.normals[first + 1]];
      const side = SIDE_STEPS.findIndex(([east, south]) => -(normalX * east + normalY * south) > 0.9);
      if (side < 0) continue;
      // A little in from the triangle along its normal is inside its cell.
      const [middleX, middleY] = [0, 1].map((axis) => points.reduce((sum, point) => sum + (point[axis] ?? 0), 0) / 3);
      const cell = cellAt(layout, (middleX ?? 0) + normalX * 0.4, (middleY ?? 0) + normalY * 0.4);
      const look = lookAt(layout, cell);
      if (part.archive !== look.set || part.record !== look.wall) continue;
      const { along, into } = edgeOf(layout, cell, side);
      const corners = points.map(([x = 0, y = 0, z = 0]) => [along(x, y), z, into(x, y)]);
      const near = corners.every(
        ([place = 0, , depth = 0]) => place > -FLOAT_M && place < layout.cell + FLOAT_M && Math.abs(depth) < 0.3,
      );
      if (near) rocks.set(cell * 4 + side, [...(rocks.get(cell * 4 + side) ?? []), corners]);
    }
  return rocks;
}

/** How far into the rock a cave cell's side stands at a spot as its lattice lays it, with nothing flat on it:
 *  `caveBulge` at its 5 × 5 points, flat across each quad's two triangles, cut from its first corner to its opposite. */
function latticeRock(layout: DungeonLayout, cell: number, side: number, along: number, up: number): number {
  const [east = 0, south = 0] = SIDE_STEPS[side] ?? [];
  const half = layout.cell / 2;
  const [column, row] = [cell % layout.columns, Math.floor(cell / layout.columns)];
  const [leftX, leftY] = [
    (column + 0.5) * layout.cell + (east - south) * half,
    (row + 0.5) * layout.cell + (south + east) * half,
  ];
  const [wide, tall] = [layout.cell / 4, (layout.ceilings[cell] ?? 0) / 4];
  const lattice = (step: number, lift: number) =>
    caveBulge(leftX + south * step * wide, leftY - east * step * wide, step / 4, lift / 4);
  const [quadAlong, quadUp] = [Math.min(3, Math.floor(along / wide)), Math.min(3, Math.floor(up / tall))];
  const [across, rise] = [along / wide - quadAlong, up / tall - quadUp];
  const corner = (step: number, lift: number) => lattice(quadAlong + step, quadUp + lift);
  return across >= rise
    ? corner(0, 0) + across * (corner(1, 0) - corner(0, 0)) + rise * (corner(1, 1) - corner(1, 0))
    : corner(0, 0) + rise * (corner(0, 1) - corner(0, 0)) + across * (corner(1, 1) - corner(0, 1));
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

/** The cell and the side the portal and the exit door each stand on. */
function openingsOf(layout: DungeonLayout): (readonly [number, number])[] {
  const [east = 0, south = 0] = SIDE_STEPS[layout.portal.side] ?? [];
  const portal = cellAt(layout, layout.portal.x - east * 0.5, layout.portal.y - south * 0.5);
  return [
    [portal, layout.portal.side],
    [layout.wayIn.cell, layout.wayIn.side],
  ];
}

test('on a cave wall the rock is drawn flat behind every piece, buries none, and bulges as it did away from them', () => {
  let [pieces, kept] = [0, 0];
  const looks = new Set<string>();
  for (const layout of LAYOUTS) {
    const placed = (PLACED.get(layout) ?? []).filter(
      ({ module: name, cell }) => /\.(wall\.|feature\.)/.test(name) && isCave(layout, cell),
    );
    if (placed.length === 0) continue;
    const rocks = rocksOf(meshOf(layout), layout);
    // What stands against each cave wall: each piece's span along it and its top, and the arches.
    const spans = new Map<number, { from: number; to: number; top: number }[]>();
    for (const [cell, side] of openingsOf(layout))
      spans.set(cell * 4 + side, [{ from: layout.cell / 2 - 1.3, to: layout.cell / 2 + 1.3, top: 3.1 }]);
    for (const piece of placed) {
      const side = wallSide(piece);
      const key = piece.cell * 4 + side;
      const rock = rocks.get(key) ?? [];
      const { along, into } = edgeOf(layout, piece.cell, side);
      const [minX, minY, maxX, maxY] = planOf(piece);
      const ends = [along(minX, minY), along(maxX, maxY)];
      const [first, last] = [Math.max(0, Math.min(...ends)), Math.min(layout.cell, Math.max(...ends))];
      const bounds = PACKS.get(piece.module.split('.')[0] as StyleKey)?.modules.get(piece.module)?.bounds ?? [];
      const laid = (z: number) => {
        const stretch = piece.place.stretch;
        if (!stretch) return piece.place.origin[2] + z;
        return z <= 0 ? stretch.from + z : z >= 1 ? stretch.to + z - 1 : stretch.from + z * (stretch.to - stretch.from);
      };
      const [low, top] = [laid(bounds[2] ?? 0), laid(bounds[5] ?? 0)];
      const back = into(piece.place.origin[0], piece.place.origin[1]);
      assert.ok(Math.abs(back) < FLOAT_M, `${piece.module}'s back on the wall's line`);
      const head = Math.min(top, layout.ceilings[piece.cell] ?? 0);
      for (let step = 0; step <= 12; step++)
        for (let rise = 0; rise <= 12; rise++) {
          const spot = first + ((last - first) * step) / 12;
          const flat = depthAt(rock, spot, (head * rise) / 12);
          assert.ok(flat !== null && Math.abs(flat) < FLOAT_M, `${flat} m behind ${piece.module} in ${layout.name}`);
          const over = depthAt(rock, spot, low + ((top - low) * rise) / 12);
          if (over !== null) assert.ok(back - over < FLOAT_M, `${piece.module} in the rock in ${layout.name}`);
        }
      spans.set(key, [...(spans.get(key) ?? []), { from: first, to: last, top }]);
      looks.add(piece.module.split('.')[0] ?? '');
      pieces++;
    }
    // Past every span by its 0.15 m and the 0.3 m it eases over, the rock is as its lattice lays it.
    for (const [key, rock] of rocks) {
      const [cell, side] = [Math.floor(key / 4), key % 4];
      // A cave cell's side on rock: an open side holds only a doorway's jambs in the wall's picture.
      const [east = 0, south = 0] = SIDE_STEPS[side] ?? [];
      const [column, row] = [(cell % layout.columns) + east, Math.floor(cell / layout.columns) + south];
      if (!isCave(layout, cell) || openAt(layout, column, row)) continue;
      const near = (spot: number, up: number) =>
        (spans.get(key) ?? []).some(({ from, to, top }) => spot > from - 0.45 && spot < to + 0.45 && up < top + 0.3);
      const high = layout.ceilings[cell] ?? 0;
      for (let step = 0; step <= 16; step++)
        for (let rise = 0; rise <= 16; rise++) {
          const [spot, up] = [(layout.cell * step) / 16, (high * rise) / 16];
          const depth = depthAt(rock, spot, up);
          if (near(spot, up) || depth === null) continue;
          const lattice = latticeRock(layout, cell, side, spot, up);
          assert.ok(Math.abs(depth - lattice) < FLOAT_M, `${depth} m, not ${lattice} m, in ${layout.name}`);
          kept++;
        }
    }
  }
  assert.ok(pieces > 300 && kept > 10000, `${pieces} pieces on cave walls, ${kept} spots of rock as it was`);
  assert.deepEqual([...looks].sort(), ['caverns', 'mines']);
});

test('the portal and the exit door stand on flat rock in a cave: no bulge over their arches', () => {
  let walls = 0;
  for (const layout of LAYOUTS) {
    const openings = openingsOf(layout).filter(([cell]) => isCave(layout, cell));
    if (openings.length === 0) continue;
    const rocks = rocksOf(meshOf(layout), layout);
    for (const [cell, side] of openings) {
      const rock = rocks.get(cell * 4 + side) ?? [];
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

test('no door rises past its frame, the lower of its two ceilings, and the way through it is as it was built', () => {
  let [doors, squeezed] = [0, 0];
  const laid = (module: ModuleMesh, place: Place) => {
    const mesh = meshBuilder();
    layModule(mesh, module, place, () => [1, 0]);
    return mesh.model().positions;
  };
  for (const layout of LAYOUTS) {
    const placed = (PLACED.get(layout) ?? []).filter(({ module: name }) => /\.door\./.test(name));
    assert.equal(placed.length, layout.frames.length);
    layout.frames.forEach(([cell, , frame], index) => {
      const door = placed[index];
      const module = PACKS.get(door?.module.split('.')[0] as StyleKey)?.modules.get(door?.module ?? '');
      assert.ok(door && door.cell === cell && module);
      const fitted = laid(module, door.place);
      const built = laid(module, { origin: door.place.origin, turns: door.place.turns });
      const tall = module.bounds[5] > frame;
      for (let vertex = 0; vertex < built.length; vertex += 3) {
        assert.ok((fitted[vertex + 2] ?? 0) <= frame + FLOAT_M, `${door.module} through its frame in ${layout.name}`);
        // Under the clear way's head it stands as built, its way through among it; and none is stretched up.
        if ((built[vertex + 2] ?? 0) <= HEAD_M || !tall)
          for (const axis of [0, 1, 2])
            assert.ok(Math.abs((fitted[vertex + axis] ?? 0) - (built[vertex + axis] ?? 0)) < FLOAT_M, 'as built');
      }
      const top = Math.max(...fitted.filter((_value, place) => place % 3 === 2));
      if (tall) assert.ok(Math.abs(top - frame) < FLOAT_M, 'its top at the frame');
      squeezed += tall ? 1 : 0;
      doors++;
    });
  }
  assert.ok(doors > 500 && squeezed > 100, `${squeezed} of ${doors} doors squeezed`);
});
