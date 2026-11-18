// What the gear screens show, from the player's gear as the room sent it: the Character tab (their level, Prestige,
// Defense and Attack, and what each slot wears), a slot's choices, an item's detail with its nodes, and the Inventory
// tab (materials, Vestiges and, in a social space, the vault). The page draws these in the Enhanced Plus kit.

import { ASKS, type GearAsk, type GearItem, type GearState } from '../network/gearMessages.ts';
import type { Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import {
  CARRIED,
  COLUMNS,
  KINDS,
  type NodeShown,
  RARITIES,
  SLOTS,
  VAULTED,
  WORN,
  itemName,
  itemWords,
  nodeShown,
  wearAsks,
} from '../player/gear.ts';

/** The player's gear here and the way to ask of it; null where no room keeps gear. */
export interface GearHere {
  readonly gear: GearState | null;
  ask(ask: GearAsk): void;
  /** The forge that draws the player and their items, and the player's dress, for the screens' pictures. */
  readonly forge: Cards | null;
  readonly dress: Dress | null;
}

/** A press a screen offers: its words, what it asks, and how it is painted (the kit's role). */
export interface Press {
  readonly label: string;
  readonly ask: GearAsk;
  readonly role: 'button' | 'primary' | 'warn';
  /** Held for a moment before it asks, as a Fruit of Dagon is eaten. */
  readonly held?: boolean;
}

/** An item as a tile shows it: its name in its rarity's colour and its main number. */
export interface Tile {
  readonly id: number;
  readonly name: string;
  readonly colour: string;
  readonly power: string;
}

/** The levels past XP: each needs the Prestige of the one before and eleven more (Gear as Claude Shapes It). */
const LEVEL_BY_XP = 20;
const LEVEL_MOST = 30;
const PRESTIGE_AT_21 = 21;
const PRESTIGE_A_LEVEL = 11;
const FRUIT_XP = 20_000;

/** The XP that reaches a level: 1,000 for each level below it, times that level. */
export const xpForLevel = (level: number): number => (1000 * (level - 1) * level) / 2;
const prestigeFor = (level: number): number => PRESTIGE_AT_21 + PRESTIGE_A_LEVEL * (level - 21);
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const colourOf = (rarity: number) => RARITIES[rarity]?.colour ?? '';

export function tileOf(item: GearItem): Tile {
  const power = item.attack || item.defense || item.prestige;
  const word = item.attack ? 'Attack' : item.prestige ? 'Prestige' : item.defense ? 'Defense' : '';
  return { id: item.id, name: itemName(item), colour: colourOf(item.rarity), power: word ? `${power} ${word}` : '' };
}

/** The Character tab: the player's level and how far to the next, their power, and each slot's worn item. */
export interface Character {
  readonly level: number;
  /** How far to the next level, 0 to 1, and the words for it; full at the last. */
  readonly toNext: number;
  readonly toNextWords: string;
  readonly prestige: number;
  readonly defense: number;
  readonly attack: readonly [number | null, number | null];
  readonly fruit: number;
  /** How far the next Fruit of Dagon has grown, past level 20's XP; null below it. */
  readonly fruitGrown: number | null;
  readonly slots: readonly { readonly slot: number; readonly name: string; readonly worn: Tile | null }[];
}

export function characterOf(state: GearState): Character {
  const earned = Number(state.xp);
  const below = state.level < LEVEL_BY_XP;
  const [toNext, toNextWords] = below
    ? [
        (earned - xpForLevel(state.level)) / (1000 * state.level),
        `${(xpForLevel(state.level + 1) - earned).toLocaleString()} XP to level ${state.level + 1}`,
      ]
    : state.level >= LEVEL_MOST
      ? [1, 'The highest level']
      : [
          state.prestige / prestigeFor(state.level + 1),
          `${prestigeFor(state.level + 1) - state.prestige} more Prestige for level ${state.level + 1}`,
        ];
  const past = earned - xpForLevel(LEVEL_BY_XP);
  // A hand holding no weapon (empty, or a shield) has no Attack.
  const hand = (slot: number) => {
    const attack = state.items.find((item) => item.at === WORN + slot)?.attack ?? 0;
    return attack > 0 ? attack : null;
  };
  return {
    level: state.level,
    toNext: Math.min(1, Math.max(0, toNext)),
    toNextWords,
    prestige: state.prestige,
    defense: state.defense,
    attack: [hand(0), hand(1)],
    fruit: state.stocks[4] ?? 0,
    fruitGrown: past >= 0 ? (past % FRUIT_XP) / FRUIT_XP : null,
    slots: SLOTS.map((name, slot) => {
      const worn = state.items.find((item) => item.at === WORN + slot);
      return { slot, name: capital(name), worn: worn ? tileOf(worn) : null };
    }),
  };
}

/** An item's detail: its name and kind, numbers, XP, each column of nodes, its words and what may be done with it. */
export interface ItemDetail {
  readonly name: string;
  readonly colour: string;
  readonly kind: string;
  readonly numbers: readonly (readonly [string, string])[];
  /** Its XP toward its last column, 0 to 1, and the words for it. */
  readonly xp: number;
  readonly xpWords: string;
  readonly columns: readonly { readonly heading: string; readonly nodes: readonly NodeShown[] }[];
  readonly words: string;
  readonly presses: readonly Press[];
}

export function itemDetailOf(item: GearItem, state: GearState): ItemDetail {
  const kind = KINDS[item.kind] ?? '';
  const numbers: [string, string][] = [];
  if (item.attack) numbers.push(['Attack', String(item.attack)]);
  if (item.defense) numbers.push(['Defense', String(item.defense)]);
  if (item.prestige) numbers.push(['Prestige', String(item.prestige)]);
  numbers.push(['Level', String(item.level)]);
  const presses: Press[] = [];
  if (item.at >= WORN)
    presses.push({ label: 'Take off', ask: { kind: ASKS.takeOff, slot: item.at - WORN }, role: 'button' });
  if (item.at === CARRIED) {
    for (const wear of wearAsks(item)) presses.push({ ...wear, role: 'primary' });
    if (state.social)
      presses.push({ label: 'Put in the vault', ask: { kind: ASKS.store, item: item.id }, role: 'button' });
    presses.push({ label: 'Dismantle', ask: { kind: ASKS.dismantle, item: item.id }, role: 'warn' });
  }
  if (item.at === VAULTED)
    presses.push({ label: 'Take out of the vault', ask: { kind: ASKS.withdraw, item: item.id }, role: 'button' });
  if (item.columns.length > 0 && item.xp < item.xpMost && (state.stocks[4] ?? 0) > 0)
    presses.push({
      label: 'Hold to feed a Fruit of Dagon',
      ask: { kind: ASKS.feed, item: item.id },
      role: 'button',
      held: true,
    });
  return {
    name: itemName(item),
    colour: colourOf(item.rarity),
    kind: `${RARITIES[item.rarity]?.name ?? ''} ${capital(kind)}${item.breach ? ' · from a Breach' : ''}`,
    numbers,
    xp: item.xpMost > 0 ? Math.min(1, item.xp / item.xpMost) : 1,
    xpWords: item.xpMost > 0 ? `XP ${item.xp.toLocaleString()} of ${item.xpMost.toLocaleString()}` : '',
    columns: item.columns.map((column, index) => ({
      heading: `${COLUMNS[column.kind] ?? ''} · ${column.xp.toLocaleString()} XP`,
      nodes: Array.from({ length: Math.max(1, column.traits.length) }, (unused, node) =>
        nodeShown(item, index, node),
      ).filter((node): node is NodeShown => node !== null),
    })),
    words: itemWords(item),
    presses,
  };
}

/** A vendor's ware as the Vendors tab shows it: the item's tile and kind, and its purchase. */
export interface Ware {
  readonly tile: Tile;
  readonly kind: string;
  readonly level: number;
  readonly price: number;
  readonly affordable: boolean;
  readonly press: Press;
}

/** The Vendors tab: the Quartermaster's and the Armsmith's wares of the day, each bought for its price in Aurem. */
export function vendorsOf(state: GearState): readonly { readonly name: string; readonly wares: readonly Ware[] }[] {
  const names = ['The Quartermaster', 'The Armsmith'];
  const half = state.wares.length / 2;
  return names.map((name, vendor) => ({
    name,
    wares: state.wares.slice(vendor * half, (vendor + 1) * half).map((item) => ({
      tile: tileOf(item),
      kind: `${RARITIES[item.rarity]?.name ?? ''} ${capital(KINDS[item.kind] ?? '')}`,
      level: item.level,
      price: item.price,
      affordable: state.aurem >= item.price,
      press: {
        label: `Buy · ${item.price.toLocaleString()} Aurem`,
        ask: { kind: ASKS.vend, column: vendor, node: item.id },
        role: 'primary',
      },
    })),
  }));
}
