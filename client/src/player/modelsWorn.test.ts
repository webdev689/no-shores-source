import assert from 'node:assert/strict';
import { test } from 'node:test';
import items from '../../../content/gear/items.json' with { type: 'json' };
import rolled from '../../../content/gear/rolled.json' with { type: 'json' };
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import female from '../../../tools/forge/tools/sprite-forge/fitted/female.json' with { type: 'json' };
import male from '../../../tools/forge/tools/sprite-forge/fitted/male.json' with { type: 'json' };
import type { Outfit } from '../forge/outfit.ts';
import type { GearItem } from '../network/gearMessages.ts';
import { item, state } from '../network/gearForTests.ts';
import { wardrobeOf } from './dressing.ts';
import { KINDS, MELEE, RANGED_SLOT, WORN, slotOf, writtenLook } from './gear.ts';
import { SOURCES } from './sourceLooks.ts';
import { gearOutfit } from './gearLooks.ts';

/** Every layer of a fitted body, by the moves it is drawn in, as the page loads a body's layers. */
function layersOfBody(fitted: object): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const [move, heads] of Object.entries(fitted))
    for (const names of Object.values(heads as Record<string, string[]>))
      for (const name of names) (found[name] ??= []).includes(move) || found[name].push(move);
  return found;
}
const BODIES = { male: layersOfBody(male), female: layersOfBody(female) };
const layers = BODIES.male;
let wardrobe = wardrobeOf('male', layers);

const plain: Outfit = { armour: {}, garments: [], dyes: {}, right: null, left: null, drawn: true, hair: null };
const RARITIES = ['normal', 'magic', 'rare'] as const;
/** A spread of item numbers, enough to turn every choice a number makes (up to three), and every level. */
const NUMBERS = Array.from({ length: 6 }, (unused, place) => place + 1);
const LEVELS = Array.from({ length: 20 }, (unused, place) => place + 1);

/** The forge's weapon and armour layers: the weapons a hand holds, and each armour piece in any set. */
const WEAPON_OR_ARMOUR =
  /^(sword|dagger|axe|mace|flail|warhammer|staff|bow|crossbow|shield|pistolet|thunderlock|helm|cuirass|pauldrons|gauntlets|greaves|boots)(_|$)/;

/** The weapon and armour layers no item wears, each with why. */
const LEFT_OUT: readonly { readonly layers: RegExp; readonly why: string }[] = [
  { layers: /^(sword|sword_l|axe|bow|staff|helm|cuirass|pauldrons|boots)$/, why: "a class's own, no item's" },
  { layers: /^helm_(dark|horned)$/, why: "a class outfit's helm, of no set: the archer's dark, the woman's horned" },
  { layers: /^boots_laced$/, why: 'a garment, not armour' },
];
/** Every weapon and armour item the game can hold: each named piece, and each rolled kind at each rarity a Vestige or
 *  a smith rolls it at, under each of its names, a spread of numbers and every level. */
function held() {
  const named = items.items.map((each) => ({
    kind: KINDS.indexOf(each.kind as never),
    named: each.id,
    id: 1,
    name: 0,
    level: 20,
    source: Math.max(
      SOURCES.findIndex((source) => 'source' in each && source.key === each.source),
      0,
    ),
  }));
  // A rolled piece is drawn in its content's looks, so it is rolled in every content.
  const rolls = Object.entries(rolled.names).flatMap(([kind, names]) =>
    RARITIES.flatMap((rarity, number) =>
      (names as Record<string, readonly string[]>)[rarity]!.flatMap((unused, name) =>
        NUMBERS.flatMap((id) =>
          LEVELS.flatMap((level) =>
            SOURCES.map((unused, source) => ({
              kind: KINDS.indexOf(kind as never),
              rarity: number,
              name,
              id,
              level,
              source,
            })),
          ),
        ),
      ),
    ),
  );
  const rarityOf = (id: string) =>
    ['normal', 'magic', 'rare', 'legendary', 'atheric'].indexOf(items.items.find((each) => each.id === id)!.rarity);
  return [
    ...named.filter((each) => each.kind > 0).map((each) => ({ ...each, rarity: rarityOf(each.named) })),
    ...rolls.filter((each) => each.kind > 0),
  ];
}

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
