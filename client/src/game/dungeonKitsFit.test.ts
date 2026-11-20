// How kit pieces fit what else stands in a dungeon: the props hung on its walls and the rock of its caves.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { type ForgedModel, meshBuilder } from '../models/model.ts';
import { propModel } from '../models/props.ts';
import { propTable } from '../models/fixtures.test.ts';
import type { Rect } from './dungeonCells.ts';
import { type KitPlacement, kitPlacements } from './dungeonKits.ts';
import { askDungeon, type DungeonLayout, type StyleKey } from './dungeonLayout.ts';
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
/** Real dungeons of every style, and the ones the game was seen in with a pilaster through a picture. */
const LAYOUTS: readonly DungeonLayout[] = [
  patrolDungeon('saltgrass-downs', 1),
  patrolDungeon('gullwing-vale', 1),
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
