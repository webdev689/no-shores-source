// What the menu's gear pages show, from the player's gear as the room sent it: the Character tab (their level,
// Prestige, Defense and Attack, and what each slot wears), a slot's choices, an item's detail with its nodes, and the
// vendors' wares. The page draws these in the Enhanced Plus kit.

import { LEVEL_BY_XP, LEVEL_MOST } from '../rules/fleetRules.ts';
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
  capital,
  isModule,
  itemWords,
  nodeShown,
  wearAsks,
} from '../player/gear.ts';
import { gearKindName, gearName, moduleNode, modulePresses } from './shipGear.ts';
import { earnedFrom } from '../player/sourceLooks.ts';

/** The menu's tabs, in the order the header shows them. */
export const TABS = ['character', 'inventory', 'journal', 'compendium', 'ship', 'social', 'guild', 'settings'] as const;
export type Tab = (typeof TABS)[number];
/** The screens a social space's counters open: the vault, each keeper's (npc/npcScreen.ts), the Harbourmaster's and
 *  the bounty board. */
export type Station = KeeperKind | 'harbourmaster' | 'board';
/** What the menu shows: a tab, or a station's screen. */
export type View = Tab | Station;
/** What a counter or a key opens: a view, and the inventory's shelf to open it at. */
export interface Opening {
  readonly view: View;
  readonly shelf?: string;
  /** Shuts the menu where it already stands at the view, as its key does. */
  readonly toggle?: boolean;
}
/** The page event that opens the menu at a view, as a station's counter does. */
export const OPEN_AT = 'overlook:gear';
/** The event the account's page sends once the player signs in or takes a username, so the banner names them. */
export const ACCOUNT_CHANGED = 'overlook:account';
/** The event sent once a player's guild changes (founded, joined, left), so the room reads their plate's tag again. */
export const GUILD_CHANGED = 'overlook:guild';
/** The event the Roster sends with each answer it hears, so the company on the HUD need not ask as well. */
export const ROSTER_HEARD = 'overlook:roster';

/** Whether the gear screen is open: while it is, the game's own keys and pointer rest. */
let screenOpen = false;
export const gearScreenOpen = (): boolean => screenOpen;
/** Whether the drawn menu takes the keys and the pad: while it is open. */
export const gearTakesKeys = (): boolean => screenOpen;
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

const colourOf = (rarity: number) => RARITIES[rarity]?.colour ?? '';

export function tileOf(item: GearItem): Tile {
  const power = item.attack || item.defense || item.prestige;
  const word = item.attack ? 'Attack' : item.defense ? 'Defense' : item.prestige ? 'Prestige' : '';
  return { id: item.id, name: gearName(item), colour: colourOf(item.rarity), power: word ? `${power} ${word}` : '' };
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
  // A module is fitted in its slot and infused, and its nodes are priced in the ship's materials; it keeps no look of
  // a content, as anything else does of where it was earned.
  const module = isModule(item.kind);
  if (!module) numbers.push(['From', capital(earnedFrom(item))]);
  const nodeAt = module ? moduleNode : nodeShown;
  return {
    name: gearName(item),
    colour: colourOf(item.rarity),
    kind: `${RARITIES[item.rarity]?.name ?? ''} ${gearKindName(item.kind)}${item.breach ? ' · from a Breach' : ''}`,
    numbers,
    columns: item.columns.map((column, index) => ({
      nodes: Array.from({ length: Math.max(1, column.traits.length) }, (unused, node) =>
        nodeAt(item, index, node),
      ).filter((node): node is NodeShown => node !== null),
    })),
    words: itemWords(item),
    presses: module ? modulePresses(item, state) : gearPresses(item, state, atVault),
  };
}

/** What may be done with a piece of the player's own gear from its page. */
function gearPresses(item: GearItem, state: GearState, atVault: boolean): Press[] {
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
  return presses;
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

/** The vendors by the gear crate's numbers (`Vendor::ALL`), and how many wares each sells a day (`vendor::WARES`): the
 *  message lists them vendor by vendor. */
const VENDORS = ['The Armorsmith', 'The Weaponsmith', 'The Shipwright'] as const;
export const WARES = 6;

/** The vendors' stalls: the Armorsmith's, the Weaponsmith's and the Shipwright's wares of the day, each bought for its
 *  price in Aurem. */
export function vendorsOf(state: GearState): readonly { readonly name: string; readonly wares: readonly Ware[] }[] {
  return VENDORS.map((name, vendor) => ({
    name,
    wares: state.wares.slice(vendor * WARES, (vendor + 1) * WARES).map((item, place) => ({
      tile: tileOf(item),
      kind: `${RARITIES[item.rarity]?.name ?? ''} ${gearKindName(item.kind)}`,
      level: item.level,
      price: item.price,
      affordable: state.aurem >= item.price,
      press: {
        label: `Hold to buy · ${item.price.toLocaleString()}`,
        ask: { kind: ASKS.vend, column: vendor, node: place, ...(state.day !== undefined && { item: state.day }) },
        role: 'button',
        held: true,
      },
    })),
  }));
}
