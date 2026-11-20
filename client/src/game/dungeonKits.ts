// Where a style's kit pieces stand in a dungeon, read from its layout alone so the rules never know them: a door in
// every doorway, a base, shaft and capital at every pillar, sets along the walls, a few features, pieces under the
// ceilings and on the floors, a sconce at every torch, and arches round the portal and the exit. Each style lays
// them as content/dungeon/kits.json says. Only a doorway's, a torch's, the exit's and the portal's own pieces stand
// on their cells' walls, and nothing stands in an alcove or on a landmark.
import kits from '../../../content/dungeon/kits.json' with { type: 'json' };
import { caveBulge, ceilingHeights, isCave } from './dungeonCeilings.ts';
import {
  alcove,
  besideCell,
  cellAt,
  cellsUnder,
  centreOf,
  columnRow,
  crowded,
  isOpen,
  ontoWall,
  planOf,
  quiet,
  type Rect,
  rockOn,
  SIDES,
  stepOf,
  wallPoint,
  wayTurns,
} from './dungeonCells.ts';
import { CORRIDOR, type DungeonLayout, styleAt, type StyleKey } from './dungeonLayout.ts';
import { placedLandmarks } from './dungeonLandmarks.ts';
import { type ModuleMesh, type ModulePack, type Place, type Turns, wallTurns } from './dungeonModules.ts';

/** A kit piece laid: its module, where it is laid, and the cell whose pictures it wears. */
export type KitPlacement = { readonly module: string; readonly place: Place; readonly cell: number };

type Rule = (typeof kits.styles)[StyleKey];
type Wall = readonly [cell: number, side: number];
type Piece = readonly [piece: string, place: Place];

const RULES: Readonly<Record<StyleKey, Rule>> = kits.styles;
/** The lowest a piece over the floor may come: over a body's head (m). */
export const HEAD_M = 2.4;
/** How far round a wall piece no prop may stand (m). */
const CLEAR_M = 0.05;
/** The style whose wall pieces stand in timber sets: on both walls of a way, a beam across it over them. */
const SETS_STYLE: StyleKey = 'mines';
/** How many strips the page cuts a curved ceiling into each way (`dungeonCeilings.ts`): a cave's rock comes lowest
 *  at one of their corners. */
const CUTS = 4;
const EPS = 1e-6;

/** A number from a dungeon's name, a cell and a salt: FNV-1a over their bytes, so every machine draws the same. */
export function kitHash(name: string, cell: number, salt: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(`${name}\u0000${cell}\u0000${salt}`))
    hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

/** What every placing reads of the layout: its packs, the cells with a doorway, a torch, the exit or the portal on
 *  them, the landmarks' cells, each cell's ceiling over its points, and the placements so far. */
type Site = {
  readonly layout: DungeonLayout;
  readonly packs: ReadonlyMap<StyleKey, ModulePack>;
  readonly busy: ReadonlySet<number>;
  readonly covered: ReadonlySet<number>;
  readonly height: (cell: number) => (x: number, y: number) => number;
  readonly placed: KitPlacement[];
  /** Each wall a set stands on, as `cell * 4 + side`. */
  readonly walled: Set<number>;
};

/** A cell's ceiling at a 3 × 3 grid of points over a plan, kept to the cell. */
function heightsOver(site: Site, cell: number, [minX, minY, maxX, maxY]: Rect): number[] {
  const [column, row] = columnRow(site.layout, cell);
  const size = site.layout.cell;
  const keep = (value: number, low: number) => Math.min(low + size, Math.max(low, value));
  const height = site.height(cell);
  return [0, 0.5, 1].flatMap((shareX) =>
    [0, 0.5, 1].map((shareY) =>
      height(keep(minX + (maxX - minX) * shareX, column * size), keep(minY + (maxY - minY) * shareY, row * size)),
    ),
  );
}

/** The piece `piece` of a cell's style, if its pack holds one. */
function pieceOf(site: Site, cell: number, piece: string): ModuleMesh | null {
  const style = styleAt(site.layout, cell);
  return (style && site.packs.get(style)?.modules.get(`${style}.${piece}`)) || null;
}

