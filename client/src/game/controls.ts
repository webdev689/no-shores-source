// Every control the game binds, as the sheet K opens lists them: in groups, each control its keys and a sentence on
// what it does. A control on one of the player's bindings (`BINDINGS`) shows that binding's own keys.
import { type Action, BINDINGS } from '../player/input.ts';

/** One control: its keys (keys that do the same parted by " / "), what it does, and the bindings it stands for. */
export interface Control {
  readonly keys: string;
  readonly does: string;
  readonly binds: readonly Action[];
}

/** A group of the sheet: its name and its controls. */
export interface ControlGroup {
  readonly name: string;
  readonly controls: readonly Control[];
}

/** How a binding's key is named on the sheet and the strip; a letter or a sign is named by itself. */
const NAMES: Readonly<Record<string, string>> = {
  ' ': 'Space',
  shift: 'Shift',
  arrowleft: 'Left arrow',
  arrowright: 'Right arrow',
  insert: 'Insert',
  delete: 'Delete',
  mouse0: 'Left button',
  mouse2: 'Right button',
  mouse3: 'Back side button',
  mouse4: 'Forward side button',
};
export const keyName = (key: string): string => NAMES[key] ?? key.toUpperCase();

/** A control on `binds`, showing their keys in that order. */
const bound = (does: string, ...binds: Action[]): Control => ({
  keys: binds.flatMap((action) => BINDINGS[action].map(keyName)).join(' / '),
  does,
  binds,
});
/** A control the game hears outside the bindings, on `keys`. */
const keyed = (keys: string, does: string): Control => ({ keys, does, binds: [] });

export const CONTROL_GROUPS: readonly ControlGroup[] = [
  {
    name: 'Move',
    controls: [
      bound('Move; climb', 'forward', 'left', 'back', 'right'),
      bound('Run; gallop', 'run'),
      bound('Jump; vault', 'jump'),
      bound('Crouch; let go', 'crouch'),
      bound('Mount or dismount', 'mount'),
      keyed('E', 'Use'),
    ],
  },
  {
    name: 'Fight',
    controls: [
      bound('Draw or sheathe', 'ready'),
      bound('Melee loadout', 'melee'),
      bound('Ranged loadout', 'ranged'),
      bound('Swing; aim', 'swing'),
      bound('Guard, parry; fire', 'guard'),
      bound('Dodge', 'dodge'),
      bound('Heal', 'heal'),
      keyed('Enter', 'Respawn'),
    ],
  },
  {
    name: 'Arts',
    controls: [bound('Anima', 'anima'), bound('First Tenet', 'tenetOne'), bound('Second Tenet', 'tenetTwo')],
  },
  {
    name: 'Camera',
    controls: [
      keyed('Left button', 'Look round'),
      bound('Turn', 'turnLeft', 'turnRight'),
      bound('Look up or down', 'lookUp', 'lookDown'),
      keyed('Wheel', 'Zoom out or in'),
      bound('First or third person', 'perspective'),
    ],
  },
  {
    name: 'Menus',
    controls: [
      keyed('M', 'Menu'),
      keyed('N', 'Map'),
      keyed('I', 'Character'),
      keyed('O', 'Inventory'),
      keyed('X', 'Details'),
      keyed('Tab', 'Next'),
      keyed('Esc', 'Back; free the mouse'),
      keyed('K', 'All controls'),
    ],
  },
  {
    name: 'Sea',
    controls: [
      keyed('Left button', 'Sail there'),
      keyed('W', 'Sail on'),
      keyed('A / D', 'Steer'),
      keyed('S', 'Heave to'),
      keyed('Space', 'Stop or resume'),
      keyed('[ / ]', 'Slower or faster'),
      keyed('Drag', 'Turn the view'),
      keyed('Wheel', 'Zoom'),
      keyed('N', 'Map'),
      keyed('Enter', 'Set sail; land; dock'),
      keyed('L', 'Dock or go ashore'),
      keyed('B', 'Manage the ship'),
      keyed('R', 'Repair'),
      keyed('H', 'Leave the helm'),
      keyed('E', 'Take the helm'),
    ],
  },
  {
    name: 'Sea fight',
    controls: [
      keyed('W / S', 'Sails'),
      keyed('Shift', 'Burst'),
      keyed('Right button', 'Aim; let go to fire'),
      keyed('Left button', 'Hold fire'),
      keyed('Wheel', 'Change shot'),
      keyed('C', 'Brace'),
      keyed('E', 'Board; go back aboard'),
    ],
  },
];
