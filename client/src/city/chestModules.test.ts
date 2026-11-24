import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHEST_OPEN_RAD, chestFaces, chestScale } from '../models/chest.ts';
import { chestModules } from './chestModules.ts';
import { moduleMesh, moduleNumber, moduleShape, moduleSocket } from './modules.ts';

const key = (point: readonly number[]) => point.map((each) => each.toFixed(4)).join(' ');

test('each chest and its lid are modules after the baked ones, in timber with iron or gold metal', () => {
  assert.deepEqual(
    ['chest', 'chest-lid', 'chest-heroic', 'chest-heroic-lid'].map((name) => moduleShape(moduleNumber(name)).materials),
    [['timber'], ['timber', 'iron', 'gold'], ['timber'], ['timber', 'gold']],
  );
  const [plain, heroic] = [moduleShape(moduleNumber('chest')).size, moduleShape(moduleNumber('chest-heroic')).size];
  assert.ok((plain[0] ?? 9) <= 0.95 && (plain[1] ?? 9) <= 0.58, 'the plain one in the box it is fitted to');
  assert.ok((heroic[0] ?? 0) > (plain[0] ?? 0) && (heroic[2] ?? 0) > (plain[2] ?? 0), 'the heroic one larger');
  assert.ok(moduleMesh(moduleNumber('chest-lid'), 0), 'its surfaces made already, nothing to fetch');
});

test("a lid swung by the props about its origin opens as the owner's chest opens, its origin the body's hinge", () => {
  for (const [name, wide, deep] of [
    ['chest', 0.95, 0.58],
    ['chest-heroic', 1.1, 0.66],
  ] as const) {
    const scale = chestScale(wide, deep);
    const hinge = moduleSocket(moduleNumber(name), 'hinge');
    const lid = chestModules().find((module) => module.name === `${name}-lid`);
    assert.ok(lid);
    const [cosine, sine] = [Math.cos(CHEST_OPEN_RAD), Math.sin(CHEST_OPEN_RAD)];
    const swung = new Set<string>();
    for (const mesh of lid.meshes)
      for (let vertex = 0; vertex < mesh.positions.length / 3; vertex++) {
        const [x, y, z] = [0, 1, 2].map((axis) => mesh.positions[vertex * 3 + axis] ?? 0) as [number, number, number];
        // As eventPropsDraw.ts swings a lid: about its own x, its +y rising.
        swung.add(key([x + hinge[0], y * cosine - z * sine + hinge[1], y * sine + z * cosine + hinge[2]]));
      }
    const opened = new Set(
      chestFaces(scale, CHEST_OPEN_RAD)
        .filter((face) => face.part !== 'base')
        .flatMap((face) => face.corners.map(key)),
    );
    assert.deepEqual([...swung].sort(), [...opened].sort(), name);
  }
});