/** Lays a cell's pieces where each place says, all or none: none if any is missing or lies over a landmark. */
function put(site: Site, cell: number, pieces: readonly Piece[]): boolean {
  const modules = pieces.map(([piece]) => pieceOf(site, cell, piece));
  const clear = (module: ModuleMesh | null, place: Place) =>
    !!module && cellsUnder(site.layout, planOf(module, place)).every((under) => !site.covered.has(under));
  if (!pieces.every(([, place], index) => clear(modules[index] ?? null, place))) return false;
  pieces.forEach(([, place], index) => site.placed.push({ module: modules[index]?.name ?? '', place, cell }));
  return true;
}

/** Whether a cell may hold a piece that is not a doorway's, a torch's, the exit's or the portal's own. */
const free = (site: Site, cell: number) =>
  isOpen(site.layout, cell) && !site.busy.has(cell) && !site.covered.has(cell) && !alcove(site.layout, cell);

/** A base, a shaft and a cap on a cell's wall: the base on the floor, the cap's top where the ceiling comes lowest
 *  over it, the shaft stretched between them. None where a prop stands against the wall or the wall is too low. */
function wallSet(site: Site, [cell, side]: Wall): Piece[] | null {
  const pieces = ['wall.base', 'wall.shaft', 'wall.cap'];
  const [base, shaft, cap] = pieces.map((piece) => pieceOf(site, cell, piece));
  if (!base || !shaft || !cap || !free(site, cell) || site.walled.has(cell * 4 + side)) return null;
  const [x, y] = wallPoint(site.layout, cell, side);
  const turns = wallTurns(side);
  const flat: Place = { origin: [x, y, 0], turns };
  if ([base, shaft, cap].some((piece) => crowded(site.layout, planOf(piece, flat), CLEAR_M))) return null;
  const top = Math.min(...heightsOver(site, cell, planOf(cap, flat)));
  const capAt = top - cap.bounds[5];
  const [from, to] = [base.bounds[5], capAt + cap.bounds[2]];
  if (!(to > from)) return null;
  return [
    ['wall.base', flat],
    ['wall.shaft', { ...flat, stretch: { from, to } }],
    ['wall.cap', { origin: [x, y, capAt], turns }],
  ];
}

/** Lays a set on each wall given, all or none, and marks the walls they stand on. */
function setsOn(site: Site, walls: readonly Wall[]): boolean {
  const sets = walls.map((wall) => wallSet(site, wall));
  if (!sets.every((set) => set !== null)) return false;
  walls.forEach(([cell, side], index) => {
    if (put(site, cell, sets[index] ?? [])) site.walled.add(cell * 4 + side);
  });
  return true;
}

/** A ceiling piece hung with its top at `top`, if its foot stays over a body's head. */
function hang(site: Site, cell: number, piece: string, top: readonly [number, number, number], turns: Turns): boolean {
  const module = pieceOf(site, cell, piece);
  if (!module || top[2] + module.bounds[2] < HEAD_M - EPS) return false;
  return put(site, cell, [[piece, { origin: top, turns }]]);
}

/** The two walls across a way from `first` to `last`: north and south of a way along x, west and east of one along y. */
const wallsAcross = (first: number, last: number, alongX: boolean): Wall[] =>
  (alongX ? [3, 1] : [2, 0]).map((side, end) => [end ? last : first, side]);

/** A piece's variant drawn by kitHash: `.a`, `.b` and, of three, `.c`. */
const variant = (site: Site, cell: number, salt: string, count: number) =>
  'abc'[kitHash(site.layout.name, cell, salt) % count] ?? 'a';

/** Indices along a run of `length` every `every`, one in the run's middle, so a run's pieces stand evenly in it. */
function spaced(length: number, every: number): number[] {
  const middle = Math.floor((length - 1) / 2);
  return Array.from({ length }, (_unused, index) => index).filter(
    (index) => (((index - middle) % every) + every) % every === 0,
  );
}

/** The straight runs of cells that `holds`, each in order along x (or along y), in one room or one corridor of one
 *  look, each next to the one before. */
