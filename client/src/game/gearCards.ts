// What the gear pages' smaller parts show, from the player's gear: an item's card (its name, kind, rarity, numbers,
// traits and, against the piece it would replace, what changes), a slot's flyout of the nine it carries, the
// inventory page's currencies and its shelves of cells, and the vault's. The page draws these in the Enhanced Plus kit.

import items from '../../../content/gear/items.json' with { type: 'json' };
import { ASKS, type GearItem, type GearState, NONE } from '../network/gearMessages.ts';
import {
  CARRIED,
  RARITIES,
  RESOURCE_COUNT,
  SLOTS,
  STOCK_NAMES,
  VAULTED,
  WORN,
  capital,
  isModule,
  isWeapon,
  itemWords,
  resourceName,
  resourceWords,
  traitOf,
  wearAsks,
} from '../player/gear.ts';
import type { Press } from './gearScreen.ts';
import { gearKindName, gearName } from './shipGear.ts';
import type { ShipGlyph } from './shipGlyphs.ts';
import { earnedFrom } from '../player/sourceLooks.ts';

/** How many items a slot carries beside the one worn, how many Vestiges are carried, how many of each the vault
 *  keeps, and how many Ammo crates are carried (the gear crate's `CARRIED_MOST`, `VESTIGES_MOST`, `VAULT_MOST` and
 *  `CRATES_MOST`). */
export const CARRIED_MOST = 9;
export const VESTIGES_MOST = 10;
export const VAULT_MOST = 20;
export const CRATES_MOST = 5;

/** An item's card, as Enhanced Plus's hover card shows it. */
export interface Card {
  readonly name: string;
  readonly rarity: number;
  readonly kind: string;
  /** Its main number and what it is. */
  readonly big: { readonly label: string; readonly value: number | string } | null;
  readonly rows: readonly (readonly [string, string])[];
  /** A weapon's element, by the gear crate's numbers: 0 for none. */
  readonly element: number;
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
  /** What a perk that gives and takes gives, and costs, apart; empty for any other. */
  readonly gives?: string;
  readonly takes?: string;
  /** A word on where it stands: an Atheric's intrinsic always on, its own node not yet chosen. */
  readonly note?: string;
  /** Whether it acts now; an Atheric's own node not yet chosen does not. */
  readonly off?: boolean;
}

/** The column kind an Atheric's own node has, whose glyph its intrinsic shows too. */
export const ATHERIC_OWN = 4;

/** An Atheric's intrinsic, always on while it is worn and never a node, as its page and card show it; null for any
 *  other. */
export function intrinsicOf(item: Pick<GearItem, 'named'>): Trait | null {
  const entry: { readonly id: string; readonly intrinsic?: string } | undefined = items.items.find(
    (found) => found.id === item.named,
  );
  return entry?.intrinsic ? { ...traitOf(entry.intrinsic), kind: ATHERIC_OWN, note: 'Intrinsic: always on' } : null;
}

/** An Atheric's own node's perk as its page shows it beside its intrinsic: on once bought and chosen, else marked as
 *  waiting in its column; null for an item with no such column. */
export function ownOf(item: Pick<GearItem, 'columns' | 'chosen'>): Trait | null {
  const index = item.columns.findIndex((column) => column.kind === ATHERIC_OWN);
  const id = item.columns[index]?.traits[0];
  if (!id) return null;
  const chosen = item.chosen[index] === 0;
  return {
    ...traitOf(id),
    kind: ATHERIC_OWN,
    note: chosen ? 'Its own node' : 'Its own node: not yet chosen',
    off: !chosen,
  };
}

/** Each chosen trait's id and its column's kind. */
function traitsOf(item: Pick<GearItem, 'columns' | 'chosen'>): { readonly id: string; readonly kind: number }[] {
  return item.columns.flatMap((column, index) => {
    const chosen = item.chosen[index] ?? NONE;
    const id = chosen === NONE ? '' : (column.traits[chosen] ?? '');
    return id ? [{ id, kind: column.kind }] : [];
  });
}

