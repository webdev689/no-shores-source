import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import { KINDS, WORN } from '../player/gear.ts';
import type { FighterView } from '../rules/fighters.ts';
import { findAll, onFakePage } from './page.test.ts';
import { type ArmsShown, SWAP_SECONDS, WeaponRows, weaponsOf, weaponWords } from './weapons.ts';

const item = (kind: string, slot: number, rarity = 0): GearItem => ({
  id: 10 + slot,
  kind: KINDS.indexOf(kind as (typeof KINDS)[number]),
  rarity,
  level: 1,
  named: null,
  name: 0,
  resource: null,
  breach: false,
  xp: 0,
  xpMost: 1,
  bought: 0,
  chosen: [],
  bucket: slot,
  at: WORN + slot,
  attack: 10,
  defense: 0,
  prestige: 0,
  columns: [],
  price: 0,
  element: 0,
});
const gear = (items: readonly GearItem[], ammo = 18, ammoMost = 24): GearState => ({
  xp: 0n,
  level: 1,
  prestige: 0,
  defense: 0,
  aurem: 0,
  stocks: [],
  resources: [],
  items,
  vestiges: [],
  drops: [],
  spent: [],
  atReader: false,
  answer: 0,
  answered: 0,
  identified: 0,
  nodes: [],
  wares: [],
  ammo,
  ammoMost,
});
const both = gear([item('sword', 0, 2), item('crossbow', 1)]);
const arms = (loadout: number, drawn = true, state: GearState | null = both): ArmsShown => ({
  gear: state,
  loadout,
  drawn,
  dress: null,
});
const own: FighterView = {
  x: 0,
  y: 0,
  z: 0,
  facing: 0,
  mode: 'ground',
  crouched: false,
  aim: 0,
  side: 'players',
  arms: 0,
  health: 100,
  healthMax: 100,
  stamina: 100,
  poise: 0,
  poiseMax: 40,
  target: null,
  action: { kind: 'idle' },
  ammo: 7,
};

test('the weapon in hand leads and the other loadout stands under it with the key that draws it', () => {
  const ranged = weaponsOf(arms(1), 7);
  assert.equal(ranged.hand?.slot, 1);
  assert.deepEqual([ranged.hand?.shots, ranged.hand?.most, ranged.hand?.key], ['7', 24, '2']);
  assert.deepEqual([ranged.next?.slot, ranged.next?.shots, ranged.next?.key], [0, null, '1']);
  const melee = weaponsOf(arms(0), 7);
  assert.deepEqual([melee.hand?.slot, melee.hand?.shots], [0, null], 'a Melee weapon shows its name, no count');
  assert.ok(melee.hand?.name);
  assert.deepEqual([melee.next?.slot, melee.next?.shots, melee.next?.key], [1, '7', '2'], 'its own shots, small');
});

test('the count is the fighter’s own, so a shot takes one at once; few read low, none says No ammo', () => {
  assert.equal(weaponsOf(arms(1), null).hand?.shots, '18', 'before the fighter counts, the gear’s word');
  assert.deepEqual([weaponsOf(arms(1), 4).hand?.low, weaponsOf(arms(1), 5).hand?.low], [true, false]);
  const empty = weaponsOf(arms(1), 0).hand;
  assert.deepEqual([empty?.shots, empty?.empty, empty?.most], ['No ammo', true, null]);
  assert.equal(weaponsOf(arms(1, true, gear([item('sword', 0)])), null).hand, null, 'no Ranged worn');
});

test('a row tells a screen reader what it holds, where, and its shots', () => {
  const { hand, next } = weaponsOf(arms(1), 7);
  assert.ok(hand && next);
  assert.equal(weaponWords(hand, true, true), `In hand: ${hand.name}, 7 of 24 shots`);
  assert.equal(weaponWords(hand, true, false), `Put away: ${hand.name}, 7 of 24 shots`);
  assert.equal(weaponWords(next, false, true), `Press 1 to draw: ${next.name}`);
  assert.equal(
    weaponWords({ ...hand, shots: 'No ammo', empty: true, most: null }, true, true),
    `In hand: ${hand.name}, no ammo`,
  );
});

test('a swap trades the rows for the swap’s time, a reload fills its line, and a weapon put away dims', () => {
  onFakePage((root) => {
    const rows = new WeaponRows(root, null);
    rows.update(arms(0), own, 1 / 60);
    assert.equal(rows.root.hidden, false);
    rows.update(arms(1), own, 1 / 60);
    assert.equal(rows.root.classList.contains('swapping'), true, 'swapping as 2 is pressed');
    rows.update(arms(1), own, SWAP_SECONDS);
    assert.equal(rows.root.classList.contains('swapping'), false, 'done in the swap’s 0.4 s');
    const reload = (left: number): FighterView => ({ ...own, action: { kind: 'reload', left } });
    rows.update(arms(1), reload(60), 1 / 60);
    rows.update(arms(1), reload(15), 1 / 60);
    const hand = findAll(root, 'weapon', 'hand')[0];
    assert.equal(hand?.classList.contains('reloading'), true);
    assert.equal(findAll(root, 'reload')[0]?.style['width'], '75%');
    rows.update(arms(1, false), own, 1 / 60);
    assert.deepEqual([rows.root.classList.contains('away'), hand?.classList.contains('reloading')], [true, false]);
    rows.update(arms(1, false, null), own, 1 / 60);
    assert.equal(rows.root.hidden, true, 'no gear, no rows');
  });
});
