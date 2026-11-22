// Every control the player binds: the keys and the pad's buttons each is on until the player binds it otherwise, and
// where in the game it acts, so binding a key that another control there holds swaps the two. A key is
// `KeyboardEvent.key` in lower case (a digit or a sign by its place on the row, so Shift's 2 is still 2 and its ','
// still ','; a key that types a letter is that letter on any layout), the mouse's buttons
// `mouse0` (left) to `mouse4` (the forward side button), bound only to a control that hears the mouse. The pad's are
// the standard pad's, named as printed; a stick's ways ('LS up') are fixed, never bound; a button held is `B hold`, and
// two pressed together `LB+RB`. What the player changed is kept with their account (`readOverrides`), and the accounts
// check it against this table.

/** Where a control acts: on foot (on land or a deck), dead, in a window, at the helm, or in a fight at sea. */
export type Context = 'foot' | 'dead' | 'menu' | 'helm' | 'fight';
const EVERYWHERE: readonly Context[] = ['foot', 'dead', 'menu', 'helm', 'fight'];
const FOOT: readonly Context[] = ['foot'];
const HELM: readonly Context[] = ['helm'];
const FIGHT: readonly Context[] = ['fight'];

/** A control's keys and pad buttons, and where it acts. */
export interface Control {
  readonly keys: readonly string[];
  readonly pad: readonly string[];
  readonly where: readonly Context[];
}
const control = (keys: readonly string[], pad: readonly string[], where: readonly Context[]): Control => ({
  keys,
  pad,
  where,
});

/** The standard pad's buttons by their place in `Gamepad.buttons`. */
export const PAD_BUTTONS = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'View',
  'Start',
  'LS',
  'RS',
  'Up',
  'Down',
  'Left',
  'Right',
] as const;
/** A button held this long, seconds, is its hold (`B hold`), where one is bound; let go sooner, its tap. */
export const HOLD_S = 0.3;

/** DFO's keys, as the owner chose them ("same control scheme"), and Destiny's pad, as the owner chose it ("#1 but b
 *  to dodge/b hold to crouch"). */
export const CONTROLS = {
  forward: control(['w'], ['LS up'], FOOT),
  back: control(['s'], ['LS down'], FOOT),
  left: control(['a'], ['LS left'], FOOT),
  right: control(['d'], ['LS right'], FOOT),
  run: control(['shift'], ['LS'], FOOT),
  jump: control([' '], ['A'], FOOT),
  crouch: control(['c'], ['B hold'], FOOT),
  mount: control([','], ['Up'], FOOT),
  use: control(['e'], ['X'], ['foot', 'fight']),
  ready: control(['z'], ['Y'], FOOT),
  melee: control(['1'], ['Left'], FOOT),
  ranged: control(['2'], ['Right'], FOOT),
  // A healing charge, beside the loadouts' keys.
  heal: control(['3'], ['Down'], FOOT),
  // The right mouse button swings and aims, the left guards and fires; on the pad RT swings and fires, LT guards and
  // aims, so a ranged weapon drawn turns the triggers round (`Input`).
  swing: control(['mouse2'], ['RT'], FOOT),
  guard: control(['mouse0', 'f'], ['LT'], FOOT),
  dodge: control(['v', 'mouse4'], ['B'], FOOT),
  // The Art's spells, on keys DFO's scheme leaves free: the Anima on R, the Tenets on Q (where casting was) and G.
  anima: control(['r'], ['LB+RB'], FOOT),
  tenetOne: control(['q'], ['LB'], FOOT),
  tenetTwo: control(['g'], ['RB'], FOOT),
  respawn: control(['enter'], ['A'], ['dead']),
  turnLeft: control(['arrowleft'], ['RS left'], ['foot', 'helm']),
  turnRight: control(['arrowright'], ['RS right'], ['foot', 'helm']),
  lookUp: control(['insert'], ['RS up'], ['foot', 'helm']),
  lookDown: control(['delete'], ['RS down'], ['foot', 'helm']),
  perspective: control(['mouse3'], ['RS'], FOOT),
  menu: control(['m'], ['View hold'], EVERYWHERE),
  character: control(['i'], ['Start'], EVERYWHERE),
  inventory: control(['o'], [], EVERYWHERE),
  details: control(['x'], [], ['menu']),
  controls: control(['k'], ['View'], EVERYWHERE),
  steerLeft: control(['a'], ['LS left'], HELM),
  steerRight: control(['d'], ['LS right'], HELM),
  sailOn: control(['w'], ['LS up'], HELM),
  heaveTo: control(['s'], ['LS down'], HELM),
  voyage: control([' '], ['X'], HELM),
  slower: control(['['], ['Left'], HELM),
  faster: control([']'], ['Right'], HELM),
  map: control(['n'], ['Up'], HELM),
  // The held map of the land on foot; the pad's D-pad up mounts there, so it has no pad button until one is bound.
  landMap: control(['n'], [], FOOT),
  confirm: control(['enter'], ['A'], HELM),
  ashore: control(['l'], [], HELM),
  manage: control(['b'], ['Y'], HELM),
  repair: control(['r'], ['Down'], HELM),
  leaveHelm: control(['h'], ['B'], HELM),
  fightLeft: control(['a', 'arrowleft'], ['LS left'], FIGHT),
  fightRight: control(['d', 'arrowright'], ['LS right'], FIGHT),
  sailsUp: control(['w', 'arrowup'], ['LS up'], FIGHT),
  sailsDown: control(['s', 'arrowdown'], ['LS down'], FIGHT),
  burst: control(['shift'], ['LS'], FIGHT),
  aim: control(['mouse2'], ['LT'], FIGHT),
  fire: control([], ['RT'], FIGHT),
  holdFire: control(['mouse0'], [], FIGHT),
  shotBack: control([], ['Left'], FIGHT),
  shotNext: control([], ['Right'], FIGHT),
  brace: control(['c'], ['B'], FIGHT),
} as const satisfies Record<string, Control>;
export type BindId = keyof typeof CONTROLS;
export const BIND_IDS = Object.keys(CONTROLS) as BindId[];

