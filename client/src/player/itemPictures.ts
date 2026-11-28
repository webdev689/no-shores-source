// Each gear item's own picture, as the forge draws it worn: the player's figure is drawn with the item alone and
// without it, and what the item adds is kept, cropped round it. A piece in hand is its own layer, drawn by itself in
// the pose that holds it, so the hand over its grip takes nothing from it. A loadout is the forge's large picture of
// what its hands hold where it publishes one: the right hand's level, the left's behind it. An armour piece, a cloak
// or clothes is the forge's large picture of what it wears, standing, from the front, where it publishes one. The
// same picture is a slot's icon and an item page's large drawing. Drawn once each, on the player's own body, from the
// front; a horse is its own layer in its coat, from the side, as the Appearance screen's barding tiles draw it.

import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Cards } from './cards.ts';
import type { Dress } from './dressing.ts';
import type { ArmourPiece, Outfit } from '../forge/outfit.ts';
import { HORSE_LAYER } from '../forge/looks.ts';
import { coatOfHorse, isModule, KINDS, MELEE, WORN } from './gear.ts';
import { gearOutfit } from './gearLooks.ts';
import { type Picture, SECOND_SHARE, addedBy, overlapped } from './picture.ts';

/** The view an item is drawn in, from the front; and the move each loadout is held up in, a melee one on guard, a
 *  pair on its own guard. Armour is drawn standing. */
const VIEW = 0;
/** A horse's view and pose: from the side, standing. */
const HORSE_VIEW = 2;
const HORSE_STANDS = 'horseidle';
const HELD_IN: Readonly<Record<string, string>> = {
  bow: 'idle_bow',
  staff: 'idle_staff',
  crossbow: 'braceready',
  pistolet: 'pistolready',
  double_pistolet: 'braceready',
  thunderlock: 'gunready',
  double_daggers: 'twinguard',
  double_swords: 'twinguard',
  double_mace: 'twinguard',
};
/** No figure: what a layer drawn alone adds to it is all of the layer. */
const NOTHING: Picture = { width: 0, height: 0, pixels: new Uint8ClampedArray(0) };
/** The armour slots, by the gear crate's numbers: the name the forge gives a set's look in each (armourart.py
 *  `SLOTS`), and the piece it is dyed as. The cloak slot wears garments alone. */
const ARMOUR_SLOTS: Readonly<Record<number, { readonly name: string; readonly piece: ArmourPiece }>> = {
  2: { name: 'head', piece: 'helm' },
  3: { name: 'torso', piece: 'cuirass' },
  4: { name: 'arms', piece: 'gauntlets' },
  5: { name: 'legs', piece: 'greaves' },
};
const CLOAK_SLOT = 6;

/** The forge's large picture of what an item worn alone in `slot` wears (armourart.py), and the layer of the figure it
 *  is dyed as: an armour set's slot and set (`torso_steel`, dyed as its cuirass), else its garments joined by `+` in
 *  the order put on (`shirt_long_round+short_tunic`, dyed as the first's own layer or its drape, whichever the body
 *  `draws`); null in any other slot or with nothing worn. */
export function wornArt(
  outfit: Outfit,
  slot: number,
  draws: (layer: string) => boolean,
): { readonly look: string; readonly layer: string } | null {
  const armour = ARMOUR_SLOTS[slot];
  if (!armour && slot !== CLOAK_SLOT) return null;
  const set = armour && outfit.armour[armour.piece];
  if (armour && set) return { look: `${armour.name}_${set}`, layer: `${armour.piece}_${set}` };
  const [first] = outfit.garments;
  const layer = first === undefined ? undefined : [first, `${first}_drape`].find(draws);
  return layer ? { look: outfit.garments.join('+'), layer } : null;
}

/** Gear holding nothing but `items`. */
const holding = (items: readonly GearItem[]): GearState => ({
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
});

/** The item pictures kept, those asked for least lately let go first: every screen's worth shown recently, a few MB. */
export const PICTURES_KEPT = 256;

export class ItemPictures {
  private readonly forge: Cards;
  private readonly kept = new Map<string, Picture | null>();
  private readonly asked = new Set<string>();
  /** Each item's dresses and pose, worked out once for the gear message it came in and the body it is worn on. */
  private readonly looks = new WeakMap<
    GearItem,
    {
      body: Dress;
      key: string;
      worn: Dress;
      bare: Dress;
      anim: string;
      view: number;
      onePiece: boolean;
      alone: string | null;
      art: { readonly look: string; readonly layer: string } | null;
    }
  >();

  constructor(forge: Cards) {
    this.forge = forge;
  }

