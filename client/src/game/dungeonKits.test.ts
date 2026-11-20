import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import kits from '../../../content/dungeon/kits.json' with { type: 'json' };
import { ceilingHeights, isCave } from './dungeonCeilings.ts';
import { centreOf } from './dungeonCells.ts';
import { HEAD_M, kitHash, type KitPlacement, kitPlacements } from './dungeonKits.ts';
import { placedLandmarks } from './dungeonLandmarks.ts';
import {
  askDungeon,
  CORRIDOR,
  type DungeonLayout,
  openAt,
  SIDE_STEPS,
  styleAt,
  type StyleKey,
} from './dungeonLayout.ts';
import { type ModulePack, turnAbout } from './dungeonModules.ts';
import { FULL_PACKS, fullPack } from './dungeonPacks.test.ts';

const wasm = (() => {
  try {
    return readFileSync('client/public/room.wasm');
  } catch {
    throw new Error('room.wasm is not built: run `npm run wasm` first');
  }
})();
const module = await WebAssembly.compile(new Uint8Array(wasm));
/** Real dungeons of every style, from the room module's own rules. */
const LAYOUTS: readonly DungeonLayout[] = Array.from({ length: 40 }, (_unused, patrol) =>
  [0, 1, 2].map((number) => askDungeon(module, `patrol-${patrol}`, 'The Patrol', number)),
).flat();
const PLACED = new Map(LAYOUTS.map((layout) => [layout, kitPlacements(layout, FULL_PACKS)] as const));
const EPS = 1e-6;

type Rect = readonly [number, number, number, number];
const styleOf = (name: string) => name.split('.')[0] as StyleKey;
const pieceName = (name: string) => name.split('.').slice(1).join('.');
const boundsOf = (packs: ReadonlyMap<StyleKey, ModulePack>, name: string) => {
  const bounds = packs.get(styleOf(name))?.modules.get(name)?.bounds;
  assert.ok(bounds, `${name} is in its pack`);
  return bounds;
};
/** A placement's plan seen from above. */
function planOf({ module: name, place }: KitPlacement, packs = FULL_PACKS): Rect {
  const [minX, minY, , maxX, maxY] = boundsOf(packs, name);
  const [first, second] = [turnAbout([minX, minY, 0], place.turns), turnAbout([maxX, maxY, 0], place.turns)];
  const [x, y] = place.origin;
  return [
    Math.min(first[0], second[0]) + x,
    Math.min(first[1], second[1]) + y,
    Math.max(first[0], second[0]) + x,
    Math.max(first[1], second[1]) + y,
  ];
}
const columnRow = (layout: DungeonLayout, cell: number) => [cell % layout.columns, Math.floor(cell / layout.columns)];
const rockOn = (layout: DungeonLayout, cell: number, side: number) => {
  const [column = 0, row = 0] = columnRow(layout, cell);
  const [east = 0, south = 0] = SIDE_STEPS[side] ?? [];
  return !openAt(layout, column + east, row + south);
};
const cellOf = (layout: DungeonLayout, x: number, y: number) =>
  Math.floor(y / layout.cell) * layout.columns + Math.floor(x / layout.cell);
/** The side of its cell a wall piece stands on: the way its +y points is into the cell, away from that side. */
const wallSide = ({ place }: KitPlacement) => {
  const [x, y] = turnAbout([0, 1, 0], place.turns);
  return SIDE_STEPS.findIndex(([east, south]) => east === -Math.round(x) && south === -Math.round(y));
};
/** The cells a doorway, a torch, the exit or the portal stands on. */
function busyCells(layout: DungeonLayout): Set<number> {
  const busy = new Set([layout.wayIn.cell]);
  for (const [cell, side] of layout.frames) {
    const [east = 0, south = 0] = SIDE_STEPS[side] ?? [];
    busy.add(cell).add(cell + east + south * layout.columns);
  }
  for (const [x, y] of layout.torches) busy.add(cellOf(layout, x, y));
  const [east = 0, south = 0] = SIDE_STEPS[layout.portal.side] ?? [];
  return busy.add(cellOf(layout, layout.portal.x - east, layout.portal.y - south));
}
const alcove = (layout: DungeonLayout, cell: number) =>
  [0, 1, 2, 3].filter((side) => rockOn(layout, cell, side)).length === 3;
