// What each keeper's screen offers, from the player's gear as the room sent it: the rows of wares under their
// headings, as Destiny 1's vendors lay out ARMOR, EMBLEMS and MATERIAL EXCHANGE, and the currencies the keeper deals
// in. The page (npcScreen.ts) only draws these; a faction's rows are factionRows.ts's.
import cosmetics from '../../../../content/gear/cosmetics.json' with { type: 'json' };
import items from '../../../../content/gear/items.json' with { type: 'json' };
import { cosmeticRamp } from '../../forge/cosmetics.ts';
import { GAME_PALETTE } from '../appearance/gamePalette.ts';
import { ASKS, type GearAsk, type GearItem, type GearState } from '../../network/gearMessages.ts';
import { RARITIES, SLOTS, STOCK_NAMES, itemName, kindName } from '../../player/gear.ts';
import type { KeeperKind } from '../keepers.ts';
import { KEEPERS } from '../keepers.ts';
import { emblemOf } from '../emblemArt.ts';
import { CRATES_MOST, type Card, cardOf } from '../gearCards.ts';
import { vendorsOf } from '../gearScreen.ts';
import { factionRows } from './factionRows.ts';

/** What a ware's tile shows: an item's own picture, a Vestige, the Ammo crate, a dye's or a coat's colours, an
 *  emblem, a barding's mark, an Art or one of its fragments, a faction's package, or a piece not yet drawn. */
export type WarePicture =
  | { readonly kind: 'item'; readonly item: GearItem }
  | { readonly kind: 'vestige'; readonly rarity: number }
  | { readonly kind: 'crate' }
  | { readonly kind: 'swatch'; readonly colours: readonly string[] }
  | { readonly kind: 'emblem'; readonly emblem: number | string }
  | { readonly kind: 'barding'; readonly barding: string }
  | { readonly kind: 'art'; readonly art: number }
  | { readonly kind: 'fragment'; readonly art: number; readonly fragment: number }
  | { readonly kind: 'package' }
  | { readonly kind: 'initials' };

/** A price: how much, in what, and anything more the keeper takes beside it. */
export interface Price {
  readonly amount: number;
  readonly currency: 'aurem' | 'shapes';
  readonly more?: string;
}

/** One ware as its tile shows it: its name and rarity, picture, what it is and its words for its card, its price
 *  (none when free or not sold), whether the player is short of it, a word in place of the price (Kept, Pledged,
 *  From level 5), and the ask holding it sends, none when it cannot be had now. `dim` rests a tile not had; `opens`
 *  marks the press that opens the Art's choice of fragments rather than asking. */
export interface Ware {
  readonly key: string;
  readonly name: string;
  readonly rarity: number | null;
  readonly picture: WarePicture;
  readonly about: string;
  readonly words: string;
  readonly price: Price | null;
  readonly short: boolean;
  readonly note: string;
  readonly ask: GearAsk | null;
  readonly dim?: boolean;
  readonly opens?: 'rise';
}

/** An Art's standing as its row shows it: its level as pips, its bar toward the next and the words for it. */
export interface ArtShown {
  readonly art: number;
  readonly level: number;
  readonly toNext: number;
  readonly words: string;
}

/** A row of wares under its engraved heading; `empty` says why it holds none. */
export interface Row {
  readonly heading: string;
  readonly wares: readonly Ware[];
  readonly empty?: string;
  readonly art?: ArtShown;
}

/** A currency the keeper takes or gives, as the screen's top shows it. */
export interface Coin {
  readonly glyph: 'aurem' | 'shapes' | 'weapon-fragments' | 'armor-fragments' | 'weapon-essence' | 'armor-essence';
  readonly amount: number;
  readonly name: string;
}

interface Cosmetic {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly rarity: string;
  readonly words: string;
  readonly source: { readonly kind: string; readonly aurem?: number; readonly level?: number };
  readonly look: readonly string[];
}
const COSMETICS: readonly Cosmetic[] = cosmetics.cosmetics;

/** The word under a ware's price, and whether it is short: a ware that cannot be asked for says why (its note), as a
 *  low level or a full pack is no matter of Aurem; one that can be is "Not enough" when short. */
export function priceWord(ware: Ware): { readonly words: string; readonly short: boolean } {
  const short = ware.short && (ware.ask !== null || ware.opens !== undefined);
  return { words: short ? 'Not enough' : ware.note, short };
}

const SHAPE_AWAY_WORDS = 'Shape is away. He comes on Fridays.';

export const rarityNamed = (name: string): number =>
  Math.max(
    0,
    RARITIES.findIndex((each) => each.name.toLowerCase() === name),
  );

/** A ware sold for Aurem from a level, kept once bought: the kept say so, the low say from when, the short are red
 *  and still held, for the room to refuse. */