  /** The picture of `item` worn on `body`, or null while it is drawn or where the forge draws nothing of it;
   *  `ready` is called once it is drawn. A picture the forge failed to draw is asked again the next time. */
  pictureOf(item: GearItem, body: Dress, ready: () => void): Picture | null {
    // A module is no figure's to wear: its glyph stands for it.
    if (isModule(item.kind)) return null;
    const look = this.lookOf(item, body);
    if (!look) return null;
    const { key, worn, bare, anim, view, onePiece, alone, art } = look;
    if (this.kept.has(key)) {
      // Asked for again, it is kept the longest of all.
      const picture = this.kept.get(key) ?? null;
      this.kept.delete(key);
      this.kept.set(key, picture);
      return picture;
    }
    if (!this.asked.has(key)) {
      this.asked.add(key);
      const cutOut = () =>
        alone
          ? this.forge.picture(worn, anim, view, 0, alone).then((piece) => piece && addedBy(piece, NOTHING, onePiece))
          : Promise.all([this.forge.picture(worn, anim, VIEW), this.forge.picture(bare, anim, VIEW)]).then(
              ([withIt, without]) => (withIt && without ? addedBy(withIt, without, onePiece) : null),
            );
      // A large picture that fails to load gives way to the cut-out, as one not published does.
      const large = onePiece
        ? this.largeOf(worn).catch(() => null)
        : art
          ? this.forge.armourArt(worn, art.look, art.layer).catch(() => null)
          : Promise.resolve(null);
      large
        .then((picture) => picture ?? cutOut())
        .then((picture) => {
          this.kept.set(key, picture);
          this.asked.delete(key);
          for (const oldest of this.kept.keys()) {
            if (this.kept.size <= PICTURES_KEPT) break;
            this.kept.delete(oldest);
          }
          ready();
        })
        .catch(() => this.asked.delete(key));
    }
    return null;
  }

  /** A loadout's large picture: its right hand's piece as the forge draws it large (`Cards.weaponArt`), and behind it
   *  at its left its left hand's, smaller (`overlapped`); null unless the forge draws every piece in hand so. */
  private async largeOf(worn: Dress): Promise<Picture | null> {
    const { right, left } = worn.outfit;
    if (!right) return null;
    const [main, second] = await Promise.all([
      this.forge.weaponArt(worn, right),
      left ? this.forge.weaponArt(worn, left, SECOND_SHARE) : null,
    ]);
    if (!main || (left && !second)) return null;
    return second ? overlapped(main, second) : main;
  }

  /** The dresses an item's picture is drawn from: the body wearing it alone, and bare; the pose that holds it; and the
   *  layer in hand drawn by itself, where the pose holds one. */
  private lookOf(
    item: GearItem,
    body: Dress,
  ): {
    key: string;
    worn: Dress;
    bare: Dress;
    anim: string;
    view: number;
    onePiece: boolean;
    alone: string | null;
    art: { readonly look: string; readonly layer: string } | null;
  } | null {
    const known = this.looks.get(item);
    if (known && known.body === body) return known;
    const coat = coatOfHorse(item);
    if (coat !== null) {
      const worn = { ...body, outfit: { ...body.outfit, coat, barding: null } };
      const key = JSON.stringify([worn, HORSE_STANDS, HORSE_VIEW]);
      const look = {
        body,
        key,
        worn,
        bare: worn,
        anim: HORSE_STANDS,
        view: HORSE_VIEW,
        onePiece: false,
        alone: HORSE_LAYER,
        art: null,
      };
      this.looks.set(item, look);
      return look;
    }
    const wardrobe = this.forge.wardrobe(body.body);
    if (!wardrobe) return null;
    const slot = item.at >= WORN ? item.at - WORN : item.bucket;
    const plain = { ...body.outfit, armour: {}, garments: [], dyes: {}, right: null, left: null, drawn: true };
    const dressed = (state: GearState): Dress => ({
      ...body,
      outfit: { ...gearOutfit(state, wardrobe, plain, slot <= 1 ? slot : MELEE), drawn: true },
    });
    const [worn, bare] = [dressed(holding([{ ...item, at: WORN + slot }])), dressed(holding([]))];
    const kind = KINDS[item.kind] ?? '';
    // A loadout in both hands (a pair, a weapon and shield) is what the figure gains holding it; one in one hand alone.
    const { right, left } = worn.outfit;
    const held = right && left ? null : (left ?? right);
    const wanted = slot <= 1 ? (HELD_IN[kind] ?? 'guard') : 'idle';
    const anim = this.forge.draws(body.body, wanted, held ?? right) ? wanted : 'idle';
    // A piece in hand is drawn by itself; one the pose puts away is drawn worn, as armour is.
    const alone = held && this.forge.draws(body.body, anim, held) ? held : null;
    // A loadout is one piece: anything else the figure shows with it (a sheath at the hip) is not it.
    const key = JSON.stringify([worn, bare, anim, alone]);
    // An armour piece, a cloak or clothes asks for the forge's large picture of what it wears, standing.
    const art = wornArt(worn.outfit, slot, (layer) => this.forge.draws(body.body, 'idle', layer));
    const look = { body, key, worn, bare, anim, view: VIEW, onePiece: slot <= 1, alone, art };
    this.looks.set(item, look);
    return look;
  }
}
