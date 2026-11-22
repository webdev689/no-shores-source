// Every control the game binds, as the sheet K opens lists them: in groups, each row a few words on what it does, the
// controls it stands for (`binds.ts`), and its keys and the pad's buttons as bound now. A mouse's gesture or a
// window's own key is written where it is not bound.
import { type BindId, type Binds, type Device, type Slot, isStickWay } from '../player/binds.ts';
import { BINDS } from '../player/input.ts';
import type { ShipKeys } from '../ships/shipAbilities.ts';

/** One row of the sheet: what it does (on the pad, where that differs), the controls it stands for, and the keys or
 *  the pad's buttons written where they are not bound (`pad:` names a pad's). */
export interface Row {
  readonly does: string;
  readonly padDoes?: string;
  readonly binds: readonly BindId[];
  readonly keys?: string;
  readonly pad?: string;
}

/** A group of the sheet: its name and its rows. */
export interface ControlGroup {
  readonly name: string;
  readonly controls: readonly Row[];
}

/** How a key is named on the sheet and the strip; a letter or a sign is named by itself. */
const NAMES: Readonly<Record<string, string>> = {
  ' ': 'Space',
  shift: 'Shift',
  control: 'Ctrl',
  alt: 'Alt',
  enter: 'Enter',
  backspace: 'Backspace',
  capslock: 'Caps Lock',
  arrowleft: 'Left arrow',
  arrowright: 'Right arrow',
  arrowup: 'Up arrow',
  arrowdown: 'Down arrow',
  insert: 'Insert',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  mouse0: 'Left button',
  mouse1: 'Middle button',
  mouse2: 'Right button',
  mouse3: 'Back side button',
  mouse4: 'Forward side button',
};
export const keyName = (key: string): string => NAMES[key] ?? key.toUpperCase();
/** A pad's button as the sheet and the strip name it, to be drawn: `pad:` before its own name. */
export const padName = (button: string): string => `pad:${button}`;

const row = (does: string, ...binds: BindId[]): Row => ({ does, binds });
/** A row the keys alone do, its pad side written (or none). */
const fixed = (keys: string, does: string, pad?: string): Row => ({ does, binds: [], keys, ...(pad && { pad }) });
const LEFT_STICK = padName('Left stick');
const RIGHT_STICK = padName('Right stick');

export const CONTROL_GROUPS: readonly ControlGroup[] = [
  {
    name: 'Move',
    controls: [
      { ...row('Move; climb', 'forward', 'left', 'back', 'right'), pad: LEFT_STICK },
      row('Run; gallop', 'run'),
      row('Jump; vault', 'jump'),
      row('Crouch; let go', 'crouch'),
      row('Mount or dismount', 'mount'),
      row('Use', 'use'),
    ],
  },
  {
    name: 'Fight',
    controls: [
      row('Draw or sheathe', 'ready'),
      row('Melee loadout', 'melee'),
      row('Ranged loadout', 'ranged'),
      { ...row('Swing; aim', 'swing'), padDoes: 'Swing; fire' },
      { ...row('Guard, parry; fire', 'guard'), padDoes: 'Guard, parry; aim' },
      row('Dodge', 'dodge'),
      row('Heal', 'heal'),
      row('Respawn', 'respawn'),
    ],
  },
  {
    name: 'Arts',
    controls: [
      row('Anima', 'anima'),
      row('First Tenet; hold aims daggers', 'tenetOne'),
      row('Second Tenet', 'tenetTwo'),
    ],
  },
  {
    name: 'Camera',
    controls: [
      fixed('Left button', 'Look round', RIGHT_STICK),
      { ...row('Turn', 'turnLeft', 'turnRight'), pad: RIGHT_STICK },
      { ...row('Look up or down', 'lookUp', 'lookDown'), pad: RIGHT_STICK },
      fixed('Wheel', 'Zoom out or in'),
      row('First or third person', 'perspective'),
    ],
  },
  {
    name: 'Menus',
    controls: [
      row('Menu', 'menu'),
      row('Map', 'landMap'),
      row('Character', 'character'),
      row('Inventory', 'inventory'),
      row('Details', 'details'),
      fixed('Tab', 'Next', padName('D-pad')),
      fixed('Left arrow / Right arrow', 'Tabs', `${padName('LB')} / ${padName('RB')}`),
      fixed('Esc', 'Back; free the mouse', padName('B')),
      row('All controls', 'controls'),
    ],
  },
  {
    name: 'Sea',
    controls: [
      fixed('Left button', 'Sail there'),
      row('Sail on', 'sailOn'),
      { ...row('Steer', 'steerLeft', 'steerRight'), pad: LEFT_STICK },
      row('Heave to', 'heaveTo'),
      row('Stop or resume', 'voyage'),
      row('Slower or faster', 'slower', 'faster'),
      fixed('Drag', 'Turn the view', RIGHT_STICK),
      fixed('Wheel', 'Zoom'),
      row('Map', 'map'),
      row('Set sail; land; dock', 'confirm'),
      row('Dock or go ashore', 'ashore'),
      row('Manage the ship', 'manage'),
      row('Repair', 'repair'),
      row('Leave the helm', 'leaveHelm'),
      row('Take the helm', 'use'),
    ],
  },
  {
    name: 'Sea fight',
    controls: [
      { ...row('Steer', 'fightLeft', 'fightRight'), pad: LEFT_STICK },
      { ...row('Sails', 'sailsUp', 'sailsDown'), pad: LEFT_STICK },
      row('Burst', 'burst'),
      { ...row('Aim; let go to fire', 'aim'), padDoes: 'Aim; let go holds fire' },
      row('Fire', 'fire'),
      row('Hold fire', 'holdFire'),
      { ...row('Change shot', 'shotBack', 'shotNext'), keys: 'Wheel' },
      row('Brace', 'brace'),
      row('Board; go back aboard', 'use'),
    ],
  },
];

