// What the menu's gear pages show, from the player's gear as the room sent it: the Character tab (their level,
// Prestige, Defense and Attack, and what each slot wears), a slot's choices, an item's detail with its nodes, and the
// vendors' wares. The page draws these in the Enhanced Plus kit.

import { ASKS, type GearAsk, type GearItem, type GearState } from '../network/gearMessages.ts';
import type { KeeperKind } from './keepers.ts';
import type { Cards } from '../player/cards.ts';
import type { Dress } from '../player/dressing.ts';
import {
  CARRIED,
  type NodeShown,
  RARITIES,
  SLOTS,
  VAULTED,
  WORN,
  itemName,
  itemWords,
  kindName,
  nodeShown,
  wearAsks,
} from '../player/gear.ts';

/** The menu's tabs, in the order the header shows them. */
export const TABS = ['character', 'inventory', 'journal', 'ship', 'social', 'guild', 'settings'] as const;
export type Tab = (typeof TABS)[number];
/** The screens a social space's counters open: the vault, each keeper's (npc/npcScreen.ts), and the bounty board. */
export type Station = KeeperKind | 'board';
/** What the menu shows: a tab, or a station's screen. */
export type View = Tab | Station;
/** What a counter or a key opens: a view, and the inventory's shelf to open it at. */
export interface Opening {
  readonly view: View;
  readonly shelf?: string;
}
/** The page event that opens the menu at a view, as a station's counter does. */
export const OPEN_AT = 'overlook:gear';
/** The event Escape sends the page shown before the menu steps back: a page with a step of its own (a panel, a
 *  player's details) takes it, cancelling the event, and the menu stays. */
export const STEP_BACK = 'overlook:step-back';
/** The event the account's page sends once the player signs in or takes a username, so the banner names them. */
export const ACCOUNT_CHANGED = 'overlook:account';
/** The event the Roster sends with each answer it hears, so the company on the HUD need not ask as well. */
export const ROSTER_HEARD = 'overlook:roster';

/** Whether the gear screen is open: while it is, the game's own keys and pointer rest. */
let screenOpen = false;
export const gearScreenOpen = (): boolean => screenOpen;
export function setGearScreenOpen(open: boolean): void {
  screenOpen = open;
}

/** Opens the menu at a view, wherever it was started. */
export function openGearWindow(opening: Opening): void {
  dispatchEvent(new CustomEvent<Opening>(OPEN_AT, { detail: opening }));
}

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
  /** What the item does once the hold acts: breaks apart, dismantled, or takes something in, fed. */
  readonly burst?: 'shatter' | 'pulse';
}

/** An item as a tile shows it: its name in its rarity's colour and its main number. */
export interface Tile {
  readonly id: number;
  readonly name: string;
  readonly colour: string;
  readonly power: string;
}

/** The levels XP alone reaches, and the highest. */
const LEVEL_BY_XP = 20;
const LEVEL_MOST = 30;

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const colourOf = (rarity: number) => RARITIES[rarity]?.colour ?? '';

export function tileOf(item: GearItem): Tile {
  const power = item.attack || item.defense || item.prestige;
  const word = item.attack ? 'Attack' : item.defense ? 'Defense' : item.prestige ? 'Prestige' : '';
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
  const level = state.level;
  const needs = (state.toNextNeeds ?? 0).toLocaleString();
  const toNextWords =
    level >= LEVEL_MOST
      ? 'The highest level'
      : level < LEVEL_BY_XP
        ? `${needs} XP to level ${level + 1}`
        : `${needs} more Prestige for level ${level + 1}`;
  // A loadout not worn has no Attack.
  const hand = (slot: number) => {
    const attack = state.items.find((item) => item.at === WORN + slot)?.attack ?? 0;
    return attack > 0 ? attack : null;
  };
  return {
    level: state.level,
    toNext: level >= LEVEL_MOST ? 1 : Math.min(1, Math.max(0, state.toNext ?? 0)),
    toNextWords,
    prestige: state.prestige,
    defense: state.defense,
    attack: [hand(0), hand(1)],
    fruit: state.stocks[4] ?? 0,
    fruitGrown: state.fruitGrowing ?? null,
    slots: SLOTS.map((name, slot) => {
      const worn = state.items.find((item) => item.at === WORN + slot);
      return { slot, name: capital(name), worn: worn ? tileOf(worn) : null };
    }),
  };
}

/** An item's detail: its name and kind, numbers, each column of nodes, its words and what may be done with it. */
export interface ItemDetail {
  readonly name: string;
  readonly colour: string;
  readonly kind: string;
  readonly numbers: readonly (readonly [string, string])[];
  readonly columns: readonly { readonly nodes: readonly NodeShown[] }[];
  readonly words: string;
  readonly presses: readonly Press[];
}

/** An item's detail; `atVault`, seen at the vault's counter, where it may be put in or taken out. */
export function itemDetailOf(item: GearItem, state: GearState, atVault = false): ItemDetail {
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
    if (atVault) presses.push({ label: 'Put in the vault', ask: { kind: ASKS.store, item: item.id }, role: 'button' });
    presses.push({
      label: 'Hold to dismantle',
      ask: { kind: ASKS.dismantle, item: item.id },
      role: 'warn',
      held: true,
      burst: 'shatter',
    });
  }
  if (item.at === VAULTED && atVault)
    presses.push({ label: 'Take out of the vault', ask: { kind: ASKS.withdraw, item: item.id }, role: 'button' });
  if (item.columns.length > 0 && item.at !== VAULTED && item.xp < item.xpMost && (state.stocks[4] ?? 0) > 0)
    presses.push({
      label: 'Hold to feed a Fruit of Dagon',
      ask: { kind: ASKS.feed, item: item.id },
      role: 'button',
      held: true,
      burst: 'pulse',
    });
  return {
    name: itemName(item),
    colour: colourOf(item.rarity),
    kind: `${RARITIES[item.rarity]?.name ?? ''} ${kindName(item.kind)}${item.breach ? ' · from a Breach' : ''}`,
    numbers,
    columns: item.columns.map((column, index) => ({
      nodes: Array.from({ length: Math.max(1, column.traits.length) }, (unused, node) =>
        nodeShown(item, index, node),
      ).filter((node): node is NodeShown => node !== null),
    })),
    words: itemWords(item),
    presses,
  };
}

/** A vendor's ware as its stall shows it: the item's tile and kind, and its purchase. */
export interface Ware {
  readonly tile: Tile;
  readonly kind: string;
  readonly level: number;
  readonly price: number;
  readonly affordable: boolean;
  readonly press: Press;
}

/** The smiths' stalls: the Armorsmith's and the Weaponsmith's wares of the day, each bought for its price in Aurem. */
export function vendorsOf(state: GearState): readonly { readonly name: string; readonly wares: readonly Ware[] }[] {
  const names = ['The Armorsmith', 'The Weaponsmith'];
  const half = state.wares.length / 2;
  return names.map((name, vendor) => ({
    name,
    wares: state.wares.slice(vendor * half, (vendor + 1) * half).map((item) => ({
      tile: tileOf(item),
      kind: `${RARITIES[item.rarity]?.name ?? ''} ${kindName(item.kind)}`,
      level: item.level,
      price: item.price,
      affordable: state.aurem >= item.price,
      press: {
        label: `Hold to buy · ${item.price.toLocaleString()}`,
        ask: { kind: ASKS.vend, column: vendor, node: item.id, ...(state.day !== undefined && { item: state.day }) },
        role: 'button',
        held: true,
      },
    })),
  }));
}
