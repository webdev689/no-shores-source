import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { CityPlan } from '../../city/plan.ts';
import { startLand } from '../../rules/landRules.ts';
import { type Shot, onScreen } from '../camera.ts';
import { socialNode, windowRect } from '../nodes.ts';
import { HEAD_M, counterShot, hallShot, lineClear } from './framing.ts';
import { TOUR } from './tour.ts';

const content = (path: string) => readFile(new URL(`../../../../content/${path}`, import.meta.url), 'utf8');
const LAND_WASM = new URL('../../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);
/** The smallest view the game is laid out for, and how tall a keeper stands in it to be read, pixels. */
const SMALLEST = { width: 960, height: 540 };
const READABLE_PX = 48;

/** Overlook's social space as the page reads it: its counters from the land's plan of the city, the solids of its
 *  window from the land's boxes, its ground from the land. */
async function overlook() {
  const land = await startLand(
    await readFile(LAND_WASM).catch(() => {
      throw new Error('land_wasm.wasm is not built: run `npm run wasm` first');
    }),
  );
  const rmbText = await content('world/rmb/index.json');
  const index = JSON.parse(rmbText) as { blocks: readonly (readonly [string, string])[] };
  const files = [...new Set(index.blocks.map((row) => row[1]))].sort();
  const texts = await Promise.all(files.map((file) => content(`world/rmb/${file}`)));
  const [buildings, props, briefs] = await Promise.all([
    content('forged/buildings.json'),
    content('forged/props.json'),
    content('world/briefs.json'),
  ]);
  const builders = `"rmbBlocks":[${texts.join(',')}],"forged":{"buildings":${buildings},"props":${props}},"briefs":${briefs}`;
  const continent = 'continent-1';
  const ground = await content(`world/land/${continent}.json`);
  land.open(await content('world/layout.json'), continent, ground, true, rmbText, builders);
  const plan = JSON.parse(land.cityPlan() ?? 'null') as CityPlan;
  assert.equal(plan.name, 'Overlook');
  const node = socialNode(plan, continent);
  const groundAt = (x: number, y: number) => land.sample([[x, y]]).heights[0] ?? null;
  return { node, groundAt, blocks: land.boxes(...windowRect(node.ring)) };
}

test("on Overlook's own counters and solids every stop of the tour sees its keepers, near enough to read", async () => {
  const { node, groundAt, blocks } = await overlook();
  const stations = node.stations ?? [];
  const [x, y] = node.spawns[0] ?? node.centre;
  const own: Shot = {
    eye: [x, y + 4, (groundAt(x, y) ?? 0) + 2.5],
    yaw: Math.PI,
    pitch: 0.2,
    fov: 0.87,
    near: 0.1,
    far: 3000,
  };
  const place = { stations, groundAt, blocks };
  for (const step of TOUR.filter((each) => each.kinds.length > 0)) {
    const shot = (step.hall ? hallShot : counterShot)(place, step.kinds, own);
    assert.ok(shot, `${step.scene}: a shot`);
    for (const kind of step.kinds) {
      const away = (station: (typeof stations)[number]) =>
        Math.hypot(station.counter[0] - shot.eye[0], station.counter[1] - shot.eye[1]);
      const station = stations.filter((each) => each.kind === kind).sort((one, two) => away(one) - away(two))[0];
      assert.ok(station, `${kind} keeps a counter`);
      const feet: readonly [number, number, number] = [...station.keeper, groundAt(...station.keeper) ?? 0];
      const head: readonly [number, number, number] = [feet[0], feet[1], feet[2] + HEAD_M];
      const front: readonly [number, number, number] = [...station.counter, feet[2] + 1];
      // The Vault's keeper stands behind a wall solid whole, its window drawn: its counter is seen clear instead.
      const clear = lineClear(blocks);
      assert.ok(clear(shot.eye, head) || clear(shot.eye, front), `${step.scene}: ${kind} seen clear`);
      const [top, bottom] = [onScreen(shot, SMALLEST, head), onScreen(shot, SMALLEST, feet)];
      assert.ok(top && bottom && top[1] > 0 && bottom[1] < SMALLEST.height, `${step.scene}: ${kind} whole in the view`);
      assert.ok(top[0] > 0 && top[0] < SMALLEST.width, `${step.scene}: ${kind} across the view`);
      // The Hall's first shot is of its whole nave; each stop after it is of a keeper.
      if (step.scene === 'tourHall') continue;
      const tall = bottom[1] - top[1];
      assert.ok(tall >= READABLE_PX, `${step.scene}: ${kind} ${tall.toFixed(0)} px tall at 960x540`);
    }
  }
});
