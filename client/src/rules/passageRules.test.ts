import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readPassageHeights, readPassagePlan, readPassageWeb, startPassageDoor } from './passageRules.ts';

const built = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const door = (() => {
  try {
    return startPassageDoor(new WebAssembly.Module(readFileSync(built)));
  } catch {
    throw new Error('room_wasm.wasm is not built with the passages: run `npm run wasm` first');
  }
})();

const WEEK = 2_900;

test('a week’s web reads whole: three mouths, twenty depths, every way on to a zone it holds', () => {
  const web = door.web('continent-1', WEEK);
  assert.ok(web);
  assert.equal(web.patrol, 'saltgrass-downs');
  assert.equal(web.mouths.length, 3);
  assert.equal(web.modifiers.length, 2);
  assert.equal(Math.max(...web.zones.map((zone) => zone.depth)), 20);
  const lamps = web.zones.filter((zone) => zone.lamp !== null).map((zone) => zone.depth);
  assert.deepEqual([...new Set(lamps)], [5, 10, 15, 20]);
  const deepest = web.zones.find((zone) => zone.depth === 20);
  assert.deepEqual(
    [web.zones[0]?.levels, deepest?.levels],
    [
      [1, 4],
      [27, 30],
    ],
    'its foes’ levels, by depth',
  );
  assert.equal(door.web('continent-9', WEEK), null, 'an island with no passages has no web');
});

test('every zone the Forge lays reads whole, its ground as its kind, its heights above ground only', () => {
  const web = door.web('continent-1', WEEK);
  assert.ok(web);
  let [under, open] = [0, 0];
  for (const zone of web.zones) {
    const plan = door.plan('continent-1', WEEK, zone.number);
    if (!plan) continue;
    assert.equal(plan.ground.kind, zone.ground.kind);
    assert.equal(plan.climate, 'woodland', 'the climate its hollow is dressed in, which the page draws');
    assert.equal(plan.pieces.filter((piece) => piece.kind === 'mouth').length, zone.onward.length);
    assert.equal(
      plan.pieces.some((piece) => piece.kind === 'lamp'),
      zone.lamp !== null,
      `zone ${zone.number}`,
    );
    const heights = door.heights('continent-1', WEEK, zone.number);
    if (plan.ground.kind === 'under') {
      under++;
      assert.equal(heights, null);
      assert.ok(plan.ground.layout.length > 0);
    } else {
      open++;
      assert.ok(heights);
      assert.equal(heights.length, 5 + (heights[3] ?? 0) * (heights[4] ?? 0));
    }
  }
  assert.ok(under > 0 && open > 0, `${under} under ground and ${open} above read`);
});

test('what does not read is refused, saying why', () => {
  assert.throws(() => readPassageWeb('{'), /not JSON/);
  const web = { island: 'a', patrol: 'b', week: 1, mouths: [{ run: 'r', zone: 4 }], modifiers: [], zones: [] };
  assert.throws(() => readPassageWeb(JSON.stringify(web)), /zone 4, which it does not hold/);
  assert.throws(() => readPassagePlan('{"zone": 3}'), /zone is no object/);
  assert.throws(() => readPassageHeights(new Uint8Array(12)), /no whole count/);
  assert.throws(() => readPassageHeights(new Uint8Array(new Float64Array([0, 0, 2, -1, -1, 0]).buffer)), /no grid/);
  const twice = { ...web, mouths: [], zones: [] as unknown[] };
  const zone = (number: number, lamp: number | null) => ({
    number,
    depth: 1,
    lane: 0,
    at: [0, 0],
    ground: { kind: 'open', form: 'hollow' },
    size: 'small',
    deal: 'lamp',
    currents: [],
    name: 'A hollow',
    onward: [],
    lamp,
  });
  twice.zones = [zone(1, null), zone(1, null)];
  assert.throws(() => readPassageWeb(JSON.stringify(twice)), /zone number twice/);
  twice.zones = [zone(1, 5)];
  assert.throws(() => readPassageWeb(JSON.stringify(twice)), /lamp 5/);
  assert.equal(readPassagePlan(''), null);
  assert.equal(readPassageHeights(new Uint8Array()), null);
});