const each = (visit: (layout: DungeonLayout, placed: readonly KitPlacement[]) => void) =>
  PLACED.forEach((placed, layout) => visit(layout, placed));
const kind = (placed: readonly KitPlacement[], piece: RegExp) =>
  placed.filter(({ module: name }) => piece.test(pieceName(name)));

test('kitHash is FNV-1a over the dungeon’s name, the cell and the salt, then fmix32, the same on every machine', () => {
  const text = 'The Crypt\u00007\u0000door.1';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  assert.equal(kitHash('The Crypt', 7, 'door.1'), hash);
  const drawn = new Set([
    kitHash('The Crypt', 8, 'door.1'),
    kitHash('The Crypts', 7, 'door.1'),
    kitHash('The Crypt', 7, 'door.2'),
  ]);
  assert.equal(drawn.size, 3);
  assert.ok(!drawn.has(hash), 'each of them changes it');
});

test('a cell’s variant, its turn and its draw are each its own: no salt’s low bits follow another’s', () => {
  let [drawn, variantA] = [0, 0];
  const turns = [0, 0, 0, 0];
  for (const name of ['The Crypt of the Saltgrass Downs', 'The Halls of the Sunken Fen'])
    for (let cell = 0; cell < 4000; cell++) {
      if (kitHash(name, cell, 'floor.draw') % 4 !== 0) continue;
      drawn++;
      variantA += kitHash(name, cell, 'floor') % 2 === 0 ? 1 : 0;
      turns[kitHash(name, cell, 'floor.turns') % 4]++;
    }
  assert.ok(Math.abs(variantA / drawn - 0.5) < 0.05, `${variantA} of ${drawn} drawn cells take floor.a`);
  for (const count of turns) assert.ok(Math.abs(count / drawn - 0.25) < 0.04, `turns ${turns.join()}`);
  const slabs = [...PLACED.values()].flatMap((placed) =>
    kind(placed, /^floor\./).filter(({ module: name }) => kits.styles[styleOf(name)].floor === 'slabs'),
  );
  assert.deepEqual(new Set(slabs.map(({ module: name }) => pieceName(name))), new Set(['floor.a', 'floor.b']));
  assert.deepEqual(new Set(slabs.map(({ place }) => place.turns)), new Set([0, 1, 2, 3]));
});

test('every style lays its pieces from its own pack, and a style with no pack lays none', () => {
  const mixed = LAYOUTS.find((layout) => layout.looks.length === 2);
  assert.ok(mixed, 'a dungeon that breaks into a deeper style');
  const [first, deeper] = mixed.looks.map((look) => look.style);
  assert.ok(first && deeper);
  const one = new Map([[first, fullPack(first)]]);
  const placed = kitPlacements(mixed, one);
  assert.ok(placed.length > 0);
  assert.ok(placed.every((piece) => styleOf(piece.module) === first && styleAt(mixed, piece.cell) === first));
  assert.deepEqual(kitPlacements(mixed, new Map()), []);
  each((layout, all) => assert.ok(all.every((piece) => styleOf(piece.module) === styleAt(layout, piece.cell))));
});

test('a door stands in every doorway, its +y toward the corridor, its variant drawn by kitHash', () => {
  const variants = new Set<string>();
  each((layout, placed) => {
    const doors = kind(placed, /^door\./);
    assert.equal(doors.length, layout.frames.length);
    layout.frames.forEach(([cell, side], index) => {
      const door = doors[index];
      assert.ok(door && door.cell === cell);
      const [east = 0, south = 0] = SIDE_STEPS[side] ?? [];
      const [x, y] = turnAbout([0, 1, 0], door.place.turns);
      assert.deepEqual([Math.round(x) + 0, Math.round(y) + 0], [east, south]);
      const [column = 0, row = 0] = columnRow(layout, cell);
      assert.ok(Math.abs(door.place.origin[0] - (column + 0.5 + east / 2) * layout.cell) < EPS, 'on the edge');
      assert.ok(Math.abs(door.place.origin[1] - (row + 0.5 + south / 2) * layout.cell) < EPS);
      const variant = 'ab'[kitHash(layout.name, cell, `door.${side}`) % 2];
      assert.equal(pieceName(door.module), `door.${variant}`);
      variants.add(pieceName(door.module));
    });
  });
  assert.deepEqual([...variants].sort(), ['door.a', 'door.b']);
});