function runsOf(layout: DungeonLayout, holds: (cell: number) => boolean, alongX: boolean): number[][] {
  const next = (cell: number) => besideCell(layout, cell, alongX ? 0 : 1);
  const joins = (cell: number, other: number | null) =>
    other !== null &&
    holds(other) &&
    layout.cells[other] === layout.cells[cell] &&
    layout.cellLooks[other] === layout.cellLooks[cell];
  const runs: number[][] = [];
  for (let cell = 0; cell < layout.cells.length; cell++) {
    if (!holds(cell) || joins(cell, besideCell(layout, cell, alongX ? 2 : 3))) continue;
    const run = [cell];
    for (let along = next(cell); along !== null && joins(cell, along); along = next(along)) run.push(along);
    runs.push(run);
  }
  return runs;
}

/** Whether a style stands its wall pieces in a cell: a room's but a cave's, and a corridor's where its rule says. */
const wallsIn = (layout: DungeonLayout, rule: Rule, cell: number) =>
  isOpen(layout, cell) &&
  !isCave(layout, cell) &&
  (rule.wallIn === 'rooms+corridors' || (layout.cells[cell] ?? CORRIDOR) >= 0);

/** The sets along every straight run of wall, every `wallEvery` cells. */
function wallRuns(site: Site): void {
  const { layout } = site;
  for (const side of SIDES) {
    const holds = (cell: number) => {
      const style = styleAt(layout, cell);
      return !!style && style !== SETS_STYLE && wallsIn(layout, RULES[style], cell) && rockOn(layout, cell, side);
    };
    for (const run of runsOf(layout, holds, side % 2 === 1)) {
      const style = styleAt(layout, run[0] ?? 0);
      if (!style) continue;
      for (const index of spaced(run.length, RULES[style].wallEvery)) setsOn(site, [[run[index] ?? 0, side]]);
    }
  }
}

/** A timber set across a way: a set on its two walls and a beam across each of its cells, all or none. */
function timberSet(site: Site, cells: readonly number[], walls: readonly Wall[], turns: Turns): void {
  if (!cells.every((cell) => free(site, cell)) || !setsOn(site, walls)) return;
  for (const cell of cells) {
    const beam = `ceiling.${variant(site, cell, 'beam', 3)}`;
    hang(site, cell, beam, [...centreOf(site.layout, cell), site.layout.ceilings[cell] ?? 0], turns);
  }
}

/** The mines' timber sets: across every straight corridor, and across each hewn room's narrower way. */
function timberSets(site: Site): void {
  const { layout } = site;
  const every = RULES[SETS_STYLE].wallEvery;
  const minesWay = (cell: number) =>
    styleAt(layout, cell) === SETS_STYLE && layout.cells[cell] === CORRIDOR && !isCave(layout, cell);
  for (const alongX of [true, false]) {
    const holds = (cell: number) => minesWay(cell) && wayTurns(layout, cell) === (alongX ? 0 : 1);
    for (const run of runsOf(layout, holds, alongX))
      for (const index of spaced(run.length, every)) {
        const cell = run[index] ?? 0;
        timberSet(site, [cell], wallsAcross(cell, cell, alongX), alongX ? 1 : 0);
      }
  }
  layout.rooms.forEach((room, number) => {
    if (layout.looks[room.look]?.style !== SETS_STYLE || room.ceiling === 'cave') return;
    const alongX = room.width >= room.depth;
    const [length, span] = alongX ? [room.width, room.depth] : [room.depth, room.width];
    for (const index of spaced(length, every)) {
      const line = Array.from({ length: span }, (_unused, across) =>
        alongX
          ? (room.y + across) * layout.columns + room.x + index
          : (room.y + index) * layout.columns + room.x + across,
      );
      const walls = wallsAcross(line[0] ?? 0, line[line.length - 1] ?? 0, alongX);
      const across = line.every((cell) => layout.cells[cell] === number);
      if (across && walls.every(([cell, side]) => rockOn(layout, cell, side)))
        timberSet(site, line, walls, alongX ? 1 : 0);
    }
  });
}

/** How far a piece on a cave's wall stands back into the rock, so its back meets the rock where the wall stands back
 *  most behind it; none on a hewn wall. */
