import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openingsOf } from '../models/buildings.ts';
import type { BuildingTable } from '../models/tables.ts';
import type { Solid } from './plan.ts';
import { cut, cutAtWindows, holeOf } from './windowCuts.ts';

const buildings = JSON.parse(
  readFileSync(new URL('../../../content/forged/buildings.json', import.meta.url), 'utf8'),
) as BuildingTable;

const plaster = (foot: readonly [number, number, number], size: readonly [number, number, number]): Solid => ({
  shape: 'block',
  at: foot,
  size,
  turn: 0,
  lean: 0,
  roll: 0,
  material: 'plaster',
});

/** Whether a point stands inside a solid's box. */
const holds = (solid: Solid, [x, y, z]: readonly number[]): boolean =>
  Math.abs(x - solid.at[0]) < solid.size[0] / 2 &&
  Math.abs(y - solid.at[1]) < solid.size[1] / 2 &&
  z > solid.at[2] &&
  z < solid.at[2] + solid.size[2];

test('a lining cut round a window keeps the rest of it, its whole depth, and nothing of the window', () => {
  // 6 m of lining along east, 0.2 m thick, 3 m tall; a window 1.6 m square from 1 m up, 2 m to 3.6 m along it.
  const wall = plaster([3, 0, 0], [6, 0.2, 3]);
  const pieces = cut(wall, { box: [2, -0.3, 3.6, 0.3, 1, 2.6], along: 0 });
  const volume = (solid: Solid): number => solid.size[0] * solid.size[1] * solid.size[2];
  const kept = pieces.reduce((sum, piece) => sum + volume(piece), 0);
  assert.ok(Math.abs(kept - (volume(wall) - 1.6 * 0.2 * 1.6)) < 1e-9, `${kept} m³ kept`);
  assert.ok(
    pieces.every((piece) => Math.abs(piece.size[1] - 0.2) < 1e-9),
    'each piece the lining whole deep',
  );
  assert.ok(!pieces.some((piece) => holds(piece, [2.8, 0, 1.8])), "nothing stands in the window's middle");
  assert.deepEqual(cut(wall, { box: [7, -0.3, 8, 0.3, 1, 2.6], along: 0 }), [wall], 'a window past its end');
});

test("an open building's lining is cut behind each of its windows, at any quarter turn", () => {
  const id = Number(Object.keys(buildings).find((key) => buildings[key].glass && openingsOf(buildings[key]).length));
  const [opening] = openingsOf(buildings[id]);
  for (const yaw of [0, 90, 180, 270]) {
    const piece = { model: id, building: true, open: true, at: [100, 200, 10] as const, yaw };
    // The window's middle, a hand inside its wall, turned into the world as the models are drawn (cityShaders turned).
    const inward = opening.fixed - (opening.normal[0] + opening.normal[2]) * 0.14;
    const [x, z] = opening.normal[0] ? [inward, opening.middle] : [opening.middle, inward];
    const [cosine, sine] = [Math.cos((yaw * Math.PI) / 180), Math.sin((yaw * Math.PI) / 180)];
    const middle = [100 + x * cosine + z * sine, 200 + x * sine - z * cosine, 10 + opening.level + opening.height / 2];
    const hole = holeOf(piece, opening);
    assert.ok(
      [0, 1].every((axis) => middle[axis] > hole.box[axis] && middle[axis] < hole.box[axis + 2]),
      `${yaw}°: the hole stands where the window is drawn`,
    );
    // A length of lining standing through that point, along the wall, cut away there; another solid kept whole.
    const along = hole.along === 0 ? [8, 0.2, 3] : [0.2, 8, 3];
    const lining = plaster([middle[0], middle[1], 10 + opening.level - 1], along as [number, number, number]);
    const stone = { ...lining, material: 'stone' as const };
    const after = cutAtWindows([lining, stone], [piece], buildings);
    assert.ok(
      !after.some((solid) => solid.material === 'plaster' && holds(solid, middle)),
      `${yaw}°: the lining is cut`,
    );
    assert.ok(after.includes(stone), `${yaw}°: what is not lining is kept`);
    assert.equal(cutAtWindows([lining], [{ ...piece, open: false }], buildings)[0], lining, 'closed: kept whole');
  }
});
