// Each gear item's own picture, as the forge draws it worn: the player's figure is drawn with the item alone and
// without it, and what the item adds is kept, cropped round it. A piece in hand is its own layer, drawn by itself in
// the pose that holds it, so the hand over its grip takes nothing from it. The same picture is a slot's icon and an
// item page's large drawing. Drawn once each, on the player's own body, from the front.

import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Cards } from './cards.ts';
import type { Dress } from './dressing.ts';
import { isModule, KINDS, MELEE, WORN } from './gear.ts';
import { gearOutfit } from './gearLooks.ts';
import { type Picture, addedBy } from './picture.ts';

/** The view an item is drawn in, from the front; and the move each loadout is held up in, a melee one on guard, a
 *  pair on its own guard. Armour is drawn standing. */
const VIEW = 0;
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

export class ItemPictures {
  private readonly forge: Cards;
  private readonly kept = new Map<string, Picture | null>();
  private readonly asked = new Set<string>();
  /** Each item's dresses and pose, worked out once for the gear message it came in and the body it is worn on. */
  private readonly looks = new WeakMap<
    GearItem,
    { body: Dress; key: string; worn: Dress; bare: Dress; anim: string; onePiece: boolean; alone: string | null }
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
    const { key, worn, bare, anim, onePiece, alone } = look;
    if (this.kept.has(key)) return this.kept.get(key) ?? null;
    if (!this.asked.has(key)) {
      this.asked.add(key);
      const drawn = alone
        ? this.forge.picture(worn, anim, VIEW, 0, alone).then((piece) => piece && addedBy(piece, NOTHING, onePiece))
        : Promise.all([this.forge.picture(worn, anim, VIEW), this.forge.picture(bare, anim, VIEW)]).then(
            ([withIt, without]) => (withIt && without ? addedBy(withIt, without, onePiece) : null),
          );
      drawn
        .then((picture) => {
          this.kept.set(key, picture);
          ready();
        })
        .catch(() => this.asked.delete(key));
    }
    return null;
  }

  /** The dresses an item's picture is drawn from: the body wearing it alone, and bare; the pose that holds it; and the
   *  layer in hand drawn by itself, where the pose holds one. */
  private lookOf(
    item: GearItem,
    body: Dress,
  ): { key: string; worn: Dress; bare: Dress; anim: string; onePiece: boolean; alone: string | null } | null {
    const known = this.looks.get(item);
    if (known && known.body === body) return known;
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
    const look = { body, key, worn, bare, anim, onePiece: slot <= 1, alone };
    this.looks.set(item, look);
    return look;
  }
}
