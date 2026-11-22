import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startRoomDoor } from '../../../server/roomDoor.ts';
import { roleOf } from '../islands/isleModules.ts';
import { readIslePlan } from '../islands/islePlan.ts';
import { GROWTH_ROLES } from '../islands/isleView.ts';
import { castOf } from '../nature/cast.ts';
import { TILE_M } from '../nature/scatter.ts';
import { countingGpu } from '../gpuForTests.ts';
import type { IsleShown } from '../islands/islePlan.ts';
import { IslesNature, islePlantings } from './isleNature.ts';

/** The room's module as `npm run wasm` copies it for the page. */
const ROOM = 'client/public/room.wasm';

test(
  "an island's growing modules stand as its climate's plants where they were placed",
  { skip: !existsSync(ROOM) },
  () => {
    const door = startRoomDoor(new WebAssembly.Module(readFileSync(ROOM)));
    const middle = [612_345, 287_654] as const;
    const isles = (['tundra', 'rainforest'] as const).map((climate, id) => ({
      id,
      at: [middle[0] + id * 5000, middle[1]] as const,
      climate,
      plan: readIslePlan(door.islePlan('2', climate)),
      heights: new Float64Array(),
    }));
    const plantings = islePlantings(isles);
    assert.deepEqual([...plantings.keys()], ['tundra', 'rainforest']);
    for (const isle of isles) {
      const cast = castOf(isle.climate);
      const growing = isle.plan.placements.filter(([module]) => GROWTH_ROLES.has(roleOf(module) ?? ''));
      const planted = [...(plantings.get(isle.climate)?.entries() ?? [])];
      assert.equal(
        planted.flatMap(([, plants]) => plants).length,
        growing.length,
        `every growing module of ${isle.climate}`,
      );
      for (const [key, plants] of planted)
        for (const plant of plants) {
          assert.equal(key, `${Math.floor(plant.at[0] / TILE_M)},${Math.floor(plant.at[1] / TILE_M)}`, 'in its tile');
          const placed = growing.find(([, x, y]) => x + isle.at[0] === plant.at[0] && y + isle.at[1] === plant.at[1]);
          assert.ok(placed, 'where the island placed it, in the world');
          const [module, , , z, turn, scale] = placed;
          assert.deepEqual([plant.z, plant.turn, plant.scale], [z, turn, scale]);
          const kind = cast.kinds.find((each) => each.name === plant.kind);
          assert.ok(kind, `${plant.kind} is of the ${isle.climate} cast`);
          if (roleOf(module) === 'tree')
            assert.ok(kind.layer === 'tall' && kind.swayM > 0, 'a tree is a tree, not a rock');
          else assert.equal(kind.layer, 'low', 'a shrub or grass is a low plant');
        }
    }
    assert.deepEqual(islePlantings(isles), plantings, 'the same plants every time');
  },
);

test("a climate no longer shown gives its plants' view back to the GPU", () => {
  const counting = countingGpu();
  const nature = new IslesNature(counting.gpu);
  const isle = (id: number, climate: string) =>
    ({ id, at: [0, 0], climate, plan: { placements: [] }, heights: new Float64Array() }) as unknown as IsleShown;
  nature.show([isle(0, 'tundra')]);
  const one = counting.live();
  nature.show([isle(0, 'tundra'), isle(1, 'rainforest')]);
  const each = counting.live() - one;
  assert.ok(each > 0, 'a view holds buffers of its own');
  nature.show([isle(1, 'rainforest')]);
  assert.equal(counting.live(), one, "the tundra's view went as it left");
  nature.show([]);
  assert.equal(counting.live(), one - each, "none shown, none kept but the sky's, which every view shares");
});