test('nothing but a doorway’s, a torch’s, the exit’s or the portal’s own pieces stands on their cells, nor in an alcove or on a landmark', () => {
  each((layout, placed) => {
    const busy = busyCells(layout);
    const covered = new Set(placedLandmarks(layout).flatMap((landmark) => landmark.cells));
    for (const piece of kind(placed, /^(wall|feature)\./).concat(
      kind(placed, /^ceiling\./).filter(({ module: name }) => !/^(crypt|halls|sanctum)/.test(name)),
    )) {
      assert.ok(!busy.has(piece.cell), `${piece.module} on a busy cell of ${layout.name}`);
      assert.ok(!alcove(layout, piece.cell), `${piece.module} in an alcove`);
    }
    for (const piece of placed) {
      const [minX, minY, maxX, maxY] = planOf(piece);
      for (const cell of covered) {
        const [column = 0, row = 0] = columnRow(layout, cell);
        const [west, north] = [column * layout.cell, row * layout.cell];
        const meets =
          minX < west + layout.cell - EPS &&
          maxX > west + EPS &&
          minY < north + layout.cell - EPS &&
          maxY > north + EPS;
        assert.ok(!meets, `${piece.module} over a landmark in ${layout.name}`);
      }
    }
  });
});

test('wall sets stand on straight walls every `wallEvery` cells, where each style stands them, facing into their cell', () => {
  const paired = new Map<StyleKey, number>();
  each((layout, placed) => {
    const bases = kind(placed, /^wall\.base$/);
    for (const base of bases) {
      const side = wallSide(base);
      const style = styleOf(base.module);
      const rule = kits.styles[style].wallIn;
      assert.ok(rockOn(layout, base.cell, side), 'on a wall');
      assert.equal(isCave(layout, base.cell), rule === 'cave rooms', 'on a cave’s rock only where its rule says');
      if (rule !== 'rooms+corridors') assert.ok((layout.cells[base.cell] ?? -1) >= 0, 'in a room');
      if (style === 'mines') continue;
      // The next set along the same unbroken run of wall stands `wallEvery` cells on.
      const step = side % 2 === 1 ? 1 : layout.columns;
      for (let gap = 1, cell = base.cell + step; gap <= 6; gap++, cell += step) {
        const same =
          layout.cells[cell] === layout.cells[base.cell] && layout.cellLooks[cell] === layout.cellLooks[base.cell];
        if (!same || !rockOn(layout, cell, side)) break;
        const next = bases.find((other) => other.cell === cell && wallSide(other) === side);
        if (!next) continue;
        assert.equal(gap % kits.styles[style].wallEvery, 0, `${layout.name}: sets ${gap} cells apart`);
        paired.set(style, (paired.get(style) ?? 0) + 1);
        break;
      }
    }
  });
  const all = [...paired.values()].reduce((sum, count) => sum + count, 0);
  assert.ok(all > 100, `${all} sets beside another along a wall`);
  assert.ok((paired.get('caverns') ?? 0) > 0, 'a pair in the caverns, whose caves’ straight walls are short');
});