function setBack(layout: DungeonLayout, cell: number, side: number, module: ModuleMesh): number {
  if (!isCave(layout, cell)) return 0;
  const [x, y] = wallPoint(layout, cell, side);
  const [east, south] = stepOf(side);
  const half = Math.max(-module.bounds[0], module.bounds[3]) / layout.cell;
  const rise = Math.min(1, module.bounds[5] / (layout.ceilings[cell] ?? 1));
  const shares = [-1, -0.5, 0, 0.5, 1];
  const backs = shares.flatMap((share) =>
    shares.map((upShare) => {
      const along = share * half;
      return caveBulge(
        x + south * along * layout.cell,
        y - east * along * layout.cell,
        0.5 + along,
        ((upShare + 1) / 2) * rise,
      );
    }),
  );
  return Math.max(0, ...backs);
}

/** Up to `features` a room, each on a wall of a quiet cell that holds nothing else, drawn by kitHash; on a cave's
 *  wall it stands back into the rock. */
function features(site: Site): void {
  const { layout } = site;
  const walls = new Map<number, { cell: number; side: number; order: number }[]>();
  layout.cells.forEach((room, cell) => {
    if (room < 0 || !quiet(layout, cell) || !free(site, cell)) return;
    for (const side of SIDES) {
      if (!rockOn(layout, cell, side) || site.walled.has(cell * 4 + side)) continue;
      const order = kitHash(layout.name, cell, `feature.${side}`);
      walls.set(room, [...(walls.get(room) ?? []), { cell, side, order }]);
    }
  });
  for (const [room, list] of walls) {
    const style = layout.looks[layout.rooms[room]?.look ?? -1]?.style;
    if (!style) continue;
    const used = new Set<number>();
    for (const { cell, side } of list.sort((first, second) => first.order - second.order)) {
      if (used.size >= RULES[style].features || used.has(cell)) continue;
      const piece = `feature.${variant(site, cell, 'feature', 2)}`;
      const module = pieceOf(site, cell, piece);
      if (!module) continue;
      const [x, y] = wallPoint(layout, cell, side);
      const [east, south] = stepOf(side);
      const back = setBack(layout, cell, side, module);
      const place: Place = { origin: [x + east * back, y + south * back, 0], turns: wallTurns(side) };
      const fits = module.bounds[5] <= (layout.ceilings[cell] ?? 0);
      if (fits && !crowded(layout, planOf(module, place), CLEAR_M) && put(site, cell, [[piece, place]])) used.add(cell);
    }
  }
}

/** Whether a cell's ceiling is flat over it: no vault, dome or cave. */
function flatOver(layout: DungeonLayout, cell: number): boolean {
  const room = layout.cells[cell] ?? CORRIDOR;
  return !isCave(layout, cell) && (room < 0 || layout.rooms[room]?.ceiling === 'flat');
}

/** A stalactite where a cave cell's rock comes lowest, kept inside the cell, its root as high as the rock over it so
 *  it meets the rock all round; none where its tip would come under a body's head. */
function stalactite(site: Site, cell: number): void {
  const { layout } = site;
  const piece = `ceiling.${variant(site, cell, 'stalactite', 3)}`;
  const module = pieceOf(site, cell, piece);
  if (!module) return;
  const [column, row] = columnRow(layout, cell);
  const [west, north, step] = [column * layout.cell, row * layout.cell, layout.cell / CUTS];
  const height = site.height(cell);
  let lowest = { x: west, y: north, z: Infinity };
  for (let across = 0; across <= CUTS; across++)
    for (let down = 0; down <= CUTS; down++) {
      const [x, y] = [west + across * step, north + down * step];
      const z = height(x, y);
      if (z < lowest.z) lowest = { x, y, z };
    }
  const turns = (kitHash(layout.name, cell, 'stalactite.turns') % 4) as Turns;
  const [minX, minY, maxX, maxY] = planOf(module, { origin: [0, 0, 0], turns });
  const keep = (value: number, low: number, high: number) => Math.min(Math.max(value, low), Math.max(low, high));
  const x = keep(lowest.x, west - minX, west + layout.cell - maxX);
  const y = keep(lowest.y, north - minY, north + layout.cell - maxY);
  const top = Math.max(...heightsOver(site, cell, planOf(module, { origin: [x, y, 0], turns })));
  hang(site, cell, piece, [x, y, top], turns);
}

/** The ceiling pieces: a boss at each dome's top and every second cell of a vault's ridge; a beam across the
 *  narrower way of every flat cell; stalactites from one cave cell in six. */