/** The traits an item, or an officer, gives now, as its card and page list them. */
export function traitsShown(item: Pick<GearItem, 'columns' | 'chosen'>): Trait[] {
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
  // Where it was earned, which its look says too; a ship's module keeps no look of a content.
  if (!isModule(item.kind)) rows.push(['From', capital(earnedFrom(item))]);
  const changes = (['attack', 'defense', 'prestige'] as const)
    .map((stat) => ({ label: capital(stat), from: worn?.[stat] ?? 0, to: item[stat] }))
    .filter((change) => change.from !== 0 || change.to !== 0);
  return {
    name: gearName(item),
    rarity: item.rarity,
    kind: `${RARITIES[item.rarity]?.name ?? ''} ${gearKindName(item.kind)}`,
    big,
    rows,
    element: item.element,
    // An Atheric's intrinsic heads its perks, as the piece is chiefly that.
    traits: [...[intrinsicOf(item)].filter((trait) => trait !== null), ...traitsShown(item)],
    words: itemWords(item),
    compare: worn && worn.id !== item.id ? { replaces: gearName(worn), rows: changes } : null,
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

/** What wearing a carried item from a slot's flyout asks: wearing it in its own slot, the flyout's. */
export function wearIn(item: GearItem): Press | null {
  const [found] = wearAsks(item);
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
  | 'ammo-box'
  | 'ammo-crate'
  | 'xp'
  | 'empty'
  | ShipGlyph
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

/** The inventory page: its currencies, the Vestiges carried in their ten places, and its tabs of cells. */
export interface InventoryPage {
  readonly currencies: readonly { readonly glyph: Glyph; readonly name: string; readonly count: number }[];
  readonly vestiges: { readonly held: number; readonly most: number; readonly cells: readonly Cell[] };
  readonly tabs: readonly { readonly id: string; readonly name: string; readonly cells: readonly Cell[] }[];
}

const STOCK_GLYPHS: readonly Glyph[] = ['weapon-fragments', 'armor-fragments', 'weapon-essence', 'armor-essence'];
/** What each stock is for, from the gear crate's costs and dismantling. */
const STOCK_WORDS = [
  "A weapon's nodes are bought with them. Dismantling a weapon gives some back.",
  "An armour piece's nodes are bought with them. Dismantling armour gives some back.",
  "A Legendary or Atheric weapon's last upgrades are bought with it. Dismantling one gives some back.",
  "A Legendary or Atheric armour piece's upgrades are bought with it. Dismantling one gives some back.",
];

const held = (each: Cell): boolean => (each.count ?? 0) > 0;

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

/** The inventory: Aurem its one currency, at the owner's word; every other thing a stack, shown only while held. */
export function inventoryPageOf(state: GearState): InventoryPage {
  const currencies = [{ glyph: 'aurem' as const, name: 'Aurem', count: state.aurem }];
  const stocks = STOCK_GLYPHS.map((glyph, index) =>
    cell(`stock-${index}`, glyph, STOCK_NAMES[index] ?? '', {
      count: state.stocks[index] ?? 0,
      words: STOCK_WORDS[index] ?? '',
    }),
  );
  const fruit = cell('fruit', 'fruit', 'Fruit of Dagon', {
    count: state.stocks[4] ?? 0,
    words: "Hold it on an item's page to feed it to that item: it grows the item.",
  });
  const crates = state.crates ?? 0;
  const full = (state.ammoShare ?? 1) >= 1;
  const crate = cell('ammo-crate', 'ammo-crate', 'Ammo crate', {
    count: crates,
    words: `It fills your Ranged weapon's ammunition at once. You carry five at most.${full ? ' Yours is full.' : ''}`,
    press:
      crates > 0 && !full
        ? { label: 'Hold to fill your ammo', ask: { kind: ASKS.useCrate }, role: 'button', held: true, burst: 'pulse' }
        : null,
  });
  const materials = Array.from({ length: RESOURCE_COUNT }, (unused, index) =>
    cell(`resource-${index}`, 'resource', resourceName(index), {
      count: state.resources[index] ?? 0,
      words: resourceWords(index),
      tint: index,
    }),
  );
  const carried = state.vestiges
    .filter((each) => !each.vaulted)
    .map((each) =>
      vestigeCell(each, vestigeHolds(each), {
        words: state.atMage ? 'Click to open it.' : 'Open it at the Mage.',
        press: state.atMage ? { label: 'Open', ask: { kind: ASKS.identify, item: each.id }, role: 'primary' } : null,
      }),
    );
  const empties = Array.from({ length: Math.max(0, VESTIGES_MOST - carried.length) }, (unused, place) =>
    cell(`empty-${place}`, 'empty', 'An empty place'),
  );
  return {
    currencies,
    vestiges: { held: carried.length, most: VESTIGES_MOST, cells: [...carried, ...empties] },
    tabs: [
      { id: 'consumables', name: 'Consumables', cells: [fruit, crate].filter(held) },
      { id: 'materials', name: 'Materials', cells: [...stocks, ...materials].filter(held) },
    ],
  };
}

type Vestige = GearState['vestiges'][number];

/** What a Vestige holds, as its cell says: its slot, its level and where it was earned. */
const vestigeHolds = (each: Vestige) =>
  `For the ${SLOTS[each.slot] ?? ''}, level ${each.level}, from ${earnedFrom(each)}.`;

/** A Vestige's cell: its rarity's name, what it holds, and `fields`' words and presses. */
function vestigeCell(each: Vestige, holds: string, fields: Partial<Cell>): Cell {
  const words = [holds, fields.words].filter(Boolean).join(' ');
  return cell(`vestige-${each.id}`, 'vestige', `${RARITIES[each.rarity]?.name ?? ''} Vestige`, {
    rarity: each.rarity,
    ...fields,
    words,
  });
}

/** One shelf of the vault, or of what the player carries beside it: its name, how many it holds of how many (0 where
 *  only each slot's flyout caps it), and whether it holds Vestiges. */
export interface VaultShelf {
  readonly name: string;
  readonly held: number;
  readonly most: number;
  readonly vestiges: boolean;
  readonly cells: readonly Cell[];
}

/** The vault, after Destiny 1's: its weapons, armour and Vestiges, each a click from what the player carries. */
export interface Vault {
  readonly kept: readonly VaultShelf[];
  readonly carried: readonly VaultShelf[];
}

/** The vault's shelves and the player's, each cell a click to move it across. */
export function vaultOf(state: GearState): Vault {
  const shelves = (place: number, most: number): VaultShelf[] => {
    const moving = place === VAULTED ? 'Take out' : 'Put in the vault';
    const items = (weapons: boolean) =>
      state.items
        // A module carried stands on the ship's tab; one already in the vault is still shown, to be taken out.
        .filter(
          (item) => item.at === place && !(place === CARRIED && isModule(item.kind)) && isWeapon(item.kind) === weapons,
        )
        .map((item) =>
          cell(`item-${item.id}`, 'item', gearName(item), {
            rarity: item.rarity,
            item,
            press: {
              label: moving,
              ask: { kind: place === VAULTED ? ASKS.withdraw : ASKS.store, item: item.id },
              role: 'button',
            },
          }),
        );
    const vestiges = state.vestiges
      .filter((each) => each.vaulted === (place === VAULTED))
      .map((each) =>
        vestigeCell(each, vestigeHolds(each), {
          press: {
            label: moving,
            ask: { kind: place === VAULTED ? ASKS.withdrawVestige : ASKS.storeVestige, item: each.id },
            role: 'button',
          },
        }),
      );
    const [weapons, armour] = [items(true), items(false)];
    return [
      { name: 'Weapons', held: weapons.length, most, vestiges: false, cells: weapons },
      { name: 'Armour', held: armour.length, most, vestiges: false, cells: armour },
      { name: 'Vestiges', held: vestiges.length, most: most || VESTIGES_MOST, vestiges: true, cells: vestiges },
    ];
  };
  return { kept: shelves(VAULTED, VAULT_MOST), carried: shelves(CARRIED, 0) };
}
