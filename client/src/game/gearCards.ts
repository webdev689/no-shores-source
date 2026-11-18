// What the gear screens' smaller parts show, from the player's gear: an item's card (its name, kind, rarity, numbers,
// traits and, against the piece it would replace, what changes), a slot's flyout of the nine it carries, and the
// inventory page's currencies and its tabs of cells. The page draws these in the Enhanced Plus kit.

import { ASKS, type GearItem, type GearState, NONE } from '../network/gearMessages.ts';
import {
  CARRIED,
  KINDS,
  RARITIES,
  RESOURCE_COUNT,
  STOCK_NAMES,
  VAULTED,
  WORN,
  itemName,
  itemWords,
  resourceName,
  resourceWords,
  traitOf,
  wearAsks,
} from '../player/gear.ts';
import type { Press } from './gearScreen.ts';

/** How many items a slot carries beside the one worn, and how many Vestiges are carried. */
export const CARRIED_MOST = 9;
export const VESTIGES_MOST = 10;
/** The XP a Fruit of Dagon gives an item (the gear crate's `FRUIT_ITEM_XP`). */
const FRUIT_ITEM_XP = 5_000;

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** An item's card, as Enhanced Plus's hover card shows it. */
export interface Card {
  readonly name: string;
  readonly rarity: number;
  readonly kind: string;
  /** Its main number and what it is. */
  readonly big: { readonly label: string; readonly value: number } | null;
  readonly rows: readonly (readonly [string, string])[];
  /** Its chosen traits, each with its column's kind, whose glyph marks it. */
  readonly traits: readonly Trait[];
  readonly words: string;
  readonly compare: {
    readonly replaces: string;
    readonly rows: readonly { readonly label: string; readonly from: number; readonly to: number }[];
  } | null;
}

/** A trait an item gives: its name, its words, and its column's kind (`COLUMNS`). */
export interface Trait {
  readonly name: string;
  readonly words: string;
  readonly kind: number;
}

/** The traits an item gives now: each column's chosen one, once bought. */
export function chosenTraits(item: GearItem): string[] {
  return traitsOf(item).map(({ id }) => id);
}

/** Each chosen trait's id and its column's kind. */
function traitsOf(item: GearItem): { readonly id: string; readonly kind: number }[] {
  return item.columns.flatMap((column, index) => {
    const chosen = item.chosen[index] ?? NONE;
    const id = chosen === NONE ? '' : (column.traits[chosen] ?? '');
    return id ? [{ id, kind: column.kind }] : [];
  });
}

/** The traits an item gives now, as its card and page list them. */
export function traitsShown(item: GearItem): Trait[] {
  return traitsOf(item).map(({ id, kind }) => ({ ...traitOf(id), kind }));
}

/** An item's card; against `worn`, the piece it would replace, what changes. */
export function cardOf(item: GearItem, worn: GearItem | null = null): Card {
  const big = item.attack
    ? { label: 'Attack', value: item.attack }
    : item.defense
      ? { label: 'Defense', value: item.defense }
      : null;
  const rows: [string, string][] = [['Level', String(item.level)]];
  if (item.prestige) rows.push(['Prestige', String(item.prestige)]);
  if (item.xpMost > 0) rows.push(['XP', `${item.xp.toLocaleString()} / ${item.xpMost.toLocaleString()}`]);
  const changes = (['attack', 'defense', 'prestige'] as const)
    .map((stat) => ({ label: capital(stat), from: worn?.[stat] ?? 0, to: item[stat] }))
    .filter((change) => change.from !== 0 || change.to !== 0);
  return {
    name: itemName(item),
    rarity: item.rarity,
    kind: `${RARITIES[item.rarity]?.name ?? ''} ${capital(KINDS[item.kind] ?? '')}`,
    big,
    rows,
    traits: traitsShown(item),
    words: itemWords(item),
    compare: worn && worn.id !== item.id ? { replaces: itemName(worn), rows: changes } : null,
  };
}

/** A slot's flyout: the piece it wears, and its nine carried places, empty ones null. */
export function flyoutOf(
  state: GearState,
  slot: number,
): { readonly worn: GearItem | null; readonly cells: (GearItem | null)[] } {
  const worn = state.items.find((item) => item.at === WORN + slot) ?? null;
  const carried = state.items.filter((item) => item.at === CARRIED && item.bucket === slot);
  return { worn, cells: Array.from({ length: CARRIED_MOST }, (unused, place) => carried[place] ?? null) };
}

/** What wearing a carried item in a slot asks: the off hand's flyout wears in the off hand, any other its own. */
export function wearIn(item: GearItem, slot: number): Press | null {
  const asks = wearAsks(item);
  const found = asks.find((each) => each.ask.slot === slot) ?? asks[0];
  return found ? { label: 'Equip', ask: found.ask, role: 'primary' } : null;
}

