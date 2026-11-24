// Pictures of an item's page and cards, headless (`tools/uiShot.mjs`): the menu as the game opens it over sample gear
// that carries a Legendary sword with its whole grid, an Atheric bow and a Legendary helm beside what is worn, so a
// shot's events can open a slot's flyout, hover a piece's card or open its page; its fight numbers asked of the room's
// rules as the game asks them. The game never imports it.
import type { GearColumn, GearItem, GearState } from '../network/gearMessages.ts';
import { NONE } from '../network/gearMessages.ts';
import { WORN } from '../player/gear.ts';
import { fetchRoomWasm, startCombatRules } from '../rules/combatRules.ts';
import type { Node } from '../ui/node.ts';
import type { Interface } from '../ui/ui.ts';
import { sampleGear, sampleItem } from './gearShots.ts';
import { setItemRules } from './itemStats.ts';
import { menuShot } from './mountShots.ts';
import { InspectWindow } from './social/inspectWindow.ts';
import { INSPECTED } from './social/socialShots.ts';

// The fight numbers are the room's rules', as in the game.
setItemRules(startCombatRules(await WebAssembly.compileStreaming(fetchRoomWasm(import.meta.env.BASE_URL))));

/** A column of `traits` (an upgrade's none) of a kind, unlocked at `xp`, costing a Legendary's node. */
const column = (kind: number, traits: readonly string[], unlocks: number, last = false): GearColumn => ({
  kind,
  traits,
  xp: unlocks,
  aurem: kind === 0 ? (last ? 1_500 : 1_000) : kind === 4 ? 2_500 : 800,
  fragments: kind === 0 ? (last ? 0 : 5) : kind === 4 ? 4 : 2,
  essence: last ? 6 : kind === 4 ? 1 : 0,
  resource: last ? 0 : kind === 0 || kind === 4 ? 10 : 5,
});

/** The bits of the nodes bought, by their places in the item's run of nodes. */
const bits = (...places: readonly number[]): number => places.reduce((all, place) => all | (1 << place), 0);

/** A Legendary sword, carried: its handling, a perk and its finish bought, halfway up its grid. */
export const SWORD: GearItem = sampleItem({
  id: 21,
  kind: 2,
  rarity: 3,
  level: 20,
  name: 1,
  resource: 1,
  attack: 272,
  element: 2,
  source: 2,
  xp: 52_000,
  xpMost: 90_000,
  columns: [
    column(1, ['light_grip', 'heavy_head', 'keen_edge'], 10_000),
    column(0, [], 20_000),
    column(3, ['bloodletter', 'executioner'], 30_000),
    column(0, [], 40_000),
    column(2, ['honed', 'balanced'], 50_000),
    column(3, ['riposte_master', 'exploit'], 60_000),
    column(0, [], 70_000, true),
    column(0, [], 80_000, true),
    column(0, [], 90_000, true),
  ],
  bought: bits(0, 1, 3, 4, 6, 7),
  chosen: [0, NONE, 0, NONE, 0, NONE, NONE, NONE, NONE],
  at: 0,
  bucket: 0,
});

/** Gullwing, an Atheric bow, worn: its own node not yet chosen. */
export const GULLWING: GearItem = sampleItem({
  id: 22,
  kind: 8,
  rarity: 4,
  level: 20,
  named: 'gullwing',
  resource: 4,
  attack: 288,
  element: 2,
  source: 3,
  xp: 70_000,
  xpMost: 135_000,
  columns: [
    column(1, ['quick_hands', 'steady_draw', 'light_stock'], 15_000),
    column(0, [], 30_000),
    column(4, ['squall_line'], 45_000),
    column(0, [], 60_000),
    column(2, ['attuned', 'spellfeed'], 75_000),
    column(3, ['long_shot', 'shocking_rounds'], 90_000),
    column(0, [], 105_000, true),
    column(0, [], 120_000, true),
    column(0, [], 135_000, true),
  ],
  bought: bits(1, 3, 5),
  chosen: [1, NONE, NONE, NONE, NONE, NONE, NONE, NONE, NONE],
  at: WORN + 1,
  bucket: 1,
});

/** A Legendary helm, carried beside the Magic one worn. */
export const HELM: GearItem = sampleItem({
  id: 23,
  kind: 13,
  rarity: 3,
  level: 20,
  name: 2,
  resource: 2,
  defense: 118,
  prestige: 21,
  source: 1,
  xp: 32_000,
  xpMost: 60_000,
  columns: [
    column(3, ['second_wind', 'sure_footing'], 10_000),
    column(0, [], 20_000),
    column(3, ['unshaken', 'hardy'], 30_000),
    column(0, [], 40_000, true),
    column(3, ['scholar', 'forager'], 50_000),
    column(0, [], 60_000, true),
  ],
  bought: bits(0, 2, 3),
  chosen: [0, NONE, 0, NONE, NONE, NONE],
  at: 0,
  bucket: 2,
});

/** The sample gear, at level 24, with the sword and the helm carried and Gullwing worn in the bow's place. */
export function itemGear(): GearState {
  const sample = sampleGear();
  const items = sample.items.filter((each) => each.at !== WORN + 1);
  return {
    ...sample,
    level: 24,
    aurem: 24_745,
    stocks: [14, 6, 8, 3, 3],
    resources: [4, 32, 12, 1, 9],
    items: [...items, SWORD, GULLWING, HELM],
  };
}

/** The menu at the Character tab over `itemGear`, started afresh for each shot's interface, so no shot's flyout or
 *  page is left open in the next. */
export function itemMenu(ui: Interface): Node {
  if (shown?.ui !== ui) shown = { ui, build: menuShot('character', itemGear()) };
  return shown.build(ui);
}
let shown: { readonly ui: Interface; readonly build: (ui: Interface) => Node } | null = null;

/** Inspect on another player, each piece's card set beside the one `itemGear` wears in its slot. */
const inspecting = new InspectWindow(() => null);
inspecting.mine = itemGear;
export function inspectCompare(ui: Interface): Node {
  const shown = inspecting.node(ui, ui.size, { name: 'ChiefKabr', details: INSPECTED, dress: null }, () => undefined);
  return { width: 'grow', height: 'grow', fill: '#1a1f27', children: [shown] };
}
