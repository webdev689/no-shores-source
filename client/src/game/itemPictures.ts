// Each gear item's own picture, as the forge draws it worn: the player's figure is drawn with the item alone and
// without it, and what the item adds is kept, cropped round it. The same picture is a slot's icon and an item page's
// large drawing. Drawn once each, on the player's own body, from the front.

import type { GearItem, GearState } from '../network/gearMessages.ts';
import type { Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import { WORN } from '../player/gear.ts';
import { gearOutfit } from '../player/gearLooks.ts';
import { type Picture, addedBy } from '../player/picture.ts';

/** The move and view an item is drawn in: standing, from the front, its weapon in hand. */
const ANIM = 'idle';
const VIEW = 0;

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
  social: false,
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

  constructor(forge: Cards) {
    this.forge = forge;
  }

  /** The picture of `item` worn on `body`, or null while it is drawn or where the forge draws nothing of it;
   *  `ready` is called once it is drawn. */
  pictureOf(item: GearItem, body: Dress, ready: () => void): Picture | null {
    const wardrobe = this.forge.wardrobe(body.body);
    if (!wardrobe) return null;
    const slot = item.at >= WORN ? item.at - WORN : item.bucket;
    const plain = { ...body.outfit, armour: {}, garments: [], dyes: {}, right: null, left: null, drawn: true };
    const dressed = (state: GearState): Dress => ({
      ...body,
      outfit: { ...gearOutfit(state, wardrobe, plain), drawn: true },
    });
    const [worn, bare] = [dressed(holding([{ ...item, at: WORN + slot }])), dressed(holding([]))];
    const key = JSON.stringify([worn, bare]);
    if (this.kept.has(key)) return this.kept.get(key) ?? null;
    if (!this.asked.has(key)) {
      this.asked.add(key);
      Promise.all([this.forge.picture(worn, ANIM, VIEW), this.forge.picture(bare, ANIM, VIEW)])
        .then(([withIt, without]) => {
          this.kept.set(key, withIt && without ? addedBy(withIt, without) : null);
          ready();
        })
        .catch(() => this.kept.set(key, null));
    }
    return null;
  }
}
