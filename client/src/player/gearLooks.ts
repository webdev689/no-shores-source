// What the player's worn gear looks like on their figure: every garment is armour, so a Normal or Magic piece is drawn
// as clothes and a Rare or finer one as an armour set, the finer the rarer; the cloak is a cloak, a faction's cape the
// formal cloak in its faction's dye; a faction's armour and weapons are its own set and metal in its own colour; the
// hands hold what the gear wears; the dye, coat and barding worn ride along. Each item keeps its look by its own name.

import factions from '../../../content/gear/factions.json' with { type: 'json' };
import items from '../../../content/gear/items.json' with { type: 'json' };
import { wornCosmetic } from '../forge/cosmetics.ts';
import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { ArmourPiece, Outfit } from '../forge/outfit.ts';
import type { Cards } from './cards.ts';
import type { Wardrobe } from './dressing.ts';
import { MELEE, RANGED_SLOT, gearHands, heldElements, worn } from './gear.ts';
import type { Walker } from './walker.ts';

const [HEAD, TORSO, ARMS, LEGS, CLOAK] = [2, 3, 4, 5, 6];
const RARE = 2;
const MAGIC = 1;

/** The sets a rarity's armour is drawn in, best liked first; a set the forge does not draw is passed over. */
const SETS: Readonly<Record<number, readonly string[]>> = {
  2: ['chain', 'steel', 'iron', 'leather'],
  3: ['silver', 'elven', 'dwarven', 'knights', 'steel'],
  4: ['daedric', 'ebony', 'adamantium', 'mithril', 'knights'],
};
/** Each armour slot's pieces of a set. */
const PIECES: Readonly<Record<number, readonly ArmourPiece[]>> = {
  [HEAD]: ['helm'],
  [TORSO]: ['cuirass', 'pauldrons'],
  [ARMS]: ['gauntlets'],
  [LEGS]: ['greaves', 'boots'],
};
/** Each slot's clothes, by rarity: the garments worn, each a choice among those the forge draws for the body. */
const CLOTHES: Readonly<Record<number, readonly (readonly (readonly string[])[])[]>> = {
  [TORSO]: [
    [['shirt_long_v', 'shirt_long_round', 'shirt_long_deep', 'peasant_blouse', 'shirt_short_round']],
    [
      ['shirt_long_round', 'shirt_long_v', 'peasant_blouse'],
      ['short_tunic', 'formal_tunic', 'vest'],
    ],
  ],
  [LEGS]: [
    [
      ['breeches', 'casual_pants', 'long_skirt', 'tights'],
      ['shoes', 'sandals'],
    ],
    [
      ['breeches', 'casual_pants', 'tights'],
      ['tall_boots', 'shoes'],
    ],
  ],
};
/** A Magic head or arms piece is leather; a Normal one shows nothing over the figure. */
const MAGIC_SET = 'leather';
/** The dyes a rarity's clothes and cloak take, one by each item's name. */
const DYES: Readonly<Record<number, readonly string[]>> = {
  0: ['White', 'LightBrown', 'DarkBrown', 'Grey'],
  1: ['Blue', 'Aquamarine', 'Green', 'Purple'],
  2: ['Yellow', 'DarkBrown'],
  3: ['Red', 'Yellow'],
  4: ['Aquamarine', 'Blue'],
};

/** Each faction's cape, by its item's id, and the dye of its faction it is drawn in. */
const CAPE_DYES: ReadonlyMap<string, string> = new Map(factions.factions.map((each) => [each.cape, each.dye]));
/** Each faction's armour and weapons, by the item's id: its faction's key, and the set and metal they are drawn in. */
const FACTION_LOOKS: ReadonlyMap<string, { readonly key: string; readonly armour: string; readonly metal: string }> =
  new Map(
    items.items.flatMap((item) => {
      const faction = factions.factions.find((each) => 'faction' in item && each.key === item.faction);
      return faction && item.kind !== 'cloak' ? [[item.id, { key: faction.key, ...faction.gear }] as const] : [];
    }),
  );
const factionLook = (item: GearItem | undefined) => FACTION_LOOKS.get(item?.named ?? '');

const pick = <T>(choices: readonly T[], item: GearItem): T | undefined => choices[item.name % choices.length];

/** The set an armour piece of this item is drawn in, among those the forge draws for every piece of its slot: a
 *  faction's piece its faction's set first. */