function ceilings(site: Site): void {
  const { layout } = site;
  const size = layout.cell;
  layout.rooms.forEach((room, number) => {
    const style = layout.looks[room.look]?.style;
    if (!style || RULES[style].ceiling !== 'apex') return;
    const [middleX, middleY] = [(room.x + room.width / 2) * size, (room.y + room.depth / 2) * size];
    const boss = (x: number, y: number, turns: Turns) => {
      const cell = cellAt(layout, x, y);
      if (layout.cells[cell] !== number || site.covered.has(cell) || alcove(layout, cell)) return;
      hang(site, cell, `ceiling.${variant(site, cell, 'boss', 3)}`, [x, y, site.height(cell)(x, y)], turns);
    };
    if (room.ceiling === 'dome') boss(middleX, middleY, 0);
    if (room.ceiling !== 'vault') return;
    const alongX = room.width >= room.depth;
    for (const index of spaced(alongX ? room.width : room.depth, 2))
      if (alongX) boss((room.x + index + 0.5) * size, middleY, 0);
      else boss(middleX, (room.y + index + 0.5) * size, 1);
  });
  layout.cells.forEach((room, cell) => {
    const style = styleAt(layout, cell);
    if (!style || !free(site, cell)) return;
    const kind = RULES[style].ceiling;
    if (kind === 'hang' && isCave(layout, cell) && kitHash(layout.name, cell, 'hang') % 6 === 0) stalactite(site, cell);
    if (kind !== 'beams' || style === SETS_STYLE || !flatOver(layout, cell)) return;
    // A beam runs across the way: a room's longer side, or the corridor.
    const shape = layout.rooms[room];
    const way = shape ? (shape.width >= shape.depth ? 0 : 1) : wayTurns(layout, cell);
    const beam = `ceiling.${variant(site, cell, 'beam', 3)}`;
    if (way !== null)
      hang(site, cell, beam, [...centreOf(layout, cell), layout.ceilings[cell] ?? 0], (1 - way) as Turns);
  });
}

/** Whether a cell may hold a floor piece: open, never the arrival's, never in the end room (where the cache stands),
 *  never an alcove or a landmark's. */
const floorFree = (site: Site, cell: number) =>
  isOpen(site.layout, cell) &&
  !site.covered.has(cell) &&
  !alcove(site.layout, cell) &&
  cell !== cellAt(site.layout, site.layout.arrival.x, site.layout.arrival.y) &&
  site.layout.cells[cell] !== site.layout.end;

/** A floor piece over a point, if every cell under it may hold one, each its room's, and no solid stands on it. */
function floorPiece(site: Site, cell: number, piece: string, [x, y]: readonly [number, number], turns: Turns) {
  const module = pieceOf(site, cell, piece);
  if (!module) return false;
  const place: Place = { origin: [x, y, 0], turns };
  const plan = planOf(module, place);
  const room = site.layout.cells[cell];
  const under = cellsUnder(site.layout, plan);
  const fits = under.every((each) => floorFree(site, each) && site.layout.cells[each] === room);
  return fits && !crowded(site.layout, plan, 0) && put(site, cell, [[piece, place]]);
}

/** The floor pieces: slabs on one quiet room cell in four, a runner along the corridors, a drain a room, a circle in
 *  a great room's middle, scree on one cell in five, and rails along the straight corridors. */
