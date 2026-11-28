import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import { KINDS, WORN } from '../player/gear.ts';
import type { FighterView } from '../rules/fighters.ts';
import { TONES } from '../plus/tones.ts';
import type { Child } from '../ui/node.ts';
import { allOf, wordsIn } from './nodes.test.ts';
import type { Dress } from '../player/dressing.ts';
import type { ItemPictures } from '../player/itemPictures.ts';
import type { Picture } from '../player/picture.ts';
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
  hard: false,
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
  source: 0,
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
  atMage: false,
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

test("each row's key is the one bound now: another key, or the pad's button", () => {
  const { hand, next } = weaponsOf(arms(1), 7, ['3', 'pad:Right']);
  assert.deepEqual([hand?.key, next?.key], ['pad:Right', '3']);
  assert.ok(next);
  assert.equal(weaponWords(next, false, true), `Press 3 to draw: ${next.name}`);
  assert.equal(weaponWords({ ...next, key: 'pad:Left' }, false, true), `Press Left to draw: ${next.name}`);
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
  const rows = new WeaponRows(null);
  rows.update(arms(0), own, 1 / 60);
  assert.ok(rows.node());
  rows.update(arms(1), own, 1 / 60);
  assert.equal(rows.shown.swapping, true, 'swapping as 2 is pressed');
  const [hand] = rows.node()?.children ?? [];
  assert.ok(hand && (hand.opacity ?? 1) < 1 && (hand.offset?.[1] ?? 0) > 0, 'the hand’s row coming up from below');
  rows.update(arms(1), own, SWAP_SECONDS);
  assert.equal(rows.shown.swapping, false, 'done in the swap’s 0.4 s');
  const reload = (left: number): FighterView => ({ ...own, action: { kind: 'reload', left } });
  rows.update(arms(1), reload(60), 1 / 60);
  rows.update(arms(1), reload(15), 1 / 60);
  assert.equal(rows.shown.reload, 0.75);
  assert.ok(
    allOf(rows.node()).some((node) => node.width === '75%'),
    'its line three quarters filled',
  );
  rows.update(arms(1, false), own, 1 / 60);
  assert.deepEqual([rows.shown.away, rows.shown.reload], [true, null]);
  assert.ok(
    allOf(rows.node()).some((node) => node.opacity === 0.6),
    'dimmed',
  );
  rows.update(arms(1, false, null), own, 1 / 60);
  assert.equal(rows.node(), null, 'no gear, no rows');
});

/** The forge's pictures, as `drawn` says: one weapon's picture, or none (still drawing, or never, as a 404 leaves
 *  it). */
const forge = (drawn: () => Picture | null): ItemPictures => ({ pictureOf: drawn }) as unknown as ItemPictures;
const blade: Picture = { width: 2, height: 2, pixels: new Uint8ClampedArray(16).fill(255) };
const pictured = (rows: WeaponRows) => allOf(rows.node()).filter((node) => node.picture?.key.startsWith('weapon'));

test('a weapon’s picture is laid to its box in whole pixels, as the screen’s ratio takes them', () => {
  const rows = new WeaponRows(forge(() => blade));
  rows.update({ ...arms(0), dress: {} as Dress }, own, 1 / 60);
  const [picture] = pictured(rows);
  assert.ok(picture, 'drawn');
  assert.ok((picture.height as number) <= 36 && (picture.width as number) <= 116, 'within the hand’s box');
  assert.equal(picture.width, picture.height, 'a square blade stays square');
});

test('a weapon whose picture never comes still says its name; one pictured lets the picture say it', () => {
  let drawn: Picture | null = null;
  const rows = new WeaponRows(forge(() => drawn));
  const dressed = { ...arms(1), dress: {} as Dress };
  rows.update(dressed, own, 1 / 60);
  const name = weaponsOf(dressed, own.ammo ?? null).hand?.name ?? '';
  assert.deepEqual(
    [pictured(rows).length, wordsIn(rows.node()).includes(name)],
    [0, true],
    'no picture: the name shows',
  );
  drawn = blade;
  rows.update(dressed, own, 1 / 60);
  assert.deepEqual(
    [pictured(rows).length, wordsIn(rows.node()).includes(name)],
    [2, false],
    'the picture, late, takes its place',
  );
});

test('a weapon with an element shows its glyph in its picture’s corner and says it; one with none shows none', () => {
  const rows = new WeaponRows(forge(() => blade));
  const volt = gear([{ ...item('sword', 0, 2), element: 2 }, item('crossbow', 1)]);
  rows.update({ ...arms(0, true, volt), dress: {} as Dress }, own, 1 / 60);
  const [hand, next] = rows.node()?.children ?? [];
  const glyphs = (row: Child) => allOf(row).filter((node) => node.picture?.key.startsWith('element'));
  assert.deepEqual(
    glyphs(hand).map((node) => [node.picture?.key, node.picture?.tint ?? null, node.width]),
    [
      ['element 2 1', TONES.outline, 16],
      ['element 2 1', null, 16],
    ],
    'Volt’s glyph in the hand’s picture, 16 px, over its hard shadow',
  );
  assert.match(hand ? (hand.label ?? '') : '', /, Volt$/);
  assert.deepEqual(glyphs(next), [], 'no element, no glyph');
});

test('a swap pressed during a swap trades the rows again from the start', () => {
  const rows = new WeaponRows(null);
  rows.update(arms(0), own, 1 / 60);
  rows.update(arms(1), own, 1 / 60);
  assert.equal(rows.shown.swapping, true);
  rows.update(arms(1), own, SWAP_SECONDS / 2);
  rows.update(arms(0), own, 1 / 60);
  rows.update(arms(0), own, SWAP_SECONDS / 2);
  assert.equal(rows.shown.swapping, true, 'the second runs its whole time, not what the first had left');
  rows.update(arms(0), own, SWAP_SECONDS / 2);
  assert.equal(rows.shown.swapping, false);
});

test('a magazine run dry reads as a large 0 in the loss colour, with No ammo said small beside it', () => {
  const rows = new WeaponRows(null);
  rows.update(arms(1), { ...own, ammo: 0 }, 1 / 60);
  const [hand] = rows.node()?.children ?? [];
  assert.ok(hand);
  const counted = allOf(hand).filter((node) => node.text && ['0', 'No ammo'].includes(String(node.text.words)));
  assert.deepEqual(
    counted.map((node) => [node.text?.words, node.text?.size, node.text?.colour]),
    [
      ['0', 3, '#e8968a'],
      ['No ammo', 1, '#e8968a'],
    ],
  );
  assert.equal(hand.label?.endsWith('no ammo'), true, 'a screen reader is still told it has none');
});

test('a loadout pressed while the fighter is busy waits, as the rules do, until they rest to take it up', () => {
  const rows = new WeaponRows(null);
  const busy: FighterView = { ...own, action: { kind: 'guard', elapsed: 4, window: 0 } };
  rows.update(arms(0), own, 1 / 60);
  rows.update(arms(1), busy, 1 / 60);
  assert.deepEqual([rows.shown.inHand, rows.shown.swapping], [0, false], 'the hands still hold it');
  rows.update(arms(1, false), busy, 1 / 60);
  assert.equal(rows.shown.away, false, 'nor is it put away mid-guard');
  rows.update(arms(1), own, 1 / 60);
  assert.deepEqual([rows.shown.inHand, rows.shown.swapping], [1, true], 'taken up at rest');
});