function soldOnce(gear: GearState, aurem: number, level: number, kept: boolean, ask: GearAsk) {
  const short = !kept && gear.aurem < aurem;
  const low = !kept && gear.level < level;
  return {
    price: kept ? null : { amount: aurem, currency: 'aurem' as const },
    short,
    note: kept ? 'Kept' : low ? `From level ${level}` : '',
    ask: kept || low ? null : ask,
  };
}

/** An item ware's card: the item's own, beside the piece `worn` in its slot, saying the ware's words where it has
 *  its own (a faction piece's colour, the cape's reputation). */
export function wareCard(ware: Ware, item: GearItem, worn: GearItem | null): Card {
  const card = cardOf(item, worn);
  return ware.words ? { ...card, words: ware.words } : card;
}

/** An item sold for a price: its picture, its rarity and kind, red when short. A short ware is still held to buy: the
 *  room refuses it, and the keeper answers that refusal. */
export function itemWare(key: string, item: GearItem, price: Price, short: boolean, ask: GearAsk | null): Ware {
  return {
    key,
    name: itemName(item),
    rarity: item.rarity,
    picture: { kind: 'item', item },
    about: `${RARITIES[item.rarity]?.name ?? ''} ${kindName(item.kind)} · level ${item.level}`,
    words: '',
    price,
    short,
    note: '',
    ask,
  };
}

function cosmeticWares(gear: GearState, kinds: readonly string[]): Ware[] {
  const kept = new Set(gear.cosmetics ?? []);
  return (gear.cosmeticsSold ?? []).flatMap((number) => {
    const cosmetic = COSMETICS[number];
    if (!cosmetic || !kinds.includes(cosmetic.kind)) return [];
    const { aurem = 0, level = 1 } = cosmetic.source;
    const sold = soldOnce(gear, aurem, level, kept.has(number), { kind: ASKS.buyCosmetic, item: number });
    const swatch = cosmetic.kind !== 'barding';
    return [
      {
        key: `cosmetic-${number}`,
        name: cosmetic.name,
        rarity: rarityNamed(cosmetic.rarity),
        // A swatch in the ramp's own four colours, on the palette as the figure draws them.
        picture: swatch
          ? {
              kind: 'swatch',
              colours: (cosmeticRamp(cosmetic.id, GAME_PALETTE) ?? [])
                .filter((_rgb, step) => step % 5 === 0)
                .map((rgb) => `rgb(${rgb.join(' ')})`),
            }
          : { kind: 'barding', barding: cosmetic.id },
        about: `${RARITIES[rarityNamed(cosmetic.rarity)]?.name ?? ''} ${cosmetic.kind === 'dye' ? 'Dye' : cosmetic.kind === 'coat' ? 'Coat' : 'Barding'}`,
        words: cosmetic.words,
        ...sold,
      },
    ];
  });
}

function emblemWares(gear: GearState): Ware[] {
  const kept = new Set(gear.emblems ?? []);
  return (gear.emblemsSold ?? []).map((number) => {
    const emblem = emblemOf(number);
    const { aurem = 0, level = 1 } = emblem.source;
    return {
      key: `emblem-${emblem.id}`,
      name: emblem.name,
      rarity: rarityNamed(emblem.rarity),
      picture: { kind: 'emblem', emblem: number },
      about: `${RARITIES[rarityNamed(emblem.rarity)]?.name ?? ''} Emblem`,
      words: emblem.words,
      ...soldOnce(gear, aurem, level, kept.has(number), { kind: ASKS.buyEmblem, item: number }),
    };
  });
}

/** The Weaponsmith's Ammo crate, sold every day while there is room for one. */
function crateWare(gear: GearState): Ware {
  const [price, carried] = [gear.cratePrice ?? 0, gear.crates ?? 0];
  const short = gear.aurem < price;
  const room = carried < CRATES_MOST;
  return {
    key: 'crate',
    name: 'Ammo crate',
    rarity: null,
    picture: { kind: 'crate' },
    about: `Consumable · ${carried} of ${CRATES_MOST} carried`,
    words: "Fills your Ranged weapon's ammunition.",
    price: { amount: price, currency: 'aurem' },
    short,
    note: room ? '' : 'You carry five',
    ask: room ? { kind: ASKS.buyCrate } : null,
  };
}

