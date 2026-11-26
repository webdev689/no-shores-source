import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startLand } from '../rules/landRules.ts';
import type { CityPlan } from './plan.ts';

const content = (path: string) => readFile(new URL(`../../../content/${path}`, import.meta.url), 'utf8');
const LAND_WASM = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);

/** A continent's city plan as the land's worker plans it, from the repository's files. */
async function planOf(continent: string): Promise<CityPlan> {
  const land = await startLand(
    await readFile(LAND_WASM).catch(() => {
      throw new Error('land_wasm.wasm is not built: run `npm run wasm` first');
    }),
  );
  const rmbText = await content('world/rmb/index.json');
  const layout = await content('world/layout.json');
  land.open(layout, continent, await content(`world/land/${continent}.json`), true, rmbText, '');
  return JSON.parse(land.cityPlan() ?? 'null') as CityPlan;
}

test("Overlook's lights stand in WebAssembly where the city crate places them natively", async () => {
  const plan = await planOf('continent-1');
  const lights = plan.lights ?? [];
  // the city crate's lights_tests.rs `digest`: each light's place to the centimetre, weighted by axis
  const sum = lights.reduce(
    (total, { at }) => total + Math.round(at[0] * 100) * 3 + Math.round(at[1] * 100) * 5 + Math.round(at[2] * 100) * 7,
    0,
  );
  assert.deepEqual([lights.length, sum], [1104, 1_593_904_071_900]);
});