/** A control's keys and pad buttons as bound now. */
export interface Bound {
  readonly keys: readonly string[];
  readonly pad: readonly string[];
}
export type Binds = Readonly<Record<BindId, Bound>>;
export type Device = 'keys' | 'pad';

export const DEFAULTS: Binds = Object.fromEntries(
  BIND_IDS.map((id) => [id, { keys: CONTROLS[id].keys, pad: CONTROLS[id].pad }]),
) as Binds;

/** The controls that act on a key going down or the pad's press, or at the helm, whose pointer is free: none hears a
 *  mouse button. */
const KEYS_ONLY: ReadonlySet<BindId> = new Set<BindId>([
  ...(['use', 'menu', 'landMap', 'map', 'respawn', 'confirm', 'voyage', 'manage', 'leaveHelm', 'repair'] as const),
  ...(['ashore', 'slower', 'faster', 'character', 'inventory', 'details', 'controls'] as const),
  ...(['steerLeft', 'steerRight', 'sailOn', 'heaveTo'] as const),
]);
/** Whether a mouse button bound to `id` is heard. */
export const hearsMouse = (id: BindId): boolean => !KEYS_ONLY.has(id);

/** Keys known by name; a key that types one character is named by it. Escape and Tab are the windows' own, the
 *  function keys the browser's. */
const NAMED_KEYS = new Set([
  ' ',
  'shift',
  'control',
  'alt',
  'enter',
  'backspace',
  'capslock',
  'arrowleft',
  'arrowright',
  'arrowup',
  'arrowdown',
  'insert',
  'delete',
  'home',
  'end',
  'pageup',
  'pagedown',
]);
/** The most keys or pad buttons one control is bound to. */
export const MOST_EACH = 3;

/** Whether `name` is a key or mouse button a control may be bound to. */
export const isKeyName = (name: string): boolean =>
  NAMED_KEYS.has(name) || /^mouse[0-4]$/.test(name) || /^[\p{Ll}\p{Lo}\p{N}\p{P}\p{S}]$/u.test(name);

const BUTTONS: ReadonlySet<string> = new Set(PAD_BUTTONS);
/** Whether `name` is a pad button, a button held or two together, which a control may be bound to. */
export function isPadName(name: string): boolean {
  if (BUTTONS.has(name)) return true;
  if (name.endsWith(' hold')) return BUTTONS.has(name.slice(0, -' hold'.length));
  const [first = '', second = '', ...more] = name.split('+');
  return more.length === 0 && first !== second && BUTTONS.has(first) && BUTTONS.has(second);
}

/** Whether `name` is one of a stick's ways, which walk, steer and look and are never bound. */
export const isStickWay = (name: string): boolean => /^[LR]S (up|down|left|right)$/.test(name);

/** Whether `name` may be bound to `id` on `device`: a key, or a mouse button where `id` hears one; or a pad's button. */
export const fits = (id: BindId, device: Device, name: string): boolean =>
  device === 'keys' ? isKeyName(name) && (!name.startsWith('mouse') || hearsMouse(id)) : isPadName(name);

/** The buttons of two pressed together, in the pad's order, so `RB+LB` is `LB+RB`. */
export function chordOf(first: string, second: string): string {
  const place = (button: string) => PAD_BUTTONS.indexOf(button as (typeof PAD_BUTTONS)[number]);
  return place(first) <= place(second) ? `${first}+${second}` : `${second}+${first}`;
}

/** What the player changed, by control: only what differs from the defaults is kept. */
export type Overrides = Readonly<Partial<Record<BindId, Partial<Bound>>>>;

const same = (one: readonly string[], other: readonly string[]) =>
  one.length === other.length && one.every((name, place) => other[place] === name);

export function overridesOf(binds: Binds): Overrides {
  const changed: Partial<Record<BindId, Partial<Bound>>> = {};
  for (const id of BIND_IDS) {
    const [now, first] = [binds[id], DEFAULTS[id]];
    const keys = same(now.keys, first.keys) ? {} : { keys: now.keys };
    const pad = same(now.pad, first.pad) ? {} : { pad: now.pad };
    if ('keys' in keys || 'pad' in pad) changed[id] = { ...keys, ...pad };
  }
  return changed;
}

