import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startPassageDoor } from '../../rules/passageRules.ts';
import { floorOf, UNDER_FLOOR_M, zoneIsle, zoneLayout } from './passageZone.ts';

const door = startPassageDoor(
  new WebAssembly.Module(
    readFileSync(new URL('../../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)),
  ),
);
const WEEK = 2_900;
const web = door.web('continent-1', WEEK);

test('each zone is drawn as its kind: a layout under ground, an island’s ground and modules above it', () => {
  assert.ok(web);
  for (const zone of web.zones) {
    const plan = door.plan('continent-1', WEEK, zone.number);
    if (!plan) continue;
    const heights = door.heights('continent-1', WEEK, zone.number);
    if (plan.ground.kind === 'under') {
      assert.ok(zoneLayout(plan));
      assert.equal(floorOf(plan, null)(3, 4), UNDER_FLOOR_M);
      continue;
    }
    assert.ok(heights);
    const shown = zoneIsle(plan, heights);
    assert.ok(shown && shown.plan.placements.length > 0, `zone ${zone.number} stands modules`);
    // Drawn from the kit of the climate the room dressed it in (content/passages/saltmere.json), not the island's.
    assert.equal(shown.climate, 'woodland', `zone ${zone.number}'s modules are the kit it was laid from`);
    // The sea's islands count from 1: a hollow is drawn by an id none of theirs can be.
    assert.ok(shown.id < 1, `zone ${zone.number}'s hollow is no sea island`);
    assert.equal(zoneLayout(plan), null);
  }
});

test('above ground, the body stands on the hollow’s heights where the room stands the pieces', () => {
  assert.ok(web);
  let checked = 0;
  for (const zone of web.zones.filter((each) => each.ground.kind === 'open')) {
    const plan = door.plan('continent-1', WEEK, zone.number);
    const heights = door.heights('continent-1', WEEK, zone.number);
    assert.ok(plan && heights);
    const floor = floorOf(plan, heights);
    assert.ok(Number.isFinite(floor(...plan.sites.arrive)), `zone ${zone.number} has ground at its arrival`);
    for (const piece of plan.pieces) {
      const under = floor(piece.at[0], piece.at[1]);
      assert.ok(under !== null && Math.abs(under - piece.at[2]) < 0.05, `zone ${zone.number}'s ${piece.kind}`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});
