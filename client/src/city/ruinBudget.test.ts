import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { BuildingTable, PropTable } from '../models/tables.ts';
import { startLand } from '../rules/landRules.ts';
import { parseBlockFile, type RmbBlock } from './blocks.ts';
import { buildCity } from './cityBuild.ts';
import { middleDraws } from './crystalInstances.ts';
import { NEAR_M } from './tiers.ts';
import type { CityPlan } from './plan.ts';

const content = (path: string) => readFile(new URL(`../../../content/${path}`, import.meta.url), 'utf8');
const LAND_WASM = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);

/** Mistfall's plan as the land's worker plans it, its blocks and the forged tables, from the repository's files. */
export async function mistfallForBudget(): Promise<{ plan: CityPlan; blocks: Map<string, RmbBlock>; tables: object }> {
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
  land.open(layout, 'continent-6', await content('world/land/continent-6.json'), true, rmbText, builders);
  const blocks = new Map<string, RmbBlock>();
  for (const text of texts) for (const block of parseBlockFile(text)) blocks.set(block.name, block);
  const tables = { buildings: JSON.parse(buildings) as BuildingTable, props: JSON.parse(props) as PropTable };
  return { plan: JSON.parse(land.cityPlan() ?? 'null') as CityPlan, blocks, tables };
}

test("a ruined city's crystal stays within the city's budgets, and builds in about the time a whole one does", async () => {
  const { plan, blocks, tables } = await mistfallForBudget();
  const climate = { climate: 'temperate', season: 'summer' } as const;
  const built = (ruined: boolean) => {
    const started = performance.now();
    const data = buildCity({ ...plan, ruined }, climate, blocks, tables as Parameters<typeof buildCity>[3]);
    return { data, ms: performance.now() - started };
  };
  // Warmed once each, then measured: the ruin builds in about the time its plan does with its buildings whole (on
  // this machine 1.1 s against 0.8 s), well under twice it.
  built(true);
  built(false);
  const [ruin, whole] = [built(true), built(false)];
  assert.ok(ruin.ms < 2 * whole.ms, `${ruin.ms} ms against ${whole.ms} ms`);
  const data = ruin.data;
  const solids = data.chunks.reduce((sum, chunk) => sum + chunk.solids.count / 3, 0);
  // Drawn at every distance: the solids (Mistfall's 135 406 triangles, its crown and fallen heaps among them) and the
  // great formations (1 092 of them, 253 692 triangles), each lighting a lamp.
  const formationTriangles = data.models.triangles.slice(data.firstFormation);
  const greats = data.crystal.great.reduce((sum, draw) => sum + draw.count, 0);
  const greatTriangles = data.crystal.great.reduce(
    (sum, draw) => sum + draw.count * formationTriangles[draw.model - data.firstFormation],
    0,
  );
  assert.ok(solids < 160_000, `${solids} solids`);
  assert.ok(greats > 600 && greatTriangles < 350_000, `${greats} great, ${greatTriangles} triangles`);
  assert.ok(data.lamps.length >= greats && data.lamps.length < 1500, `${data.lamps.length} lamps`);
  assert.ok(
    formationTriangles.every((count) => count < 350),
    `${formationTriangles}`,
  );
  // Drawn near only: the crust's solids, a chunk's at most a few thousand.
  assert.ok(Math.max(...data.chunks.map((chunk) => chunk.detail.count / 3)) < 4000);
  // From the landmark, before the view's culling: the middle distance's crystal (861 752 triangles) and the near
  // cells' formations (498 558) under a million and a half together.
  const eye = [0, -150, 60];
  const middle = middleDraws(data.chunks, data.crystal.middle, eye, data.firstFormation).reduce(
    (sum, draw) => sum + draw.count * formationTriangles[draw.model - data.firstFormation],
    0,
  );
  let near = 0;
  for (const [cell, list] of data.near) {
    const middleOf = data.cells.subarray(cell * 4, cell * 4 + 3);
    if (Math.hypot(middleOf[0] - eye[0], middleOf[1] - eye[1], middleOf[2] - eye[2]) >= NEAR_M) continue;
    for (const each of list) near += formationTriangles[each.model - data.firstFormation] ?? 0;
  }
  assert.ok(middle + near < 1_500_000, `${middle} middle, ${near} near`);
});