/** One key or button a row shows: its name as drawn, and the slot it is bound in, where it can be bound anew. */
export interface Cell {
  readonly name: string;
  readonly slot: Slot | null;
}

/** What a row shows for `device` under `binds`: each bound key or button in its slot (a control bound to none shows
 *  an empty one, `—`), or the written keys, which no slot holds; a stick's way is never bound, so stands in none. */
export function cellsOf(control: Row, device: Device, binds: Binds): Cell[] {
  const written = device === 'keys' ? control.keys : control.pad;
  if (written !== undefined) return written.split(' / ').map((name) => ({ name, slot: null }));
  const named = (name: string) => (device === 'keys' ? keyName(name) : padName(name));
  return control.binds.flatMap((id) => {
    const bound = binds[id][device];
    if (bound.length === 0) return [{ name: '—', slot: { id, device, place: 0 } }];
    return bound.map((name, place) => ({ name: named(name), slot: isStickWay(name) ? null : { id, device, place } }));
  });
}

/** What a row does, said for `device`. */
export const doesFor = (control: Row, device: Device): string =>
  device === 'pad' ? (control.padDoes ?? control.does) : control.does;

/** The few words naming a control, as a swap or a refusal says it: its row's in the sheet. */
export function controlWords(id: BindId): string {
  const found = CONTROL_GROUPS.flatMap((group) => group.controls).find((control) => control.binds.includes(id));
  return found?.does ?? id;
}

/** A control's first key or button in words, for the keys or the pad last used: E, or X; none where it has none. */
export function boundWord(id: BindId, device: Device = BINDS.device, binds: Binds = BINDS.now): string {
  const [first] = binds[id][device];
  if (first === undefined) return '';
  return device === 'keys' ? keyName(first) : first;
}

/** `words` with a control's first key or button after them, as a press says it ("Map  N"); alone where it has none. */
export function withKey(words: string, id: BindId): string {
  const key = boundWord(id);
  return key ? `${words}  ${key}` : words;
}

/** A control's key as a line asks for it, as a keycap draws it with `cap`: on the keys its first that is no mouse
 *  button (a key works whether the pointer is free or held), else its first; on the pad its first button. */
export function askedKey(id: BindId, cap = false, device: Device = BINDS.device, binds: Binds = BINDS.now): string {
  const bound = binds[id][device];
  const first = device === 'keys' ? (bound.find((key) => !key.startsWith('mouse')) ?? bound[0]) : bound[0];
  if (first === undefined) return '';
  return device === 'keys' ? keyName(first) : cap ? padName(first) : first;
}

/** A control's first key or button as a keycap draws it (`pad:` before a pad's); none where it has none. */
export function boundCap(id: BindId, device: Device = BINDS.device, binds: Binds = BINDS.now): string {
  const [first] = binds[id][device];
  if (first === undefined) return '';
  return device === 'keys' ? keyName(first) : padName(first);
}

/** The keycaps of the ship's bar in a sea fight, for the keys or the pad last used: the broadsides' (the aim's, whose
 *  release fires on the keys; the fire's on the pad), the burst's, the brace's and the next load's, which on the keys
 *  is the wheel while no key is bound to it. */
export function shipKeys(device: Device = BINDS.device, binds: Binds = BINDS.now): ShipKeys {
  const cap = (id: BindId) => boundCap(id, device, binds);
  const load = cap('shotNext');
  return {
    aim: (device === 'pad' && cap('fire')) || cap('aim'),
    burst: cap('burst'),
    brace: cap('brace'),
    load: load === '' && device === 'keys' ? 'Wheel' : load,
  };
}
