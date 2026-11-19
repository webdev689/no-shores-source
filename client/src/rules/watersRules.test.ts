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

test('the table names the nine waters, their holders and level bands, and plans 17 routes', async () => {
  const { table, openMs } = await opened();
  assert.equal(table.waters.length, 9);
  assert.deepEqual(
    table.waters.map((water) => water.holder),
    ['home', 'contested', 'grey-tithe', 'pirates', 'pirates', 'pirates', 'grey-tithe', 'grey-tithe', 'grey-tithe'],
  );
  assert.equal(table.waters[2]?.name, 'The Elmwater');
  assert.deepEqual(table.waters[7]?.levels, [22, 26]);
  assert.equal(table.borders.length, 17);
  assert.equal(table.routes.length, 17);
  assert.equal(table.roadsteads.length, 9);
  for (const route of table.routes) {
    assert.deepEqual(route.path[0], table.roadsteads[route.fromPort]);
    assert.deepEqual(route.path.at(-1), table.roadsteads[route.toPort]);
  }
  console.log(`open took ${openMs.toFixed(0)} ms in WebAssembly`);
});

test('a city stands on land and the sea off it is its island water', async () => {
  const { rules, table, ports } = await opened();
  const overlook = ports[0];
  assert.ok(overlook);
  assert.equal(rules.waterAt(overlook.centre), null);
  assert.deepEqual(rules.waterAt(table.roadsteads[0] ?? [0, 0]), { continent: 0, holder: 'home', seam: false });
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

test('ships near a port sail their routes at five metres a second', async () => {
  const { rules, ports } = await opened();
  const time = 1_795_000_000;
  const centre = ports[0]?.centre ?? [0, 0];
  const ships = rules.shipsNear(centre, 600_000, time);
  assert.ok(ships.length > 0);
  for (const ship of ships) {
    assert.ok(Math.hypot(ship.position[0] - centre[0], ship.position[1] - centre[1]) <= 600_000);
    assert.ok(ship.hull >= 0 && ship.hull <= 3);
    assert.ok(Math.abs(Math.hypot(...ship.direction) - 1) < 1e-9);
    const later = rules.ship(ship.id, time + 10);
    if (later) assert.ok(Math.abs(later.progressM - ship.progressM - 50) < 1e-6);
  }
  const first = ships[0];
  assert.ok(first);
  assert.deepEqual(rules.ship(first.id, time), first);
  assert.equal(rules.ship(first.id, 0), null);
});