test('in the caverns a set stands on a cave room’s rock, set back into it, its cap meeting the rock, none in head height past its room', () => {
  let [sets, back] = [0, 0];
  each((layout, placed) => {
    const busy = busyCells(layout);
    const height = ceilingHeights(layout);
    for (const piece of placed.filter(({ module: name }) => /^caverns\.wall\./.test(name))) {
      assert.ok(isCave(layout, piece.cell) && (layout.cells[piece.cell] ?? -1) >= 0, 'in a cave room');
      assert.ok(!busy.has(piece.cell), `${piece.module} on a doorway’s, a torch’s, the exit’s or the portal’s cell`);
      const side = wallSide(piece);
      const [east = 0, south = 0] = SIDE_STEPS[side] ?? [];
      const [column = 0, row = 0] = columnRow(layout, piece.cell);
      const [wallX, wallY] = [(column + 0.5 + east / 2) * layout.cell, (row + 0.5 + south / 2) * layout.cell];
      const into = (x: number, y: number) => -(east * (x - wallX) + south * (y - wallY));
      const along = (x: number, y: number) => Math.abs(-south * (x - wallX) + east * (y - wallY));
      const bounds = boundsOf(FULL_PACKS, piece.module);
      const low = piece.place.origin[2] + bounds[2] + (piece.place.stretch?.from ?? 0);
      const [minX, minY, maxX, maxY] = planOf(piece);
      if (low < HEAD_M)
        for (const [x, y] of [
          [minX, minY],
          [maxX, maxY],
        ] as const) {
          assert.ok(into(x, y) <= 0.3 + EPS && along(x, y) <= 0.8 + EPS, `${piece.module} in head height off its wall`);
        }
      if (/base$/.test(piece.module)) {
        const [x, y] = piece.place.origin;
        assert.ok(into(x, y) <= EPS, 'its back on the wall or behind it, in the rock');
        back += into(x, y) < -EPS ? 1 : 0;
        sets++;
      }
      if (!/cap$/.test(piece.module)) continue;
      const top = piece.place.origin[2] + bounds[5];
      const keep = (value: number, start: number) => Math.min(start + layout.cell, Math.max(start, value));
      for (let step = 0; step <= 10; step++)
        for (let across = 0; across <= 10; across++) {
          const x = keep(minX + ((maxX - minX) * step) / 10, column * layout.cell);
          const y = keep(minY + ((maxY - minY) * across) / 10, row * layout.cell);
          assert.ok(top >= height(piece.cell)(x, y) - EPS, 'its cap meets the rock all over it');
        }
    }
  });
  assert.ok(sets > 50 && back > 0, `${sets} sets, ${back} set back`);
});

test('the mines stand timber sets: a set on both walls across the way and a beam over every cell between', () => {
  let sets = 0;
  each((layout, placed) => {
    for (const base of kind(placed, /^wall\.base$/).filter(({ module: name }) => styleOf(name) === 'mines')) {
      const side = wallSide(base);
      const [east = 0, south = 0] = SIDE_STEPS[(side + 2) % 4] ?? [];
      let cell = base.cell;
      const across = [cell];
      while (!rockOn(layout, cell, (side + 2) % 4)) across.push((cell += east + south * layout.columns));
      const facing = kind(placed, /^wall\.base$/).some(
        (other) => other.cell === cell && wallSide(other) === (side + 2) % 4,
      );
      assert.ok(facing, `${layout.name}: a set faces the one on ${base.cell}`);
      for (const under of across)
        assert.ok(
          kind(placed, /^ceiling\./).some((beam) => beam.cell === under),
          'a beam over the way',
        );
      sets++;
    }
  });
  assert.ok(sets > 100);
});

test('features: at most the style’s number a room, each on a quiet cell’s wall that holds no set', () => {
  let laid = 0;
  each((layout, placed) => {
    const features = kind(placed, /^feature\./);
    const rooms = new Map<number, number>();
    for (const feature of features) {
      const room = layout.cells[feature.cell] ?? -1;
      rooms.set(room, (rooms.get(room) ?? 0) + 1);
      const side = wallSide(feature);
      assert.ok(rockOn(layout, feature.cell, side));
      assert.ok(
        [0, 1, 2, 3].every((other) => {
          const [east = 0, south = 0] = SIDE_STEPS[other] ?? [];
          return layout.cells[feature.cell + east + south * layout.columns] !== CORRIDOR;
        }),
        'quiet',
      );
      assert.ok(!kind(placed, /^wall\./).some((set) => set.cell === feature.cell && wallSide(set) === side));
    }
    for (const [room, count] of rooms) {
      const style = layout.looks[layout.rooms[room]?.look ?? 0]?.style ?? layout.style;
      assert.ok(room >= 0 && count <= kits.styles[style].features);
    }
    laid += features.length;
  });
  assert.ok(laid > 100);
});

