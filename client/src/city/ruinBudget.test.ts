import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { BuildingTable, PropTable } from '../models/tables.ts';
import { startLand } from '../rules/landRules.ts';
import { parseBlockFile, type RmbBlock } from './blocks.ts';
import { buildCity, type Chunk, type CityData } from './cityBuild.ts';
import { chunkDraws, withinMiddle } from './crystalInstances.ts';
import type { CityPlan } from './plan.ts';
import { NEAR_M } from './tiers.ts';

const content = (path: string) => readFile(new URL(`../../../content/${path}`, import.meta.url), 'utf8');
const LAND_WASM = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);
/** The six ruined cities' continents. */
const RUINS = ['continent-2', 'continent-3', 'continent-5', 'continent-6', 'continent-7', 'continent-8'];

/** The ruins' plans as the land's worker plans them, their blocks and the forged tables, from the repository's
 *  files. */
async function ruinsForBudget(): Promise<{ plans: CityPlan[]; blocks: Map<string, RmbBlock>; tables: object }> {
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
  const layout = await content('world/layout.json');
  const plans: CityPlan[] = [];
  for (const continent of RUINS) {
    land.open(layout, continent, await content(`world/land/${continent}.json`), true, rmbText, builders);
    plans.push(JSON.parse(land.cityPlan() ?? 'null') as CityPlan);
  }
  const blocks = new Map<string, RmbBlock>();
  for (const text of texts) for (const block of parseBlockFile(text)) blocks.set(block.name, block);
  const tables = { buildings: JSON.parse(buildings) as BuildingTable, props: JSON.parse(props) as PropTable };
  return { plans, blocks, tables };
}

/** The triangles some instance runs draw. */
const drawn = (data: CityData, draws: readonly { model: number; count: number }[]) =>
  draws.reduce((sum, draw) => sum + draw.count * (data.models.triangles[draw.model] ?? 0), 0);

/** The chunks a camera at `eye` (world) looking along `bearing` (radians clockwise from north) sees across, a view
 *  1 radian high at 16:9: those with a corner of their box within its width either way. */
function seenFrom(data: CityData, eye: readonly number[], bearing: number): Chunk[] {
  const halfWidth = Math.atan(Math.tan(0.5) * (16 / 9));
  const [east, south] = [eye[0] - data.origin[0], eye[1] - data.origin[1]];
  return data.chunks.filter((chunk) =>
    [chunk.low[0], chunk.high[0]].some((x) =>
      [chunk.low[1], chunk.high[1]].some((y) => {
        const turned = Math.atan2(x - east, -(y - south)) - bearing;
        return Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned))) < halfWidth;
      }),
    ),
  );
}

test("every ruined city's crystal stays within the city's budgets, and builds in about the time a whole one does", async () => {
  const { plans, blocks, tables } = await ruinsForBudget();
  const climate = { climate: 'temperate', season: 'summer' } as const;
  const build = (plan: CityPlan, ruined: boolean) => {
    const started = performance.now();
    const data = buildCity({ ...plan, ruined }, climate, blocks, tables as Parameters<typeof buildCity>[3]);
    return { data, ms: performance.now() - started };
  };
  for (const plan of plans) {
    // Warmed once each, then the middle of three builds of each, interleaved: the ruin builds in under two and a half
    // times the time its plan does with its buildings whole (1.5 to 2.1 times on this machine).
    build(plan, true);
    build(plan, false);
    const runs = [0, 1, 2].map(() => [build(plan, true).ms, build(plan, false).ms]);
    const middleOf = (values: number[]) => [...values].sort((a, b) => a - b)[1];
    const [ruinMs, wholeMs] = [middleOf(runs.map((run) => run[0])), middleOf(runs.map((run) => run[1]))];
    assert.ok(ruinMs < 2.5 * wholeMs, `${plan.id}: ${ruinMs} ms against ${wholeMs} ms`);
    const { data } = build(plan, true);
    const solids = data.chunks.reduce((sum, chunk) => sum + chunk.solids.count / 3, 0);
    const formationTriangles = data.models.triangles.slice(data.firstFormation);
    const greats = data.crystal.great.flat().reduce((sum, range) => sum + range.count, 0);
    const greatTriangles = drawn(data, chunkDraws(data.chunks, data.crystal.great, data.firstFormation, []));
    // Drawn where seen at every distance: the solids (the crown, the heaps, the works) and the great formations,
    // each lighting a lamp.
    assert.ok(solids < 200_000, `${plan.id}: ${solids} solids`);
    assert.ok(greats > 300 && greatTriangles < 450_000, `${plan.id}: ${greats} great, ${greatTriangles} triangles`);
    assert.ok(data.lamps.length >= greats && data.lamps.length < 2000, `${plan.id}: ${data.lamps.length} lamps`);
    assert.ok(
      formationTriangles.every((count) => count < 350),
      `${formationTriangles}`,
    );
    // Drawn near only: the crust's solids, a chunk's at most a few thousand.
    assert.ok(Math.max(...data.chunks.map((chunk) => chunk.detail.count / 3)) < 4000);
    // From the landmark, before the view's culling: the middle distance's crystal and the near cells' formations.
    const eye = [0, -150, 60];
    const middle = drawn(
      data,
      chunkDraws(
        data.chunks.filter((chunk) => withinMiddle(chunk, eye)),
        data.crystal.middle,
        data.firstFormation,
        [],
      ),
    );
    let near = 0;
    for (const [cell, list] of data.near) {
      const middleOf = data.cells.subarray(cell * 4, cell * 4 + 3);
      if (Math.hypot(middleOf[0] - eye[0], middleOf[1] - eye[1], middleOf[2] - eye[2]) >= NEAR_M) continue;
      for (const each of list) near += formationTriangles[each.model - data.firstFormation] ?? 0;
    }
    assert.ok(middle + near < 1_600_000, `${plan.id}: ${middle} middle, ${near} near`);
    // The great formations drawn only in the chunks a view sees: from the plaza looking at the landmark, a part.
    const plaza = plan.social.bounds;
    const standing = [(plaza[0] + plaza[2]) / 2, (plaza[1] + plaza[3]) / 2, plan.social.level + 2];
    const towardLandmark = Math.atan2(plan.centre[0] - standing[0], standing[1] - plan.centre[1]);
    const fromPlaza = seenFrom(data, standing, towardLandmark);
    const seen = drawn(data, chunkDraws(fromPlaza, data.crystal.great, data.firstFormation, []));
    assert.ok(seen < 0.8 * greatTriangles, `${plan.id}: ${seen} of ${greatTriangles} seen from the plaza`);
  }
});
