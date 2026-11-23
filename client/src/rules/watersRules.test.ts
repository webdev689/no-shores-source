import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LAND_CELL, type PortInfo, SEAM_BIT, startWatersRules } from './watersRules.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const WORLD = new URL('../../../content/world/', import.meta.url);

async function opened() {
  const bytes = await readFile(MODULE).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  });
  const rules = startWatersRules(new WebAssembly.Module(bytes));
  const layoutText = await readFile(new URL('layout.json', WORLD), 'utf8');
  const ports: PortInfo[] = [];
  for (let n = 1; n <= 9; n += 1) {
    const id = `continent-${n}`;
    const edits = JSON.parse(await readFile(new URL(`land/${id}.json`, WORLD), 'utf8')) as { city: PortInfo };
    ports.push({ id: edits.city.id, name: edits.city.name, continent: id, centre: edits.city.centre });
  }
  const started = performance.now();
  const table = rules.open(layoutText, ports);
  const openMs = performance.now() - started;
  return { rules, table, ports, openMs };
}

test('the table names the nine waters and the three port cities, and plans a route between each pair', async () => {
  const { table, openMs } = await opened();
  assert.equal(table.waters.length, 9);
  assert.deepEqual(
    table.waters.map((water) => water.holder),
    ['home', 'contested', 'grey-tithe', 'pirates', 'pirates', 'pirates', 'grey-tithe', 'grey-tithe', 'grey-tithe'],
  );
  assert.equal(table.waters[2]?.name, 'The Elmwater');
  assert.deepEqual(table.waters[7]?.levels, [22, 26]);
  assert.equal(table.borders.length, 17);
  assert.deepEqual(table.mainPorts, ['overlook', 'sunspire', 'rimeholt']);
  assert.deepEqual(
    table.ports.map((port) => port.name),
    ['Overlook', 'Sunspire', 'Rimeholt'],
  );
  assert.deepEqual(
    table.routes.map((route) => [route.fromPort, route.toPort]),
    [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 2],
      [0, 2],
      [0, 2],
      [1, 2],
      [1, 2],
      [1, 2],
    ],
    'three courses between each pair of the port cities',
  );
  for (const route of table.routes) {
    assert.deepEqual(route.path[0], table.ports[route.fromPort]?.roadstead);
    assert.deepEqual(route.path.at(-1), table.ports[route.toPort]?.roadstead);
  }
  console.log(`open took ${openMs.toFixed(0)} ms in WebAssembly`);
});

test('a city stands on land and the sea off it is its island water', async () => {
  const { rules, table, ports } = await opened();
  const overlook = ports[0];
  assert.ok(overlook);
  assert.equal(rules.waterAt(overlook.centre), null);
  assert.deepEqual(rules.waterAt(table.ports[0]?.roadstead ?? [0, 0]), { continent: 0, holder: 'home', seam: false });
});

test('the held map grid has its cells, and agrees with the water at each cell middle', async () => {
  const { rules } = await opened();
  const started = performance.now();
  const grid = rules.grid(4_800);
  console.log(`grid(4800) took ${(performance.now() - started).toFixed(0)} ms in WebAssembly`);
  assert.deepEqual([grid.columns, grid.rows, grid.cells.length], [1024, 640, 1024 * 640]);
  let seam = 0;
  for (let cell = 0; cell < grid.cells.length; cell += 997) {
    const middle = [((cell % 1024) + 0.5) * 4_800, (Math.floor(cell / 1024) + 0.5) * 4_800] as const;
    const water = rules.waterAt(middle);
    const byte = grid.cells[cell];
    assert.equal(byte, water === null ? LAND_CELL : water.continent | (water.seam ? SEAM_BIT : 0));
    if (water?.seam) {
      seam += 1;
      assert.equal(water.holder, 'contested');
    }
  }
  assert.ok(seam > 0, 'the seam shows on the grid');
  assert.throws(() => rules.grid(10), /no grid/);
});

test('the table gives the sea’s facts as its rules have them: its reaches and every ship’s name', async () => {
  const { table } = await opened();
  assert.deepEqual([table.sea.engageM, table.sea.repairReachM], [750, 3_000]);
  assert.ok(table.sea.holdReachM > table.sea.engageM, `the hold reaches past its sight: ${table.sea.holdReachM}`);
  assert.deepEqual(table.sea.shipNames[1], ['Tithe Sloop', 'Tithe Schooner', 'Tithe Brig', 'Tithe Frigate']);
});

test('ships near a port sail their routes at the pace the table gives', async () => {
  const { rules, table, ports } = await opened();
  assert.ok(table.friendlySpeedMS > 0);
  const time = 1_795_000_000;
  const centre = ports[0]?.centre ?? [0, 0];
  const ships = rules.shipsNear(centre, 600_000, time);
  assert.ok(ships.length > 0);
  for (const ship of ships) {
    assert.ok(Math.hypot(ship.position[0] - centre[0], ship.position[1] - centre[1]) <= 600_000);
    assert.ok(ship.hull >= 0 && ship.hull <= 3);
    assert.ok(Math.abs(Math.hypot(...ship.direction) - 1) < 1e-9);
    const later = rules.ship(ship.id, time + 10);
    // Lying at its route's end it has stopped; under way it makes the table's pace.
    if (later && later.progressM < later.lengthM)
      assert.ok(Math.abs(later.progressM - ship.progressM - table.friendlySpeedMS * 10) < 1e-6);
  }
  const first = ships[0];
  assert.ok(first);
  assert.deepEqual(rules.ship(first.id, time), first);
  assert.equal(rules.ship(first.id, 0), null);
});

/** Points from Overlook's roadstead out to the open sea west of it (crates/room-wasm/src/waters_door_tests.rs
 *  `sea_points`). */
const SEA_POINTS = Array.from(
  { length: 40 },
  (_value, step) => [2_790_000.125 - 9_000.5 * step, 1_199_000.75 + 1_250.25 * step] as const,
);

test('the sea by weather is calm in a roadstead and the deep sea holds to the fingerprint the crate holds natively', async () => {
  const { rules, table } = await opened();
  const time = 1_790_000_123.25;
  const roadstead = table.ports[0]?.roadstead ?? [0, 0];
  const swell = rules.seaSwell(roadstead, time);
  assert.equal(swell.harbour, 1);
  // Calmer than a moderate sea, and as calm whatever the weather does out at sea.
  const hours = [1, 2, 3, 4, 5, 6].map((hour) => time + hour * 3_600);
  const out = new Set(hours.map((moment) => rules.seaSwell(SEA_POINTS.at(-1) ?? [0, 0], moment).height));
  assert.ok(swell.height < 1 && out.size > 1, `roadstead ${swell.height}, open sea ${[...out].join(', ')}`);
  for (const moment of hours) assert.equal(rules.seaSwell(roadstead, moment).height, swell.height);
  assert.ok(swell.waves.length > 0 && swell.waves.length <= 40);
  assert.ok(Math.abs(Math.hypot(...swell.wind) - Math.hypot(swell.wind[0], swell.wind[1])) < 1e-9);
  const grid = rules.seaHeights([roadstead[0] - 2_000, roadstead[1] - 2_000], 1_000, 4, 4, time);
  assert.equal(grid.length, 16);
  assert.equal(rules.seaHash(SEA_POINTS, time), 'aa8b7cd0624a292d');
});