test('ceilings: a boss at each dome’s top and along a vault’s ridge, beams across the narrower way, stalactites only under rock', () => {
  const seen = new Set<string>();
  each((layout, placed) => {
    const height = ceilingHeights(layout);
    for (const piece of kind(placed, /^ceiling\./)) {
      const style = styleOf(piece.module);
      const [x, y, z] = piece.place.origin;
      assert.ok(z + boundsOf(FULL_PACKS, piece.module)[2] >= HEAD_M - EPS, 'its foot over a body’s head');
      const ceiling = kits.styles[style].ceiling;
      seen.add(ceiling);
      if (ceiling === 'apex') {
        const room = layout.rooms[layout.cells[piece.cell] ?? -1];
        assert.ok(room && (room.ceiling === 'dome' || room.ceiling === 'vault'));
        assert.ok(Math.abs(z - height(piece.cell)(x, y)) < EPS, 'at the curved ceiling’s height there');
        const middle =
          (room.ceiling === 'vault' && room.width < room.depth ? room.x + room.width / 2 : room.y + room.depth / 2) *
          layout.cell;
        assert.ok(Math.abs((room.ceiling === 'vault' && room.width < room.depth ? x : y) - middle) < EPS, 'on its top');
      }
      if (ceiling === 'beams') {
        assert.ok(Math.abs(z - (layout.ceilings[piece.cell] ?? 0)) < EPS);
        const room = layout.rooms[layout.cells[piece.cell] ?? -1];
        const [runX] = turnAbout([1, 0, 0], piece.place.turns);
        if (room) assert.equal(Math.abs(Math.round(runX)), room.width >= room.depth ? 0 : 1, 'across the narrower way');
        else assert.ok(rockOn(layout, piece.cell, Math.round(runX) === 0 ? 1 : 0), 'across the corridor');
      }
      if (ceiling === 'hang') assert.ok(isCave(layout, piece.cell));
    }
  });
  assert.deepEqual([...seen].sort(), ['apex', 'beams', 'hang']);
});

test('stalactites hang where the cave comes lowest, their roots in the rock all round, never into head height', () => {
  const long = new Map([['caverns' as StyleKey, fullPack('caverns', 2.0)]]);
  let hung = 0;
  let refused = 0;
  for (const layout of LAYOUTS.filter((each) => each.looks.some((look) => look.style === 'caverns'))) {
    const height = ceilingHeights(layout);
    const stalactites = kitPlacements(layout, long).filter(({ module: name }) => /ceiling/.test(name));
    for (const piece of stalactites) {
      const [minX, minY, maxX, maxY] = planOf(piece, long);
      const [x, y, top] = piece.place.origin;
      const [column = 0, row = 0] = columnRow(layout, piece.cell);
      assert.ok(minX >= column * layout.cell - EPS && maxX <= (column + 1) * layout.cell + EPS, 'inside its cell');
      assert.ok(minY >= row * layout.cell - EPS && maxY <= (row + 1) * layout.cell + EPS);
      for (const [pointX, pointY] of [
        [minX, minY],
        [maxX, maxY],
        [minX, maxY],
        [maxX, minY],
        [x, y],
      ])
        assert.ok(top >= height(piece.cell)(pointX ?? 0, pointY ?? 0) - EPS, 'its root meets the rock');
      assert.ok(top + boundsOf(long, piece.module)[2] >= HEAD_M - EPS);
      hung++;
    }
    const corridors = layout.cells.filter((room, cell) => room === CORRIDOR && isCave(layout, cell)).length;
    refused +=
      corridors > 0 &&
      !stalactites.some((piece) => /ceiling\.a$/.test(piece.module) && layout.cells[piece.cell] === CORRIDOR)
        ? 1
        : 0;
  }
  assert.ok(hung > 20, `${hung} stalactites`);
  assert.ok(refused > 0, 'a 2 m stalactite never hangs in a cave corridor’s 3.2 m');
});