/** The pictures a cell is drawn with: a glyph of the kit's (and its tint), or an item's own picture. */
export type Glyph =
  | 'aurem'
  | 'weapon-fragments'
  | 'armor-fragments'
  | 'weapon-essence'
  | 'armor-essence'
  | 'fruit'
  | 'resource'
  | 'vestige'
  | 'empty'
  | 'item';

/** One cell of the inventory's grid. */
export interface Cell {
  readonly key: string;
  readonly glyph: Glyph;
  readonly rarity: number;
  /** A resource's place in the list, which colours its glyph. */
  readonly tint: number;
  readonly count: number | null;
  readonly name: string;
  readonly words: string;
  /** What a click asks, and what a right-click does. */
  readonly press: Press | null;
  readonly other: Press | null;
  readonly item: GearItem | null;
}

/** The inventory page: its currencies, and its tabs of cells. */
export interface InventoryPage {
  readonly currencies: readonly { readonly glyph: Glyph; readonly name: string; readonly count: number }[];
  readonly tabs: readonly { readonly id: string; readonly name: string; readonly cells: readonly Cell[] }[];
}

const STOCK_GLYPHS: readonly Glyph[] = ['weapon-fragments', 'armor-fragments', 'weapon-essence', 'armor-essence'];

const cell = (key: string, glyph: Glyph, name: string, fields: Partial<Cell> = {}): Cell => ({
  key,
  glyph,
  rarity: 0,
  tint: 0,
  count: null,
  name,
  words: '',
  press: null,
  other: null,
  item: null,
  ...fields,
});

export function inventoryPageOf(state: GearState): InventoryPage {
  const currencies = [
    { glyph: 'aurem' as const, name: 'Aurem', count: state.aurem },
    ...STOCK_GLYPHS.map((glyph, index) => ({ glyph, name: STOCK_NAMES[index] ?? '', count: state.stocks[index] ?? 0 })),
  ];
  const fruit = cell('fruit', 'fruit', 'Fruit of Dagon', {
    count: state.stocks[4] ?? 0,
    words: `Held on an item's page, it is eaten to give that item ${FRUIT_ITEM_XP.toLocaleString()} XP.`,
  });
  const materials = Array.from({ length: RESOURCE_COUNT }, (unused, index) =>
    cell(`resource-${index}`, 'resource', resourceName(index), {
      count: state.resources[index] ?? 0,
      words: resourceWords(index),
      tint: index,
    }),
  );
  const vestige = (vaulted: boolean) =>
    state.vestiges
      .filter((each) => each.vaulted === vaulted)
      .map((each) => {
        const words = `Holds a level ${each.level} item for the ${['main hand', 'off hand', 'head', 'torso', 'arms', 'legs', 'cloak'][each.slot] ?? ''}. ${
          state.social ? 'Click to identify it.' : 'It opens in a social space.'
        }`;
        return cell(`vestige-${each.id}`, 'vestige', `${RARITIES[each.rarity]?.name ?? ''} Vestige`, {
          rarity: each.rarity,
          words: vaulted ? 'In the vault. Click to take it out.' : words,
          press: vaulted
            ? { label: 'Take out', ask: { kind: ASKS.withdrawVestige, item: each.id }, role: 'button' }
            : state.social
              ? { label: 'Identify', ask: { kind: ASKS.identify, item: each.id }, role: 'primary' }
              : null,
          other:
            !vaulted && state.social
              ? { label: 'Vault', ask: { kind: ASKS.storeVestige, item: each.id }, role: 'button' }
              : null,
        });
      });
  const carried = vestige(false);
  const empties = Array.from({ length: Math.max(0, VESTIGES_MOST - carried.length) }, (unused, place) =>
    cell(`empty-${place}`, 'empty', 'An empty place'),
  );
  const vault = state.items
    .filter((item) => item.at === VAULTED)
    .map((item) =>
      cell(`item-${item.id}`, 'item', itemName(item), {
        rarity: item.rarity,
        item,
        words: 'In the vault. Click to take it out.',
        press: { label: 'Take out', ask: { kind: ASKS.withdraw, item: item.id }, role: 'button' },
      }),
    );
  return {
    currencies,
    tabs: [
      { id: 'consumables', name: 'Consumables', cells: [fruit] },
      { id: 'materials', name: 'Materials', cells: materials },
      { id: 'vestiges', name: 'Vestiges', cells: [...carried, ...empties] },
      { id: 'vault', name: 'Vault', cells: state.social ? [...vault, ...vestige(true)] : [] },
    ],
  };
}
