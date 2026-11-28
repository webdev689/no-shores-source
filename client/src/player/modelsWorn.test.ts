import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import items from '../../../content/gear/items.json' with { type: 'json' };
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import type { Outfit } from '../forge/outfit.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { item, state } from '../network/gearForTests.ts';
import { wardrobeOf } from './dressing.ts';
import { KINDS, MELEE, RANGED_SLOT, WORN, slotOf, writtenLook } from './gear.ts';
import { SOURCES } from './sourceLooks.ts';
import { gearOutfit } from './gearLooks.ts';
import { BODIES, held } from './heldForTests.ts';

const layers = BODIES.male;
let wardrobe = wardrobeOf('male', layers);

const plain: Outfit = { armour: {}, garments: [], dyes: {}, right: null, left: null, drawn: true, hair: null };

/** The forge's weapon and armour layers: the weapons a hand holds, and each armour piece in any set. */
const WEAPON_OR_ARMOUR =
  /^(sword|dagger|axe|mace|flail|warhammer|staff|bow|crossbow|shield|pistolet|thunderlock|helm|cuirass|pauldrons|gauntlets|greaves|boots)(_|$)/;

/** The weapon and armour layers no item wears, each with why. */
const LEFT_OUT: readonly { readonly layers: RegExp; readonly why: string }[] = [
  { layers: /^(sword|sword_l|axe|bow|staff|helm|cuirass|pauldrons|boots)$/, why: "a class's own, no item's" },
  { layers: /^helm_(dark|horned)$/, why: "a class outfit's helm, of no set: the archer's dark, the woman's horned" },
  { layers: /^boots_laced$/, why: 'a garment, not armour' },
];

/** The weapon and armour layers an item is drawn with, worn alone in its own slot with its loadout drawn. */
function layersOf(fields: Partial<GearItem> & { readonly kind: number }): string[] {
  const slot = slotOf(fields.kind);
  const outfit = gearOutfit(
    state({ items: [item({ ...fields, at: WORN + slot })] }),
    wardrobe,
    plain,
    slot === RANGED_SLOT ? RANGED_SLOT : MELEE,
  );
  const armour = Object.entries(outfit.armour).map(([piece, set]) => `${piece}_${set}`);
  return [...armour, ...[outfit.right, outfit.left].filter((hand) => hand !== null)];
}

test('every weapon and armour layer the forge draws is worn by some item the game can hold, on either body', () => {
  for (const [body, drawn] of Object.entries(BODIES)) {
    wardrobe = wardrobeOf(body, drawn);
    const worn = new Set(held().flatMap(layersOf));
    const forge = Object.keys(drawn).filter((layer) => WEAPON_OR_ARMOUR.test(layer));
    const unworn = forge.filter((layer) => !worn.has(layer) && !LEFT_OUT.some((left) => left.layers.test(layer)));
    assert.deepEqual(unworn.sort(), [], `layers no item wears on the ${body} body`);
  }
  wardrobe = wardrobeOf('male', layers);
});

test("a faction's armour and weapons wear its own set and metal", () => {
  for (const each of items.items) {
    const faction = factions.factions.find((one) => 'faction' in each && one.key === each.faction);
    const kind = KINDS.indexOf(each.kind as never);
    if (!faction || each.kind === 'cloak') continue;
    const worn = layersOf({ kind, named: each.id, rarity: 3 });
    const own = slotOf(kind) <= RANGED_SLOT ? faction.gear.metal : faction.gear.armour;
    assert.ok(worn.length > 0 && worn.every((layer) => layer.includes(own)), `${each.id}: ${worn.join(', ')}, ${own}`);
  }
});

test('each named piece wears its own look and make, its shield too', () => {
  for (const each of items.items) {
    const kind = KINDS.indexOf(each.kind as never);
    const { look, make } = writtenLook(item({ named: each.id })) ?? {};
    if (kind <= 0 || !look) continue;
    const worn = layersOf({ kind, named: each.id, rarity: 3 });
    assert.ok(worn.length > 0, `${each.id} is drawn`);
    for (const layer of worn) {
      const shield = layer.startsWith('shield_');
      // A Sword & Shield's make is its shield's kind; any other's is its weapon's.
      const own = make && (shield || !worn.some((other) => other.startsWith('shield_')));
      assert.ok(look === 'plain' ? !layer.includes('gilded') : layer.includes(look), `${each.id}: ${layer}, ${look}`);
      if (own) assert.ok(layer.includes(make), `${each.id}: ${layer}, ${make}`);
    }
  }
});

const ROOM = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
const room = new WebAssembly.Instance(
  new WebAssembly.Module(
    await readFile(ROOM).catch(() => {
      throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
    }),
  ),
  {},
).exports as unknown as {
  readonly memory: WebAssembly.Memory;
  reserve(length: number): number;
  release(address: number, length: number): void;
  room_dressed(address: number, length: number): bigint;
};
/** A dress for a figure wearing `worn`, as the room lets others see it (`gear::cosmetics::dressed`). */
function dressedByRoom(dress: string, worn: object): string {
  const bytes = new TextEncoder().encode(JSON.stringify({ dress, worn: [worn] }));
  const lent = room.reserve(bytes.length);
  new Uint8Array(room.memory.buffer, lent, bytes.length).set(bytes);
  const packed = room.room_dressed(lent, bytes.length);
  room.release(lent, bytes.length);
  const [address, length] = [Number(packed >> 32n), Number(packed & 0xffff_ffffn)];
  const answer = new TextDecoder().decode(new Uint8Array(room.memory.buffer, address, length));
  room.release(address, length);
  return answer;
}
const RARITY_KEYS = ['normal', 'magic', 'rare', 'legendary', 'atheric'];

test('the room keeps every armour and weapon layer the page dresses any item in, on either body', () => {
  const refused: string[] = [];
  for (const [body, drawn] of Object.entries(BODIES)) {
    wardrobe = wardrobeOf(body, drawn);
    const asked = new Set<string>();
    for (const fields of held()) {
      const slot = slotOf(fields.kind);
      const loadout = slot === RANGED_SLOT ? RANGED_SLOT : MELEE;
      const { armour, right, left } = gearOutfit(
        state({ items: [item({ ...fields, at: WORN + slot })] }),
        wardrobe,
        plain,
        loadout,
      );
      const worn = {
        kind: KINDS[fields.kind],
        rarity: RARITY_KEYS[fields.rarity],
        source: SOURCES[fields.source]!.key,
        level: fields.level,
        name: fields.name,
        named: 'named' in fields ? fields.named : null,
        story: 'story' in fields && fields.story,
      };
      const shown = { armour, right, left };
      const key = JSON.stringify([worn, shown]);
      if (asked.has(key)) continue;
      asked.add(key);
      const kept = JSON.parse(dressedByRoom(JSON.stringify({ body, outfit: shown }), worn)).outfit;
      // The room writes the armour's pieces in its own order.
      const same = (armour: object) => JSON.stringify(Object.entries(armour).sort());
      if (same(kept.armour) !== same(armour) || kept.right !== right || kept.left !== left)
        refused.push(`${body} ${key} kept as ${JSON.stringify(kept)}`);
    }
  }
  wardrobe = wardrobeOf('male', layers);
  assert.deepEqual(refused.slice(0, 10), [], `${refused.length} dresses the room refuses`);
});
