// What the wreck's teaching stands on its deck: the player's sword and shield lying where the ram threw them, drawn as
// the item itself, as the Character page shows it, with a drop's line of light over it, until the player walks over
// them; and where the Tithe boarder the player meets one on one comes from.
import { inReach, markDropLine } from '../../combat/drops.ts';
import type { GearItem, GearState } from '../../network/gearMessages.ts';
import type { Card, CardAt, Cards } from '../../player/cards.ts';
import type { Dress } from '../../player/dressing.ts';
import { CARRIED, gearHands, KINDS, MELEE, WORN } from '../../player/gear.ts';
import { ItemPictures } from '../../player/itemPictures.ts';
import type { Arms } from './tutorial.ts';
import { pointAlong, topAt, type WreckLayout } from './wreckLayout.ts';

type Point = readonly [number, number, number];

/** How far along the path from where the player wakes their arms lie, metres: just ahead of them as they stand. */
export const ARMS_ALONG_M = 3;
/** The boarder's two places along the path, metres: at the far end of the quiet deck, or, should the player stand
 *  there, back by their arms, below the step up to where they woke. Either way the farther from the player. */
const BOARDER_ALONG_M = [13, 4.5] as const;
/** The boarder: a Grey Tithe Hookman, an axe fought as a swordsman fights, at the lowest rank. */
export const BOARDER = { type: 8, rank: 1 } as const;

/** The gear crate's number for a Sword & Shield. */
export const SWORD_AND_SHIELD = KINDS.indexOf('sword_and_shield');
/** The item the room gives the player (`Room::story_take_arms`) as it lies on the deck: a Normal Sword & Shield of
 *  level 1, carried, for its picture, which the item's kind and rarity alone choose. */
export const ARMS_ITEM: GearItem = {
  id: 0,
  kind: SWORD_AND_SHIELD,
  rarity: 0,
  level: 1,
  named: null,
  name: 0,
  resource: null,
  breach: false,
  xp: 0,
  xpMost: 0,
  bought: 0,
  chosen: [],
  bucket: MELEE,
  at: CARRIED,
  attack: 0,
  defense: 0,
  prestige: 0,
  columns: [],
  price: 0,
  element: 0,
  source: 0,
};
/** The forge draws a weapon's picture this many times as many pixels a metre as a figure's (weaponart.py `SIZE`): a
 *  card of it at this share stands true to size. */
const TRUE_SIZE = 1 / 4;

/** Where the player's sword and shield lie on the deck. */
export function armsAt(layout: WreckLayout): Point {
  const [x, y] = pointAlong(layout.path, ARMS_ALONG_M);
  return [x, y, topAt(layout.course, x, y)];
}

/** Where the player's sword and shield are, by their gear as the room last sent it: none in it, they lie on the deck. */
export function armsOf(gear: GearState | null): Arms {
  const held = gear?.items.find((item) => item.kind === SWORD_AND_SHIELD);
  if (!held) return 'lying';
  return held.at >= WORN ? 'worn' : held.at === CARRIED ? 'carried' : 'lying';
}

/** `dress` holding the Melee arms the player wears, as their gear has them and the Character page shows them; as it
 *  is with none worn, or where the forge has no wardrobe for its body. */
export function holdingArms(dress: Dress, gear: GearState | null, forge: Pick<Cards, 'wardrobe'>): Dress {
  const wardrobe = forge.wardrobe(dress.body);
  if (!gear || !wardrobe) return dress;
  const { right, left, grip } = gearHands(gear, wardrobe, MELEE);
  return right ? { ...dress, outfit: { ...dress.outfit, right, left, grip } } : dress;
}

/** Where the boarder stands, and the way it faces: toward the player at (`x`, `y`). */
export function boarderAt(layout: WreckLayout, x: number, y: number): { at: [number, number]; facing: number } {
  const places = BOARDER_ALONG_M.map((metres) => pointAlong(layout.path, metres));
  const far = (place: readonly [number, number]) => Math.hypot(place[0] - x, place[1] - y);
  const [standX, standY] = places.reduce((best, place) => (far(place) > far(best) ? place : best));
  return { at: [standX, standY], facing: Math.atan2(x - standX, -(y - standY)) };
}

/** The arms lying on the deck as the player sees them: the item's own picture, once the forge has drawn it, lying
 *  face up to the eye as a fallen body is drawn, at its true size, with a Normal drop's line over it. */
export class LyingArms {
  private readonly place: Point;
  private readonly forge: Cards;
  private readonly pictures: ItemPictures;
  private card: Card | null = null;

  constructor(layout: WreckLayout, forge: Cards) {
    this.place = armsAt(layout);
    this.forge = forge;
    this.pictures = new ItemPictures(forge);
  }

  /** The arms as a card among the figures, drawn on `body` as the Character page draws them; none until the forge has
   *  drawn their picture. */
  figure(body: Dress): CardAt | null {
    if (!this.card) {
      const picture = this.pictures.pictureOf(ARMS_ITEM, body, () => undefined);
      if (picture) this.card = this.forge.cardOf(picture);
    }
    const [x, y, z] = this.place;
    return this.card && { card: this.card, x, y, z, flip: false, scale: TRUE_SIZE, facesEye: true };
  }

  /** Lays the line of light over them into `out`, for an eye at `eye`, `clock` seconds on the page's clock. */
  mark(out: number[], clock: number, eye: Point): void {
    markDropLine(out, { place: this.place, rarity: ARMS_ITEM.rarity, over: 0.1 }, clock, eye);
  }

  /** Whether feet at `feet` stand over them, near enough to take them up. */
  reached(feet: Point): boolean {
    return inReach(feet, this.place);
  }

  /** Lets the card's texture go. */
  leave(): void {
    this.card?.texture.destroy();
    this.card = null;
  }
}
