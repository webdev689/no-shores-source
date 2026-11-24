import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { item } from '../network/gearForTests.ts';
import { HORSE, KINDS } from '../player/gear.ts';
import { startCombatRules } from '../rules/combatRules.ts';
import { LOADOUT, givenTraits, setItemRules, sheetOf, statsOf } from './itemStats.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const rules = startCombatRules(
  new WebAssembly.Module(
    await readFile(MODULE).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
);
setItemRules(rules);

const kind = (name: string) => KINDS.indexOf(name as (typeof KINDS)[number]);
const column = (kindOf: number, traits: readonly string[]) => ({
  kind: kindOf,
  traits,
  xp: 0,
  aurem: 0,
  fragments: 0,
  essence: 0,
  resource: 0,
});
/** A sword whose handling offers Light Grip and Heavy Head, the one at `chosen` bought and chosen, and an upgrade. */
const sword = (chosen: number, bought = 1 << chosen) =>
  item({
    kind: kind('sword'),
    rarity: 3,
    columns: [column(1, ['light_grip', 'heavy_head']), column(0, [])],
    bought,
    chosen: [chosen, 255],
  });

test("an item's numbers are the room's, moved by the traits it gives", () => {
  const plain = statsOf(kind('sword'), []);
  const light = statsOf(kind('sword'), ['light_grip']);
  assert.ok(plain && light);
  assert.equal(plain.loadout, LOADOUT.melee);
  assert.ok(Math.abs(light.stamina - plain.stamina * 0.85) < 1e-9, 'Light Grip: a swing costs 15% less');
  assert.equal(statsOf(kind('bow'), [])?.loadout, LOADOUT.ranged);
  assert.equal(statsOf(0, []), null, 'no kind is no item');
});

test('an item gives its intrinsic and each column’s chosen node, bought; a node tried takes its column’s place', () => {
  assert.deepEqual(givenTraits(sword(0)), ['light_grip']);
  assert.deepEqual(givenTraits(sword(255, 0)), [], 'nothing chosen gives nothing');
  assert.deepEqual(givenTraits({ ...sword(1), bought: 0 }), [], 'a choice not bought gives nothing');
  assert.deepEqual(givenTraits(sword(0), { column: 0, node: 1 }), ['heavy_head'], 'tried, bought or not');
  const gullwing = item({ named: 'gullwing', kind: kind('bow'), rarity: 4 });
  assert.deepEqual(givenTraits(gullwing), ['storm_gull'], 'an Atheric always gives its intrinsic');
});

test("a weapon's bars name what it does in a fight, a bow's with its ammunition, armour's what a body keeps", () => {
  const labels = (shown: ReturnType<typeof sheetOf>) => shown?.rows.map((row) => row.label);
  assert.deepEqual(labels(sheetOf(sword(0))), ['Impact', 'Speed', 'Reach', 'Poise', 'Swing cost']);
  const bow = sheetOf(item({ kind: kind('bow') }));
  assert.deepEqual(labels(bow), ['Impact', 'Aimed', 'Fire rate', 'Poise', 'Pace aiming']);
  assert.ok(bow?.notes.includes('Ammo 60'), JSON.stringify(bow?.notes));
  assert.ok(sheetOf(item({ kind: kind('thunderlock') }))?.notes.includes('Strikes at once'), 'a gun strikes at once');
  assert.deepEqual(labels(sheetOf(item({ kind: kind('head') }))), [
    'Stamina back',
    'Dodge cost',
    'Poise held',
    'Healing',
  ]);
  assert.ok(sheetOf(item({ kind: kind('sword_and_shield') }))?.notes.includes('Blocks with its shield'));
  assert.equal(sheetOf(item({ kind: HORSE })), null, 'a horse has no stats');
  assert.equal(sheetOf(item({ kind: 25 })), null, "a ship's hull is the ship's, not a body's");
  for (const row of sheetOf(item({ kind: kind('warhammer') }))?.rows ?? [])
    assert.ok(row.share > 0 && row.share <= 1, `${row.label} stands within its bar: ${row.share}`);
});

test('beside another, each bar says what changes, signed, a cost better as it falls', () => {
  const light = sheetOf(sword(0), statsOf(kind('sword'), []));
  const cost = light?.rows.find((row) => row.label === 'Swing cost');
  assert.ok(cost && cost.from !== null && cost.value < cost.from);
  assert.equal(cost.less, true);
  assert.match(cost.change, /^−\d/, 'it fell');
  assert.equal(light?.rows.find((row) => row.label === 'Speed')?.change, '', 'no change, no words');
  const heavy = sheetOf(sword(0), null, givenTraits(sword(0), { column: 0, node: 1 }));
  const plain = sheetOf(sword(0));
  assert.ok((heavy?.rows[0]?.value ?? 0) > (plain?.rows[0]?.value ?? 0), "Heavy Head's Impact, tried");
  const armour = sheetOf(item({ kind: kind('head') }), statsOf(kind('sword'), []));
  assert.ok(
    armour?.rows.every((row) => row.from === null),
    'a helm is never set beside a sword',
  );
});

test('without the rules, an item has no bars, and its card shows none', () => {
  setItemRules(null);
  try {
    assert.equal(sheetOf(sword(0)), null);
  } finally {
    setItemRules(rules);
  }
});