function floors(site: Site): void {
  const { layout } = site;
  const size = layout.cell;
  const piece = (cell: number) => `floor.${variant(site, cell, 'floor', 2)}`;
  const turned = (cell: number) => (kitHash(layout.name, cell, 'floor.turns') % 4) as Turns;
  layout.cells.forEach((room, cell) => {
    const style = styleAt(layout, cell);
    if (!style || !floorFree(site, cell)) return;
    const kind = RULES[style].floor;
    const drawn = (count: number) => kitHash(layout.name, cell, 'floor.draw') % count === 0;
    const middle = centreOf(layout, cell);
    const way = room === CORRIDOR ? wayTurns(layout, cell) : null;
    if (kind === 'slabs' && quiet(layout, cell) && drawn(4)) floorPiece(site, cell, piece(cell), middle, turned(cell));
    if (kind === 'scree' && drawn(5)) floorPiece(site, cell, piece(cell), middle, turned(cell));
    if ((kind === 'runner' || kind === 'rails') && way !== null) floorPiece(site, cell, piece(cell), middle, way);
  });
  layout.rooms.forEach((room, number) => {
    const style = layout.looks[room.look]?.style;
    if (!style) return;
    const middle = [(room.x + room.width / 2) * size, (room.y + room.depth / 2) * size] as const;
    const kind = RULES[style].floor;
    if (kind === 'circle' && room.width >= 4 && room.depth >= 4) {
      const cell = cellAt(layout, ...middle);
      floorPiece(site, cell, piece(cell), middle, 0);
    }
    if (kind !== 'drain') return;
    const off = (cell: number) =>
      Math.hypot(...centreOf(layout, cell).map((value, axis) => value - (middle[axis] ?? 0)));
    const cells = layout.cells.flatMap((kept, cell) => (kept === number ? [cell] : []));
    cells.sort((first, second) => off(first) - off(second) || first - second);
    cells.some((cell) => floorPiece(site, cell, piece(cell), centreOf(layout, cell), 0));
  });
}

/** The pieces each feature of the layout wears: a door in every doorway, a pillar's three at every pillar, a sconce
 *  at every torch, and the arches round the portal and the exit door. */
function fittings(site: Site): void {
  const { layout } = site;
  const size = layout.cell;
  for (const [cell, side] of layout.frames) {
    const door = `door.${variant(site, cell, `door.${side}`, 2)}`;
    put(site, cell, [[door, { origin: [...wallPoint(layout, cell, side), 0], turns: ((side + 3) % 4) as Turns }]]);
  }
  for (const [x, y, height] of layout.pillars) {
    const cell = cellAt(layout, x, y);
    const [base, cap] = [pieceOf(site, cell, 'pillar.base'), pieceOf(site, cell, 'pillar.capital')];
    if (!base || !cap) continue;
    const capAt = height - cap.bounds[5];
    const [from, to] = [base.bounds[5], capAt + cap.bounds[2]];
    if (!(to > from)) continue;
    put(site, cell, [
      ['pillar.base', { origin: [x, y, 0], turns: 0 }],
      ['pillar.shaft', { origin: [x, y, 0], turns: 0, stretch: { from, to } }],
      ['pillar.capital', { origin: [x, y, capAt], turns: 0 }],
    ]);
  }
  for (const [x, y, z, side] of layout.torches)
    put(site, cellAt(layout, x, y), [
      ['sconce', { origin: [...ontoWall(layout, x, y, side), z], turns: wallTurns(side) }],
    ]);
  const arch = (piece: string, x: number, y: number, side: number) => {
    const [east, south] = stepOf(side);
    const [wallX, wallY] = ontoWall(layout, x, y, side);
    const cell = cellAt(layout, wallX - (east * size) / 2, wallY - (south * size) / 2);
    put(site, cell, [[piece, { origin: [wallX, wallY, 0], turns: wallTurns(side) }]]);
  };
  arch('portal', layout.portal.x, layout.portal.y, layout.portal.side);
  arch('exit', layout.exitDoor.x, layout.exitDoor.y, layout.wayIn.side);
}

/** Every kit piece of a dungeon, each from the pack of the style its cell wears; a style with no pack lays none. */
export function kitPlacements(layout: DungeonLayout, packs: ReadonlyMap<StyleKey, ModulePack>): KitPlacement[] {
  const busy = new Set<number>([layout.wayIn.cell]);
  for (const [cell, side] of layout.frames) {
    busy.add(cell);
    busy.add(besideCell(layout, cell, side) ?? cell);
  }
  for (const [x, y] of layout.torches) busy.add(cellAt(layout, x, y));
  const [east, south] = stepOf(layout.portal.side);
  busy.add(cellAt(layout, layout.portal.x - east * 0.5, layout.portal.y - south * 0.5));
  const site: Site = {
    layout,
    packs,
    busy,
    covered: new Set(placedLandmarks(layout).flatMap((landmark) => landmark.cells)),
    height: ceilingHeights(layout),
    placed: [],
    walled: new Set(),
  };
  timberSets(site);
  wallRuns(site);
  features(site);
  ceilings(site);
  floors(site);
  fittings(site);
  return site.placed;
}
