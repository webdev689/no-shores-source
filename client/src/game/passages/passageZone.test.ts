import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { startPassageDoor } from '../../rules/passageRules.ts';
import { groundLook } from '../../islands/isleGround.ts';
import { MODULE_NAMES, roleOf } from '../../islands/isleModules.ts';
import { groundHeight } from '../../islands/isleGround.ts';
import { gridOf } from '../../islands/islePlan.ts';
import { hollowGround } from './hollowLook.ts';
import { UNTOUCHED } from './passagePieces.ts';
import { floorOf, UNDER_FLOOR_M, withPieces, zoneIsle, zoneLayout } from './passageZone.ts';

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
    const shown = zoneIsle(plan, heights, 'woodland');
    assert.ok(shown && shown.plan.placements.length > 0, `zone ${zone.number} stands modules`);
    // The sea's islands count from 1: a hollow is drawn toY an id none of theirs can be.
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

test('above ground the lamp’s lantern stands cold until it is lit, and the way in never glows', () => {
  const lamped = web?.zones.find((zone) => zone.ground.kind === 'open' && zone.lamp !== null);
  const plan = lamped && door.plan('continent-1', WEEK, lamped.number);
  const heights = lamped && door.heights('continent-1', WEEK, lamped.number);
  const shown = plan && heights && zoneIsle(plan, heights, 'woodland');
  assert.ok(plan && shown, 'week 2900 has a lamp above ground');
  const lamp = MODULE_NAMES.indexOf('passage.lamp');
  const coldOf = (lampLit: boolean) =>
    withPieces(shown, plan, { ...UNTOUCHED, lampLit }, false).plan.placements.find(([module]) => module === lamp)?.[7];
  assert.equal(coldOf(false), 1);
  assert.equal(coldOf(true), 0);
});

test('a hollow’s floor is its form’s ground, and a name that says a ground its own: no two forms alike', () => {
  const climate = 'temperate-coast';
  const forms = ['hollow', 'ravine', 'shelves', 'court', 'strand', 'grove'];
  const looks = forms.map((form) => JSON.stringify(hollowGround(form, '', climate)));
  assert.equal(new Set(looks).size, forms.length);
  assert.deepEqual(hollowGround('hollow', 'A grassy hollow', climate), groundLook(climate), 'grass is the land’s own');
  assert.notDeepEqual(
    hollowGround('hollow', 'A chalk hollow', climate),
    hollowGround('hollow', 'A grassy hollow', climate),
  );
  assert.notDeepEqual(hollowGround('strand', 'A shell bed', climate), hollowGround('strand', 'A dry strand', climate));
  assert.equal(hollowGround('court', 'A ruined court', climate).paved, true, 'a court is flagged');
  for (const zone of web?.zones ?? []) {
    const plan = zone.ground.kind === 'open' ? door.plan('continent-1', WEEK, zone.number) : null;
    const heights = plan && door.heights('continent-1', WEEK, zone.number);
    if (!plan || !heights || zone.ground.kind !== 'open') continue;
    assert.deepEqual(zoneIsle(plan, heights, climate)?.ground, hollowGround(zone.ground.form, zone.name, climate));
  }
});

test('a hollow’s floor grows the kit’s grass and shrubs, which stand nothing solid: inside its ring, clear of the way', () => {
  const grown = new Map<string, number>();
  for (const zone of web?.zones ?? []) {
    const plan = zone.ground.kind === 'open' ? door.plan('continent-1', WEEK, zone.number) : null;
    const heights = plan && door.heights('continent-1', WEEK, zone.number);
    if (!plan || !heights || plan.ground.kind !== 'open' || zone.ground.kind !== 'open') continue;
    const shown = zoneIsle(plan, heights, 'temperate-coast');
    const laid = plan.ground.placements.length;
    const added = shown?.plan.placements.slice(laid) ?? [];
    assert.ok(added.length > 0, `zone ${zone.number} grows a meadow`);
    const grid = gridOf(heights);
    for (const [module, x, y, z] of added) {
      assert.ok(['grass', 'shrub'].includes(roleOf(module) ?? ''), 'only what stands nothing solid');
      assert.ok(Math.hypot(x - plan.sites.arrive[0], y - plan.sites.arrive[1]) >= 3, 'clear of the arrival');
      for (const piece of plan.pieces) assert.ok(Math.hypot(x - piece.at[0], y - piece.at[1]) >= 2);
      assert.ok(Math.abs(z - (groundHeight(grid, x, y) ?? Number.NaN)) < 1e-6, 'on the floor');
      const ring = plan.ground.ring;
      const crossings = ring.filter(([fromX, fromY], index) => {
        const [toX, toY] = ring[(index + 1) % ring.length] ?? [fromX, fromY];
        return fromY > y !== toY > y && x < fromX + ((y - fromY) * (toX - fromX)) / (toY - fromY);
      }).length;
      assert.equal(crossings % 2, 1, 'inside the ring');
    }
    assert.deepEqual(
      zoneIsle(plan, heights, 'temperate-coast')?.plan.placements.slice(laid),
      added,
      'the same each time',
    );
    const across = Math.max(...plan.ground.ring.map(([x, y]) => Math.hypot(x, y)));
    grown.set(zone.ground.form, Math.max(grown.get(zone.ground.form) ?? 0, added.length / (across * across)));
  }
  assert.ok((grown.get('grove') ?? 0) > (grown.get('strand') ?? Infinity), 'a grove grows thicker than a strand');
});
