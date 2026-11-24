import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COSMETICS } from '../forge/cosmetics.ts';
import { item, state } from '../network/gearForTests.ts';
import { ASKS } from '../network/gearMessages.ts';
import { plainDress } from '../player/dressing.ts';
import { HORSE, MOUNT_SLOT, WORN, coatOfHorse, dismantlable, itemName, slotOf, wearAsks } from '../player/gear.ts';
import { Walker, mountAsked } from '../player/walker.ts';
import type { Cards } from '../player/cards.ts';
import { IDLE } from '../player/input.ts';
import type { MovementRules } from '../rules/movementRules.ts';
import { SLOOP_DECK } from '../ships/deck.ts';
import { Aboard } from './aboard.ts';
import { appearanceRows, previewDress } from './appearance/appearanceModel.ts';
import { type Dressed, dressInGear } from './footFigures.ts';
import { cardOf } from './gearCards.ts';
import { sizesOf } from './gearNodes.ts';
import { itemDetailOf } from './gearScreen.ts';
import { detailsNode } from './playerDetails.ts';
import { rowsOf } from './npc/npcWares.ts';

const numberOf = (id: string) => COSMETICS.findIndex((each) => each.id === id);
const chestnut = item({ id: 7, kind: HORSE, name: 1, bucket: MOUNT_SLOT });

test('a horse is an item named for its coat, worn in the Mount slot', () => {
  assert.equal(itemName(chestnut), 'Chestnut Horse');
  assert.equal(slotOf(HORSE), MOUNT_SLOT);
  assert.equal(coatOfHorse(chestnut), 'chestnut');
  assert.equal(coatOfHorse(item({ kind: 2, name: 1 })), null, 'a sword has no coat');
  assert.deepEqual(
    wearAsks(chestnut).map((each) => each.ask),
    [{ kind: ASKS.wear, item: 7, slot: MOUNT_SLOT }],
  );
});

test("a horse's card names it and its kind, says its coat's words, and shows no level", () => {
  const card = cardOf(chestnut);
  assert.equal(card.name, 'Chestnut Horse');
  assert.equal(card.kind, 'Normal Horse');
  assert.deepEqual(card.rows, []);
  assert.equal(card.words, COSMETICS[numberOf('chestnut')]?.words);
});

test('the Tack sells horses as items to the pack, one of each coat, and bardings', () => {
  const sold = [numberOf('dun'), numberOf('dawnfire')];
  const [row] = rowsOf('tack', state({ aurem: 9_000, level: 20, cosmeticsSold: sold }));
  const [horse, barding] = row?.wares ?? [];
  assert.equal(horse?.name, 'Dun Horse');
  assert.equal(horse?.about, 'Normal Horse');
  assert.equal(horse?.picture.kind, 'item');
  assert.deepEqual(horse?.ask, { kind: ASKS.buyCosmetic, item: numberOf('dun') });
  assert.equal(horse?.price?.amount, COSMETICS[numberOf('dun')]?.source.aurem);
  assert.equal(barding?.name, 'Dawnfire');
  const dun = item({ id: 3, kind: HORSE, name: 2, bucket: MOUNT_SLOT });
  const [owned] = rowsOf('tack', state({ aurem: 9_000, level: 20, cosmeticsSold: sold, items: [dun] }));
  assert.equal(owned?.wares[0]?.note, 'Kept', 'a horse held is kept');
  assert.equal(owned?.wares[0]?.ask, null);
});

test('the Appearance screen keeps the emblem and the dye alone; a horse is worn in the Mount slot', () => {
  const rows = appearanceRows(state({}));
  assert.deepEqual(
    rows.map((row) => row.heading),
    ['Emblem', 'Dye'],
  );
  const dress = plainDress('human', 0.3);
  const dye = rows[1]?.tiles.find((tile) => tile.id === 'coral') ?? null;
  assert.equal(previewDress(dress, dye).outfit.dye, 'coral');
});

test('the mount key mounts only with a horse worn; without one it does nothing and is told once a press', () => {
  const pressed = { pressed: (action: string) => action === 'mount' };
  const none = mountAsked(pressed, false, false);
  assert.equal(none.refused, true);
  assert.equal(none.controls.pressed('mount'), false, 'the press is dropped');
  const horse = mountAsked(pressed, false, true);
  assert.equal(horse.refused, false);
  assert.equal(horse.controls.pressed('mount'), true);
  assert.equal(mountAsked(pressed, true, false).refused, false, 'a rider gets down whatever is worn');
  assert.equal(mountAsked({ pressed: () => false }, false, false).refused, false, 'no press, no word');
  assert.equal(WORN + MOUNT_SLOT, 13, 'worn in the Mount slot on the wire');
});

test('the gear says whether a horse is worn; one taken off under its rider sets them on foot', () => {
  const walker = Object.assign(Object.create(Walker.prototype) as Walker, {
    player: { mounted: true },
    you: { dress: plainDress('human', 0.3) },
  });
  const forge = { wardrobe: () => null } as unknown as Cards;
  const horse = item({ id: 7, kind: HORSE, name: 1, bucket: MOUNT_SLOT, at: WORN + MOUNT_SLOT });
  dressInGear(walker, forge, state({ items: [horse] }), { gear: null, loadout: 0 });
  assert.deepEqual([walker.rides, walker.player.mounted], [true, true]);
  dressInGear(walker, forge, state({ items: [] }), { gear: null, loadout: 0 });
  assert.deepEqual([walker.rides, walker.player.mounted], [false, false]);
});

