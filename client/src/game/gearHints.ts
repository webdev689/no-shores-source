// What the menu's footer says each view's presses and keys do and each inventory shelf's cells', and what an item's
// page says over its node grid.
import { DISMANTLE_KEY } from './gearHold.ts';
import type { Hint } from './gearNodes.ts';
import type { View } from './gearScreen.ts';

/** What the footer says each view's presses and keys do, and what an item's page says over its node grid. */
export const HINTS: Readonly<Partial<Record<View | 'item', readonly Hint[]>>> = {
  // A worn piece is not dismantled; a carried one's card in the flyout says how.
  character: [
    ['Click', 'Swap'],
    ['Right-click / details', 'Details'],
  ],
  social: [
    ['Click', 'Choose a player'],
    ['Esc', 'Close a panel'],
  ],
  vault: [
    ['Click', 'Put in or take out'],
    ['Right-click / details', 'Details'],
    [DISMANTLE_KEY, 'Hold to dismantle'],
  ],
  harbourmaster: [['Hold', 'Buy']],
  ship: [['Click', 'Open a module or an officer']],
  board: [['Click / E', 'Take or turn in']],
  mail: [['Click / E', 'Take']],
  journal: [['T', 'Timers']],
  item: [
    ['Hold', 'Buy'],
    ['Click', 'Choose'],
  ],
};
/** What the inventory's shelves' cells show. */
export const SHELF_HINTS: Readonly<Record<string, readonly Hint[]>> = {
  consumables: [['Hover', 'What it does']],
  materials: [['Hover', 'Where it is from']],
};