function setOf(item: GearItem, slot: number, wardrobe: Wardrobe): string | null {
  const pieces = PIECES[slot] ?? [];
  const drawn = (set: string) => pieces.every((piece) => wardrobe.sets[piece].includes(set));
  const own = factionLook(item)?.armour;
  if (own && drawn(own)) return own;
  const sets = item.rarity >= RARE ? (SETS[item.rarity] ?? []).filter(drawn) : drawn(MAGIC_SET) ? [MAGIC_SET] : [];
  // A named item is one look; a rolled one takes its own among its rarity's best.
  return (item.named ? sets[0] : pick(sets.slice(0, 2), item)) ?? null;
}

/** The outfit the gear worn makes of `outfit`: its armour and garments the gear's, and its hands the drawn loadout's
 *  (`loadout`, Melee or Ranged); its hair kept. */
export function gearOutfit(state: GearState, wardrobe: Wardrobe, outfit: Outfit, loadout = MELEE): Outfit {
  const armour: Partial<Record<ArmourPiece, string>> = {};
  const garments: string[] = [];
  const dyes: Record<string, string> = {};
  const wear = (garment: string | undefined, item: GearItem) => {
    if (!garment || garments.includes(garment)) return;
    garments.push(garment);
    const dye = pick(DYES[item.rarity] ?? [], item);
    if (dye) dyes[garment] = dye;
  };
  for (const slot of [TORSO, LEGS, HEAD, ARMS]) {
    const item = worn(state, slot);
    if (!item) continue;
    const leather = item.rarity === MAGIC && (slot === HEAD || slot === ARMS);
    const set = item.rarity >= RARE || leather ? setOf(item, slot, wardrobe) : null;
    if (set) {
      const own = factionLook(item)?.key;
      for (const piece of PIECES[slot] ?? []) {
        armour[piece] = set;
        // A faction's piece wears its own colour, which the outfit keeps by the layer's name.
        if (own) dyes[`${piece}_${set}`] = own;
      }
      // So does the padding the forge draws under a cuirass or greaves with nothing on the chest.
      if (own && (slot === TORSO || slot === LEGS)) dyes[`under_${set}`] = own;
      continue;
    }
    const clothes = CLOTHES[slot]?.[Math.min(item.rarity, MAGIC)] ?? [];
    for (const choices of clothes)
      wear(
        pick(
          choices.filter((each) => wardrobe.garments.includes(each)),
          item,
        ),
        item,
      );
  }
  const cloak = worn(state, CLOAK);
  const cape = CAPE_DYES.get(cloak?.named ?? '');
  if (cloak) wear(cloak.rarity >= RARE || cape ? 'formal_cloak' : 'casual_cloak', cloak);
  if (cape) dyes['formal_cloak'] = cape;
  const weapon = factionLook(worn(state, loadout));
  const hands = gearHands(state, wardrobe, loadout, weapon?.metal);
  if (weapon) for (const layer of [hands.right, hands.left]) if (layer) dyes[layer] = weapon.key;
  return {
    ...outfit,
    armour,
    garments: garments.filter((each) => wardrobe.garments.includes(each)),
    dyes,
    ...hands,
    dye: wornCosmetic(state.worn?.dye, 'dye'),
    coat: wornCosmetic(state.worn?.coat, 'coat'),
    barding: wornCosmetic(state.worn?.barding, 'barding'),
  };
}

/** The outfit of `gearOutfit` with the other loadout than `loadout` in its hands, or null with no weapon worn there. */
export function spareOutfit(state: GearState, wardrobe: Wardrobe, outfit: Outfit, loadout = MELEE): Outfit | null {
  const spare = gearOutfit(state, wardrobe, outfit, otherLoadout(loadout));
  return spare.right ? spare : null;
}

/** The loadout a swap from `loadout` takes up. */
export const otherLoadout = (loadout: number): number => (loadout === MELEE ? RANGED_SLOT : MELEE);

/** Dresses the walker's figure in `gear` as worn, its hands the loadout drawn and its spare the other, and its weapons
 *  glowing in their element. */
export function dressInGear(walker: Walker, forge: Cards, gear: GearState): void {
  const { loadout } = walker.player;
  const wardrobe = forge.wardrobe(walker.you.dress.body);
  if (wardrobe) {
    const outfit = gearOutfit(gear, wardrobe, walker.you.dress.outfit, loadout);
    walker.you.dress = { ...walker.you.dress, outfit };
    walker.spare = spareOutfit(gear, wardrobe, outfit, loadout);
  }
  walker.glow = heldElements(gear, loadout);
  walker.spareGlow = heldElements(gear, otherLoadout(loadout))[0];
}
