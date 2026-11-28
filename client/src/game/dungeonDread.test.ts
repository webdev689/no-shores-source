import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { meshBuilder } from '../models/model.ts';
import { cellAt, isOpen, rockOn, SIDES, stepOf, wallPoint } from './dungeonCells.ts';
import { coldRooms, DREAD_ROLES, layDread } from './dungeonDread.ts';
import { askLayout, type DungeonLayout, type StyleKey } from './dungeonLayout.ts';
import { COLOUR } from './dungeonMesh.ts';
import { storeyPlanes } from './dungeonStoreyPlanes.ts';

const roomModule = (() => {
  try {
    return new WebAssembly.Module(readFileSync('client/public/room.wasm'));
  } catch {
    return null;
  }
})();

/** Dungeons of the six styles as the room module lays them, eight seeds each. */
function dungeons(module: WebAssembly.Module): DungeonLayout[] {
  const styles: StyleKey[] = ['crypt', 'halls', 'cells', 'sanctum', 'caverns', 'mines'];
  return styles.flatMap((style) =>
    [11, 23, 37, 41, 59, 61, 73, 89].map((seed) => askLayout(module, { seed, style, name: '' })),
  );
}

test("a cold room is never the way in's, the end's or a seal's, and a dread room is cold far more often", (context) => {
  if (!roomModule) return context.skip('room.wasm is not built: run `npm run wasm`');
  let [dread, dreadCold, other, otherCold] = [0, 0, 0, 0];
  const elite = askLayout(roomModule, { place: 'pearl-tomb', name: 'The Pearl Tomb' });
  assert.ok((elite.encounters?.seals.length ?? 0) > 0, 'an Elite Dungeon with its seals');
  for (const layout of [...dungeons(roomModule), elite]) {
    const cold = coldRooms(layout);
    assert.deepEqual([...coldRooms(layout)], [...cold], 'the same rooms every time');
    const seals = (layout.encounters?.seals ?? []).map((seal) => seal.room);
    for (const kept of [layout.wayIn.room, layout.end, ...seals])
      assert.ok(!cold.has(kept), `${layout.name}: ${kept} lit`);
    layout.rooms.forEach((room, number) => {
      if (number === layout.wayIn.room || number === layout.end) return;
      if (DREAD_ROLES.has(room.role)) [dread, dreadCold] = [dread + 1, dreadCold + Number(cold.has(number))];
      else [other, otherCold] = [other + 1, otherCold + Number(cold.has(number))];
    });
  }
  assert.ok(dread > 20, `${dread} dread rooms`);
  assert.ok(dreadCold / dread > 0.5 && otherCold / other < 0.3, `${dreadCold}/${dread} and ${otherCold}/${other} cold`);
});

test("the dread never stands in a body's way: on the floor under a step, on a wall, or over a head", (context) => {
  if (!roomModule) return context.skip('room.wasm is not built: run `npm run wasm`');
  let [drawn, hung] = [0, 0];
  for (const layout of dungeons(roomModule)) {
    for (const plane of storeyPlanes(layout)) {
      const mesh = meshBuilder();
      layDread(mesh, plane);
      const model = mesh.model();
      const again = meshBuilder();
      layDread(again, plane);
      assert.deepEqual(again.model().positions, model.positions, 'drawn alike every time');
      const local = plane.layout;
      for (const part of model.parts) {
        assert.ok(
          new Set<number>([COLOUR.blood, COLOUR.bone, COLOUR.shroud, COLOUR.eyes]).has(part.archive) ||
            part.archive >= 0,
          'blood, bone, shrouds, eyes and iron',
        );
        for (let index = part.start; index < part.start + part.count; index++) {
          const vertex = model.indices[index] ?? 0;
          const [x, y, z] = [0, 1, 2].map((axis) => model.positions[vertex * 3 + axis] ?? 0) as [
            number,
            number,
            number,
          ];
          drawn++;
          if (z < 0.2) continue;
          if (z > 2.15) {
            hung++;
            continue;
          }
          // Between, only against a wall of its own cell: a mark on it, or eyes low before it.
          const cell = cellAt(local, x, y);
          assert.ok(isOpen(local, cell), `${layout.name}: over open floor`);
          const onWall = SIDES.some((side) => {
            if (!rockOn(local, cell, side)) return false;
            const [wallX, wallY] = wallPoint(local, cell, side);
            const [east, south] = stepOf(side);
            return Math.abs((wallX - x) * east + (wallY - y) * south) < 0.85;
          });
          assert.ok(onWall, `${layout.name}: ${[x, y, z].map((part) => part.toFixed(2))} stands by a wall`);
        }
      }
    }
  }
  assert.ok(drawn > 1000 && hung > 0, `${drawn} corners drawn, ${hung} hung over a head`);
});