/** A smith's rows: their starter stock under "To start", then the day's wares under `heading`. */
function smithRows(gear: GearState, vendor: number, heading: string): Row[] {
  const wares = (vendorsOf(gear)[vendor]?.wares ?? []).map((ware, place) => {
    const price = { amount: ware.price, currency: 'aurem' as const };
    return {
      starter: ware.starter,
      ware: itemWare(`buy-${vendor}-${place}`, ware.item, price, !ware.affordable, ware.press.ask),
    };
  });
  const day = { heading, wares: wares.filter((each) => !each.starter).map((each) => each.ware) };
  const start = wares.filter((each) => each.starter).map((each) => each.ware);
  return [
    ...(start.length > 0 ? [{ heading: 'To start', wares: start }] : []),
    { ...day, empty: 'Sold only in a social space.' },
  ];
}

function mageRows(gear: GearState): Row[] {
  const wares: Ware[] = gear.vestiges
    .filter((each) => !each.vaulted)
    .map((each) => ({
      key: `vestige-${each.id}`,
      name: `${RARITIES[each.rarity]?.name ?? ''} Vestige`,
      rarity: each.rarity,
      picture: { kind: 'vestige', rarity: each.rarity },
      about: `For the ${SLOTS[each.slot] ?? ''} · level ${each.level}`,
      words: 'Hold to have the Mage open it.',
      price: null,
      short: false,
      note: '',
      ask: { kind: ASKS.identify, item: each.id },
    }));
  const rows: Row[] = [{ heading: 'Vestiges', wares, empty: 'Bring your Vestiges from the sea.' }];
  const opened = gear.items.find((each) => each.id === gear.identified);
  if (opened)
    rows.push({
      heading: 'Opened',
      wares: [
        {
          ...itemWare('opened', opened, { amount: 0, currency: 'aurem' }, false, { kind: ASKS.identify }),
          price: null,
          ask: null,
        },
      ],
    });
  return rows;
}

/** Shape's week's wares while he is here; while away, the words for when he comes, whatever the day. */
function shapeRows(gear: GearState): Row[] {
  if (!gear.shape) return [{ heading: 'Wares', wares: [], empty: SHAPE_AWAY_WORDS }];
  const shapes = gear.shapes ?? 0;
  const wares = gear.shape.wares.map((item, place) => {
    // Each piece is made at its own level, and the room sells none to a player who could not wear it yet.
    const low = gear.level < item.level;
    // The piece shown, by its place in the catalogue, so a room whose week drew another there refuses it.
    const shown = items.items.findIndex((entry) => entry.id === item.named);
    const ask = low ? null : { kind: ASKS.buyFromShape, node: place, item: shown };
    const ware = itemWare(`shape-${place}`, item, { amount: item.price, currency: 'shapes' }, shapes < item.price, ask);
    return low ? { ...ware, short: false, note: `From level ${item.level}`, dim: true } : ware;
  });
  return [{ heading: 'Wares', wares }];
}

/** A keeper's rows of wares; `choosing`, a faction's Art waits on the fragment its rise takes. */
export function rowsOf(kind: KeeperKind, gear: GearState, choosing = false): Row[] {
  const faction = KEEPERS[kind].faction;
  if (faction !== undefined) return factionRows(faction, gear, choosing);
  switch (kind) {
    case 'mage':
      return mageRows(gear);
    case 'armorsmith':
      return smithRows(gear, 0, 'Armour');
    case 'weaponsmith':
      return [
        ...smithRows(gear, 1, 'Weapons'),
        ...((gear.cratePrice ?? 0) > 0 ? [{ heading: 'Supplies', wares: [crateWare(gear)] }] : []),
      ];
    case 'tailor':
      return [
        { heading: 'Dyes', wares: cosmeticWares(gear, ['dye']), empty: 'Sold only in a social space.' },
        { heading: 'Emblems', wares: emblemWares(gear), empty: 'Sold only in a social space.' },
      ];
    case 'tack':
      return [
        { heading: 'Mount', wares: cosmeticWares(gear, ['coat', 'barding']), empty: 'Sold only in a social space.' },
      ];
    case 'shape':
      return shapeRows(gear);
    default:
      return [];
  }
}

/** The currencies a keeper deals in: Shapes for Shape, what an Art's rise takes for a faction, none at the Mage's and
 *  the Postmaster's, who sell nothing, else Aurem. */
export function purseOf(kind: KeeperKind, gear: GearState): Coin[] {
  if (kind === 'shape') return [{ glyph: 'shapes', amount: gear.shapes ?? 0, name: 'Shapes' }];
  const aurem: Coin = { glyph: 'aurem', amount: gear.aurem, name: 'Aurem' };
  if (KEEPERS[kind].faction === undefined) return kind === 'mage' || kind === 'mail' ? [] : [aurem];
  const stocks = ['weapon-fragments', 'armor-fragments', 'weapon-essence', 'armor-essence'] as const;
  return [
    aurem,
    ...stocks.map((glyph, place) => ({ glyph, amount: gear.stocks[place] ?? 0, name: STOCK_NAMES[place] ?? '' })),
  ];
}