test('a walker rides only once the gear says a horse is worn; one taken off under its rider sets them on foot', () => {
  const walker = Object.create(Walker.prototype) as Walker;
  walker.player = { mounted: true } as Walker['player'];
  walker.ridesIn(state({ items: [item({ kind: HORSE, bucket: MOUNT_SLOT, at: WORN + MOUNT_SLOT })] }));
  assert.deepEqual([walker.rides, walker.player.mounted], [true, true]);
  walker.ridesIn(state({ items: [] }));
  assert.deepEqual([walker.rides, walker.player.mounted], [false, false]);
  walker.noHorse = true;
  assert.equal(walker.takeNoHorse(), true, 'a refused press is said once');
  assert.equal(walker.takeNoHorse(), false);
});

test('a walker with no word from a room yet does not ride', () => {
  const fresh = new Walker(
    { mounted: false } as Walker['player'],
    { dress: plainDress('human', 0.3) } as unknown as ConstructorParameters<typeof Walker>[1],
    { strokes: () => 0 } as unknown as ConstructorParameters<typeof Walker>[2],
    {} as Cards,
  );
  assert.equal(fresh.rides, false);
});

test('a horse is never offered to dismantle: not on its page, its vault cell or its flyout', () => {
  const carried = item({ id: 9, kind: HORSE, name: 1, bucket: MOUNT_SLOT, at: 0 });
  const labels = itemDetailOf(carried, state({ items: [carried] }), true).presses.map((press) => press.label);
  assert.ok(!labels.includes('Hold to dismantle'), labels.join(', '));
  assert.ok(labels.includes('Put in the vault'));
  assert.equal(dismantlable(carried), false);
  assert.equal(dismantlable(item({ id: 2, kind: 2, at: 0 })), true);
  assert.equal(dismantlable(item({ id: 3, kind: 2, at: WORN })), false, 'worn, it is not dismantled');
});

test("another player's details name a worn horse's slot and give it no power line", () => {
  const ui = { hovered: () => false, focused: () => false, keyFocused: false, clicked: () => false };
  const horse = { named: null, kind: HORSE, rarity: 0, name: 1, slot: MOUNT_SLOT, element: 0, attack: 0, defense: 0 };
  const found = {
    name: 'Bo',
    level: 3,
    emblem: null,
    shown: { level: 3, attack: 0, defense: 0, emblem: '', worn: [horse] },
  };
  const node = detailsNode(
    { ui: ui as never, room: { width: 900, height: 700 }, sizes: sizesOf(1280, 720, 1) },
    found as never,
    () => {},
  );
  const said = wordsOf(node);
  assert.ok(said.includes('MOUNT'), said.join(' | '));
  assert.ok(said.includes('Chestnut Horse'));
  assert.ok(said.includes('Normal'), 'its rarity alone');
  assert.ok(!said.some((each) => each.includes('Defense') && each.includes('Normal')), 'no power line');
});

/** Every word a tree shows, in order. */
function wordsOf(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const { text, children } = node as { text?: { words: unknown }; children?: unknown[] };
  const own = text && typeof text.words === 'string' ? [text.words] : [];
  return [...own, ...(children ?? []).flatMap(wordsOf)];
}

test('the Tack shows the Bay Horse first, at the cheapest horse price, from level 1', () => {
  const [row] = rowsOf('tack', state({ aurem: 2_000, level: 1, cosmeticsSold: [numberOf('bay'), numberOf('grey')] }));
  const [bay] = row?.wares ?? [];
  assert.equal(bay?.name, 'Bay Horse');
  assert.deepEqual(bay?.price, { amount: 1500, currency: 'aurem' });
  assert.deepEqual(bay?.ask, { kind: ASKS.buyCosmetic, item: numberOf('bay') });
});

test('at sea the horse worn is read from the gear the sea sends, on deck as ashore', () => {
  const walker = Object.create(Walker.prototype) as Walker;
  walker.player = { mounted: false } as Walker['player'];
  walker.rides = false;
  const horse = item({ kind: HORSE, bucket: MOUNT_SLOT, at: WORN + MOUNT_SLOT });
  const room = { gearSent: state({ items: [horse] }), onDeck: null, words: 0, walk: () => undefined };
  const helm = { ...room, leaveHelm: () => undefined, takeHelm: () => undefined };
  const aboard = new Aboard({ movement: {} as MovementRules, walker, forge: {} as Cards }, SLOOP_DECK);
  aboard.step(1 / 60, 0, IDLE, false, helm);
  assert.equal(walker.rides, true, 'a horse worn');
  aboard.step(1 / 60, 0, IDLE, false, { ...helm, gearSent: state({ items: [] }) });
  assert.equal(walker.rides, false, 'and none once it is taken off');
});

test("bearing the Lodestone the player's figure holds no weapon, as the room has its bearer", () => {
  const walker = Object.assign(Object.create(Walker.prototype) as Walker, {
    player: { mounted: false, loadout: 0 },
    you: { dress: { ...plainDress('human', 0.3), outfit: { ...plainDress('human', 0.3).outfit, right: 'sword' } } },
  });
  const forge = { wardrobe: () => null } as unknown as Cards;
  const dressed: Dressed = { gear: null, loadout: 0 };
  const gear = state({ items: [] });
  dressInGear(walker, forge, gear, dressed, true);
  assert.deepEqual([walker.you.dress.outfit.right, walker.you.dress.outfit.left], [null, null]);
  assert.equal(dressed.bare, true, 'dressed again once the stone is set down');
});