test('floor pieces lie off every solid, the arrival’s cell, the end room and every landmark, each kind where its style lays it', () => {
  const kinds = new Set<string>();
  each((layout, placed) => {
    const arrival = cellOf(layout, layout.arrival.x, layout.arrival.y);
    const covered = new Set(placedLandmarks(layout).flatMap((landmark) => landmark.cells));
    const drains = new Map<number, number>();
    for (const piece of kind(placed, /^floor\./)) {
      const [minX, minY, maxX, maxY] = planOf(piece);
      for (const [west, north, east, south] of layout.boxes)
        assert.ok(
          !(west < maxX - EPS && east > minX + EPS && north < maxY - EPS && south > minY + EPS),
          'under a solid',
        );
      assert.ok(piece.cell !== arrival && layout.cells[piece.cell] !== layout.end && !covered.has(piece.cell));
      const floor = kits.styles[styleOf(piece.module)].floor;
      kinds.add(floor);
      const room = layout.cells[piece.cell] ?? -1;
      if (floor === 'runner' || floor === 'rails') {
        assert.equal(room, CORRIDOR);
        const [alongX] = turnAbout([1, 0, 0], piece.place.turns);
        assert.ok(rockOn(layout, piece.cell, Math.round(alongX) === 0 ? 0 : 1), 'along the way');
      }
      if (floor === 'slabs') assert.ok(room >= 0);
      if (floor === 'drain' || floor === 'circle') drains.set(room, (drains.get(room) ?? 0) + 1);
      if (floor === 'circle') {
        const each = layout.rooms[room];
        assert.ok(each && each.width >= 3 && each.depth >= 3);
        assert.deepEqual(piece.place.origin.slice(0, 2), [...centreOf(layout, piece.cell)]);
      }
    }
    for (const count of drains.values()) assert.equal(count, 1);
  });
  assert.deepEqual([...kinds].sort(), ['circle', 'drain', 'rails', 'runner', 'scree', 'slabs']);
});

test('a sconce at every torch holds its flame, and the arches stand on the portal’s and the exit’s walls', () => {
  each((layout, placed) => {
    const sconces = kind(placed, /^sconce$/);
    assert.equal(sconces.length, layout.torches.length);
    layout.torches.forEach(([x, y, z], index) => {
      const sconce = sconces[index];
      assert.ok(sconce);
      const [outX, outY] = turnAbout([0, 0.35, 0], sconce.place.turns);
      assert.ok(
        Math.hypot(sconce.place.origin[0] + outX - x, sconce.place.origin[1] + outY - y) < EPS,
        'the flame 0.35 m out',
      );
      assert.equal(sconce.place.origin[2], z);
    });
    const arches = [kind(placed, /^portal$/), kind(placed, /^exit$/)];
    const sides = [layout.portal.side, layout.wayIn.side];
    arches.forEach(([arch], index) => {
      assert.ok(arch);
      assert.equal(wallSide(arch), sides[index]);
    });
    assert.equal(arches[1]?.[0]?.cell, layout.wayIn.cell);
  });
});

test('a pillar’s base stands on the floor, its capital’s top at the pillar’s top, its shaft stretched between', () => {
  let pillars = 0;
  each((layout, placed) => {
    layout.pillars.forEach(([x, y, height]) => {
      const here = placed.filter(({ place }) => place.origin[0] === x && place.origin[1] === y);
      const [base, shaft, capital] = ['pillar.base', 'pillar.shaft', 'pillar.capital'].map((name) =>
        here.find((piece) => pieceName(piece.module) === name),
      );
      if (!base || !shaft || !capital) return;
      const capitalBounds = boundsOf(FULL_PACKS, capital.module);
      assert.equal(base.place.origin[2], 0);
      assert.ok(Math.abs(capital.place.origin[2] + capitalBounds[5] - height) < EPS);
      assert.deepEqual(shaft.place.stretch, {
        from: boundsOf(FULL_PACKS, base.module)[5],
        to: capital.place.origin[2] + capitalBounds[2],
      });
      pillars++;
    });
  });
  assert.ok(pillars > 20);
});

test('a landmark’s cells and solids, turned as the rules turn them, are the layout’s own', () => {
  each((layout) => {
    const landmarks = placedLandmarks(layout);
    assert.equal(landmarks.length, layout.landmarks.length);
    const solids = landmarks.flatMap((landmark) => landmark.solids);
    const tail = layout.boxes.slice(layout.boxes.length - solids.length);
    solids.forEach((solid, index) =>
      solid.forEach((value, axis) => assert.ok(Math.abs(value - (tail[index]?.[axis] ?? NaN)) < 1e-9)),
    );
    for (const landmark of landmarks)
      for (const cell of landmark.cells)
        assert.equal(layout.cells[cell], layout.cells[landmark.cells[0] ?? 0], 'in one room');
  });
});
