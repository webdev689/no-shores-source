import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { TrafficShip } from '../rules/watersRules.ts';
import { FriendlyTraffic } from './friendlyShips.ts';
import { openWaters, type OpenWaters, seaWatersOf, watersOnce } from './pageWaters.ts';
import type { SeaFrame } from './seaFrame.ts';
import { sitesOf, type WorldData } from './worldData.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const WORLD = new URL('../../../content/world/', import.meta.url);

async function world(): Promise<{ module: WebAssembly.Module; world: WorldData }> {
  const module = new WebAssembly.Module(await readFile(MODULE));
  const layoutText = await readFile(new URL('layout.json', WORLD), 'utf8');
  const layout = JSON.parse(layoutText) as { continents: { id: string }[] };
  const cities = await Promise.all(
    layout.continents.map(
      async ({ id }) => sitesOf(id, await readFile(new URL(`land/${id}.json`, WORLD), 'utf8'), []).city,
    ),
  );
  const found = cities.filter((city) => city !== null);
  return { module, world: { layoutText, continents: [], cities: found, nodes: [] } };
}

test('the waters are opened once a page, after a frame, and every reader awaits that one opening', async () => {
  const { module, world: data } = await world();
  let frames = 0;
  (globalThis as { requestAnimationFrame?: (then: () => void) => void }).requestAnimationFrame = (then) => {
    frames++;
    then();
  };
  const opening = watersOnce(Promise.resolve(module), data);
  const [first, second] = await Promise.all([opening, opening]);
  assert.equal(first, second);
  assert.equal(frames, 1);
});

test('at sea the water is named and the fights are told of by the three port cities, from the page’s waters', async () => {
  const { module, world: data } = await world();
  const open = openWaters(module, data);
  const sea = seaWatersOf(open, data);
  assert.deepEqual(
    sea.ports.map((port) => port.id),
    open.table.mainPorts,
  );
  const roadstead = open.table.ports[0]?.roadstead ?? [0, 0];
  assert.equal(sea.waterAt(roadstead)?.name, open.table.waters[0]?.name);
});

const sloop = (id: number, x: number): TrafficShip => ({
  id,
  route: 0,
  fromPort: 0,
  toPort: 1,
  hull: 0,
  position: [x, 0],
  direction: [1, 0],
  progressM: 0,
  lengthM: 1e9,
});

test('at sea the friendly ships take only the slots of their hull the room’s own ships leave free', async () => {
  const ships = Array.from({ length: 30 }, (_unused, n) => sloop(n, 100 * (n + 1)));
  const waters = { rules: { shipsNear: () => ships }, table: { friendlySpeedMS: 5 } } as unknown as OpenWaters;
  const traffic = new FriendlyTraffic(Promise.resolve(waters), 16);
  const own = { hull: 0, place: { scale: 1 } };
  const shown = {
    focus: [0, 0],
    shot: { far: 60_000 },
    ships: [own, own, own, { hull: 1, place: { scale: 1 } }],
    hulls: [],
  } as unknown as SeaFrame;
  const still = { swell: undefined, depthAt: () => 50 };
  assert.deepEqual(traffic.atSea(shown, still, 0.1, 1).ships, [], 'none before the waters open');
  await Promise.resolve();
  const frame = traffic.atSea(shown, still, 0.1, 1);
  assert.equal(frame.ships.length, 16 - 3);
  assert.equal(frame.marks.length, 30);
});