/** The binds `overrides` make of the defaults. A kept bind that clashes with another where the two act alike, as one
 *  kept while the defaults were otherwise may, goes back to its default, until none clashes. */
export function withOverrides(overrides: Overrides): Binds {
  const kept: Partial<Record<BindId, Partial<Bound>>> = { ...overrides };
  const bindsOf = () => Object.fromEntries(BIND_IDS.map((id) => [id, { ...DEFAULTS[id], ...kept[id] }])) as Binds;
  let binds = bindsOf();
  for (let clash = clashOf(binds); clash; clash = clashOf(binds)) {
    const { device } = clash;
    const dropped = [clash.one, clash.other].filter((id) => kept[id]?.[device] !== undefined);
    // The defaults never clash; were they to, nothing kept is to blame.
    if (dropped.length === 0) break;
    for (const id of dropped)
      kept[id] = Object.fromEntries(Object.entries(kept[id] ?? {}).filter(([part]) => part !== device));
    binds = bindsOf();
  }
  return binds;
}

/** The first two controls in `binds` that act somewhere alike on one key or button, if any do. */
function clashOf(binds: Binds): { one: BindId; other: BindId; device: Device } | null {
  for (const [place, one] of BIND_IDS.entries())
    for (const other of BIND_IDS.slice(place + 1)) {
      if (!meet(one, other)) continue;
      for (const device of ['keys', 'pad'] as const)
        if (binds[one][device].some((name) => binds[other][device].includes(name))) return { one, other, device };
    }
  return null;
}

/** Overrides as sent or kept, each part checked strictly: a known control's `keys` or `pad`, a list of at most
 *  `MOST_EACH` distinct names it may be bound to, a stick's ways kept as they are. What does not read (a control
 *  since renamed, a name unknown) is left out, so binds kept by another build keep the rest; null for no object. */
export function readOverrides(read: unknown): Overrides | null {
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (!isObject(read)) return null;
  const known: ReadonlySet<string> = new Set(BIND_IDS);
  const kept: Partial<Record<BindId, Partial<Bound>>> = {};
  for (const [name, bound] of Object.entries(read)) {
    if (!known.has(name) || !isObject(bound)) continue;
    const id = name as BindId;
    const sticks = CONTROLS[id].pad.filter(isStickWay);
    const reads = (device: Device, list: unknown): list is string[] =>
      Array.isArray(list) &&
      list.length <= MOST_EACH &&
      new Set(list).size === list.length &&
      list.every(
        (each) => typeof each === 'string' && (fits(id, device, each) || (device === 'pad' && sticks.includes(each))),
      );
    const parts = (['keys', 'pad'] as const).flatMap((device) =>
      reads(device, bound[device]) ? [[device, bound[device]]] : [],
    );
    if (parts.length > 0) kept[id] = Object.fromEntries(parts) as Partial<Bound>;
  }
  return kept;
}

/** Whether two controls act anywhere alike, where one key cannot do both. */
export const meet = (one: BindId, other: BindId): boolean =>
  CONTROLS[one].where.some((context) => CONTROLS[other].where.includes(context));

/** A key or button of a control: its device and its place among them (one past the last adds one). */
export interface Slot {
  readonly id: BindId;
  readonly device: Device;
  readonly place: number;
}

/** Binding `name` to `slot`: the binds after, and the controls that gave `name` up for the slot's old one or let it
 *  go; or, where one would be left with nothing, refused, naming it. */
export type Rebound =
  | { readonly binds: Binds; readonly swapped: readonly BindId[] }
  | { readonly refused: BindId; readonly binds?: undefined };

/** `name` bound to `slot`. Every other control acting alike that holds `name` gives it up, taking the slot's old one
 *  where that clashes with nothing it acts alike with and it can hear it, else keeping the rest of its own. A stick's
 *  way is never bound, nor given. */
export function rebind(binds: Binds, slot: Slot, name: string): Rebound {
  const { id, device, place } = slot;
  const own = [...binds[id][device]];
  const old = own[place];
  if (old === name || isStickWay(name) || (old !== undefined && isStickWay(old))) return { binds, swapped: [] };
  const after: Record<BindId, Bound> = { ...binds };
  const holders = BIND_IDS.filter((other) => other !== id && meet(id, other) && binds[other][device].includes(name));
  for (const holder of holders) {
    const given = [...binds[holder][device]];
    const taken = given.indexOf(name);
    const clashes = (key: string) =>
      BIND_IDS.some(
        (other) => other !== id && other !== holder && meet(holder, other) && binds[other][device].includes(key),
      );
    if (old !== undefined && !given.includes(old) && fits(holder, device, old) && !clashes(old)) given[taken] = old;
    else if (given.length > 1) given.splice(taken, 1);
    else return { refused: holder };
    after[holder] = { ...binds[holder], [device]: given };
  }
  const already = own.indexOf(name);
  if (already >= 0) own[already] = old ?? name;
  own[Math.min(place, own.length)] = name;
  after[id] = { ...binds[id], [device]: [...new Set(own)] };
  return { binds: after, swapped: holders };
}
