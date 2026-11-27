import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LocalRoom } from '../network/localRoom.ts';
import { startWatersRules } from '../rules/watersRules.ts';
import { SEA_PORTS } from '../../../server/seaPorts.ts';
import { waterNamer, waterWords } from './seaHostiles.ts';
import { portsOf, sitesOf } from './worldData.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const WORLD = new URL('../../../content/world/', import.meta.url);

async function world() {
  const module = new WebAssembly.Module(await readFile(MODULE));
  const layoutText = await readFile(new URL('layout.json', WORLD), 'utf8');
  const layout = JSON.parse(layoutText) as { continents: { id: string; outline: [number, number][] }[] };
  const cities = await Promise.all(
    layout.continents.map(async (continent) => {
      const text = await readFile(new URL(`land/${continent.id}.json`, WORLD), 'utf8');
      return sitesOf(continent.id, text, []).city;
    }),
  );
  return { module, layoutText, layout, ports: portsOf(cities.filter((city) => city !== null)) };
}

test('the page and the server read the same ports from the land files', async () => {
  const { ports } = await world();
  assert.equal(ports.length, 9);
  assert.deepEqual(SEA_PORTS, ports);
});

test('the water the ship is in is named on the page, its band and holder from the waters the page opened', async () => {
  const { module, layoutText, layout, ports } = await world();
  const rules = startWatersRules(module);
  const named = waterNamer(rules, rules.open(layoutText, ports));
  // Off the eighth island's westmost corner, out to sea.
  const outline = layout.continents[7]?.outline ?? [];
  const west = outline.reduce((most, point) => (point[0] < most[0] ? point : most));
  const water = named([west[0] - 3_000, west[1]]);
  assert.ok(water, 'sea there');
  assert.equal(waterWords(water), 'The Fen Deeps, levels 22-26, The Lattice', 'a ruined city’s water, the Lattice’s');
  assert.equal(named([west[0] + 20_000, west[1]]), null, 'on land, none');
});

test('the page’s own sea room opens with the ports, and with the layout alone', async () => {
  const { module, layoutText, ports } = await world();
  assert.doesNotThrow(() => LocalRoom.openSea(module, layoutText, () => undefined, 7, ports));
  assert.doesNotThrow(() => LocalRoom.openSea(module, layoutText, () => undefined, 7));
});

test('a water named for its name alone asks nothing of who holds the sea there', () => {
  let asked = 0;
  const rules = {
    waterAt: () => ({
      continent: 0,
      get holder() {
        asked += 1;
        return 'home' as const;
      },
    }),
  } as unknown as Parameters<typeof waterNamer>[0];
  const table = { waters: [{ name: 'The Lantern Sea', levels: [1, 4] }] } as unknown as Parameters<
    typeof waterNamer
  >[1];
  const named = waterNamer(rules, table)([0, 0]);
  assert.equal(named?.name, 'The Lantern Sea');
  assert.equal(asked, 0, 'no second search of the coasts for the name');
  assert.equal(named?.holder, 'home');
  assert.equal(asked, 1);
});
