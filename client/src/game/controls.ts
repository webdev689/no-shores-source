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
      bound('Walk. Hanging from a ledge, A and D move along it and W climbs over.', 'forward', 'left', 'back', 'right'),
      bound('Hold to run, or to gallop on your horse.', 'run'),
      bound('Jump. At a low wall, vault it or climb onto it; held into a higher one, catch its top and hang.', 'jump'),
      bound('Crouch or stand up. Hanging, let go.', 'crouch'),
      bound('Get on your horse, or get down.', 'mount'),
      keyed(
        'E',
        'Use what is within reach: a keeper, a gate or something to gather. The prompt over your bars names it.',
      ),
    ],
  },
  {
    name: 'Fight',
    controls: [
      bound('Draw your weapon, or put it away.', 'ready'),
      bound('Draw your Melee loadout.', 'melee'),
      bound('Draw your Ranged loadout.', 'ranged'),
      bound('Swing, and hold to keep swinging. With a bow, a crossbow or a gun, hold to aim.', 'swing'),
      bound('Guard, and press just as a blow lands to parry. With a bow, a crossbow or a gun, fire.', 'guard'),
      bound('Dodge the way you move, or straight back.', 'dodge'),
      bound('Drink a healing charge.', 'heal'),
      keyed('Enter', 'Stand again once you have fallen.'),
    ],
  },
  {
    name: 'Arts',
    controls: [
      bound('Cast the Anima of the Art you wear, once it is ready.', 'anima'),
      bound("Cast its first Tenet. Shadow's Dusk Daggers aim while Q is held and whirl where you let go.", 'tenetOne'),
      bound('Cast its second Tenet.', 'tenetTwo'),
    ],
  },
  {
    name: 'Camera',
    controls: [
      keyed('Left button', 'Click the view to look round with the mouse. Esc lets the mouse go.'),
      bound('Turn the view.', 'turnLeft', 'turnRight'),
      bound('Look up or down.', 'lookUp', 'lookDown'),
      keyed('Wheel', 'Pull back into third person and further, or come back into first person.'),
      bound('Switch straight between first and third person.', 'perspective'),
    ],
  },
  {
    name: 'Menus',
    controls: [
      keyed('M', 'Open the menu: carry on, go back to your ship, or go ashore.'),
      keyed('I', 'Open your Character page.'),
      keyed('O', 'Open your Inventory.'),
      keyed('X', 'In the menu, show the details of what is chosen.'),
      keyed('Tab', 'Move to the next thing in a window. Enter or Space presses it.'),
      keyed('Esc', 'Close a window, step back or put the map away, or let the mouse go.'),
      keyed('K', 'Open or close this list.'),
    ],
  },
  {
    name: 'Sea',
    controls: [
      keyed(
        'Left button',
        "Click the sea or the land to sail there, a port to sail for it, or a hostile ship's mark to chase it.",
      ),
      keyed('W', 'Sail straight on.'),
      keyed('A / D', 'Steer.'),
      keyed('S', 'Heave to.'),
      keyed('Space', 'Stop the voyage, or resume it.'),
      keyed('[ / ]', 'Sail slower or faster.'),
      keyed('Drag', 'Turn the view round the ship. On the map, move the map.'),
      keyed('Wheel', 'Zoom in and out, down close to the ship. On the map, zoom the map.'),
      keyed('N', 'Go to the helm and raise the map, to choose where to sail.'),
      keyed('Enter', 'Set sail from the map, land where you chose, chase the ship you chose, or dock where offered.'),
      keyed('L', 'Dock or go ashore, when the sea offers it.'),
      keyed('B', 'Manage the ship, or go back to the sea.'),
      keyed('R', 'While you manage the ship, ask for its repair.'),
      keyed('H', 'Leave the helm and walk the deck.'),
      keyed('E', 'On the deck, take the helm again.'),
    ],
  },
  {
    name: 'Sea fight',
    controls: [
      keyed('W / S', 'Set more sail, or take some in.'),
      keyed('Shift', 'A burst of speed.'),
      keyed('Right button', 'Hold to aim the guns where you look, and let go to fire.'),
      keyed('Left button', 'While aiming, hold your fire.'),
      keyed('Wheel', 'While aiming, change the shot.'),
      keyed('C', 'Brace against a broadside.'),
      keyed('E', 'Board a captain who struck alongside. On their deck, go back aboard your ship.'),
    ],
  },
];
