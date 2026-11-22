import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { BuildingTable, PropTable } from '../models/tables.ts';
import { startLand } from '../rules/landRules.ts';
import { parseBlockFile, type RmbBlock } from './blocks.ts';
import { buildCity } from './cityBuild.ts';
import { FORMATIONS } from './overtaken.ts';
import type { CityPlan } from './plan.ts';

const content = (path: string) => readFile(new URL(`../../../content/${path}`, import.meta.url), 'utf8');
const LAND_WASM = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);

/** Mistfall's plan as the land's worker plans it, its blocks and the forged tables, from the repository's files. */
async function mistfall(): Promise<{ plan: CityPlan; blocks: Map<string, RmbBlock>; tables: object }> {
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

test("a ruined city's crystal stays within the city's budgets: few triangles far, its formations instanced near", async () => {
  const { plan, blocks, tables } = await mistfall();
  const climate = { climate: 'temperate', season: 'summer' } as const;
  const ruin = buildCity(plan, climate, blocks, tables as Parameters<typeof buildCity>[3]);
  const triangles = (data: typeof ruin, key: 'solids' | 'detail') =>
    data.chunks.reduce((sum, chunk) => sum + chunk[key].count / 3, 0);
  // Drawn at every distance: the solids, a ruin's great spires among them (Mistfall's are 156 194 triangles; the same
  // plan drawn as a port city's, its buildings whole, 52 166).
  assert.ok(triangles(ruin, 'solids') < 200_000, `${triangles(ruin, 'solids')} far`);
  // Drawn near only: the small solids, a chunk's at most a few thousand.
  assert.ok(Math.max(...ruin.chunks.map((chunk) => chunk.detail.count / 3)) < 4000);
  // The formations: one model each, instanced in the near cells, a cell's crystal a few thousand triangles.
  const first = ruin.models.entries.length - FORMATIONS.length;
  const formationTriangles = ruin.models.triangles.slice(first);
  let [most, cells] = [0, 0];
  for (const list of ruin.near.values()) {
    const drawn = list.reduce((sum, each) => sum + (formationTriangles[each.model - first] ?? 0), 0);
    most = Math.max(most, drawn);
    cells++;
  }
  assert.ok(
    formationTriangles.every((count) => count < 150),
    `${formationTriangles}`,
  );
  assert.ok(most < 12_000 && cells > 0, `a cell's crystal ${most} triangles`);
  assert.ok(ruin.lamps.length < 2000, `${ruin.lamps.length} lamps`);
});
