// The key strip at the bottom right: only the controls that matter at this moment, each its keys (keys that do the
// same parted by " / ", each on its own keycap, drawn as the mouse's button or as the pad's) and what it does, and
// last the key to the sheet of every control (`controls.ts`). A strip names controls (`binds.ts`), or the mouse's
// gestures and a window's keys by name; `hintsFor` shows them as bound now, for the keys or the pad.

import type { PlayerFightFrame } from '../combat/playerFight.ts';
import type { Fighting } from '../combat/fighting.ts';
import { type Binds, CONTROLS, type Device } from '../player/binds.ts';
import type { Walker } from '../player/walker.ts';
import { keyName, padName } from './controls.ts';
import type { Hint } from './gearNodes.ts';
import type { Standing } from './hudLaw.ts';

/** One entry of the strip: what it names, " / " between them (a control, or a gesture or key by name; `keys|pad`
 *  names one for the keys and another for the pad), what it does, and what it does on the pad where that differs. */
export type StripHint = readonly [names: string, words: string, padWords?: string];

/** The strip's last entry wherever it shows: the key to every control. */
export const ALL_CONTROLS: StripHint = ['controls', 'All controls'];
/** The click that takes the mouse to look round, shown while the mouse is free. */
const LOOK: StripHint = ['Left button', 'Look round'];
const MENU: StripHint = ['menu', 'Menu'];

/** The keys each moment shows, the strip's last entry with them. */
export const HINTS = {
  dead: [['respawn', 'Respawn'], ALL_CONTROLS],
  sea: [
    ['Left button', 'Sail there'],
    ['steerLeft / steerRight', 'Steer'],
    ['sailOn', 'Sail on'],
    ['heaveTo', 'Heave to'],
    MENU,
    ALL_CONTROLS,
  ],
  manage: [['Drag', 'Turn'], ['Wheel', 'Zoom'], ['manage', 'Back'], ALL_CONTROLS],
  deck: [['run', 'Run'], ['jump', 'Jump'], ['use', 'Take the helm'], ALL_CONTROLS],
  fight: [
    ['fightLeft / fightRight', 'Steer'],
    ['sailsUp / sailsDown', 'Sails'],
    ['burst', 'Burst'],
    ['aim', 'Aim'],
    ['brace', 'Brace'],
    ALL_CONTROLS,
  ],
  aim: [
    ['Drag', 'Aim'],
    ['aim|fire', 'Release to fire', 'Fire'],
    ['holdFire|aim', 'Hold fire', 'Release to hold fire'],
    ['Wheel|shotBack / Wheel|shotNext', 'Change shot'],
    ALL_CONTROLS,
  ],
  map: [
    ['Drag', 'Pan'],
    ['Wheel', 'Zoom'],
    ['Left button', 'Choose'],
    ['confirm', 'Set sail'],
    ['Esc', 'Close'],
    ALL_CONTROLS,
  ],
  landing: [['Left button', 'Choose; again to land'], ['confirm', 'Land'], ['Esc', 'Back'], ALL_CONTROLS],
} as const satisfies Record<string, readonly StripHint[]>;

/** The keys of each stance on foot, before the Arts', the menu's and the strip's last. A ranged weapon's aim and
 *  fire are the swing's and the guard's keys, and on the pad the other way round (`Input`). */
const STANCES = {
  away: [
    ['ready', 'Draw'],
    ['run', 'Run'],
    ['jump', 'Jump'],
    ['crouch', 'Crouch'],
  ],
  melee: [
    ['swing', 'Swing'],
    ['guard', 'Guard or parry'],
    ['dodge', 'Dodge'],
    ['heal', 'Heal'],
    ['ranged', 'Ranged'],
  ],
  ranged: [
    ['swing|guard', 'Aim'],
    ['guard|swing', 'Fire'],
    ['dodge', 'Dodge'],
    ['heal', 'Heal'],
    ['melee', 'Melee'],
  ],
  aiming: [
    ['guard|swing', 'Fire'],
    ['swing|guard', 'Release to stop'],
    ['dodge', 'Dodge'],
  ],
  daggers: [['tenetOne', 'Release to cast']],
  mounted: [
    ['mount', 'Get down'],
    ['run', 'Gallop'],
  ],
} as const satisfies Record<string, readonly StripHint[]>;
type Stance = keyof typeof STANCES;

/** What the mouse's gestures and a window's keys are on the pad; none for one it has no way to do. */
const ON_THE_PAD: Readonly<Record<string, string>> = { Drag: padName('Right stick'), Esc: padName('B') };

/** A stick's ways shown together as one picture: both sideways, both up and down, or all four as the whole stick. */
function sticksJoined(names: readonly string[]): string[] {
  let joined = [...names];
  for (const [stick, whole] of [
    ['LS', 'Left stick'],
    ['RS', 'Right stick'],
  ] as const) {
    const has = (way: string) => joined.includes(padName(`${stick} ${way}`));
    const [across, along] = [has('left') && has('right'), has('up') && has('down')];
    if (!across && !along) continue;
    const ways = [...(across ? ['left', 'right'] : []), ...(along ? ['up', 'down'] : [])];
    const covered = new Set(ways.map((way) => padName(`${stick} ${way}`)));
    const first = joined.findIndex((name) => covered.has(name));
    joined = joined.filter((name) => !covered.has(name));
    joined.splice(first, 0, padName(across && along ? whole : `${stick} ${across ? 'across' : 'along'}`));
  }
  return joined;
}

/** The strip's entries shown for `device` under `binds`: each control by its first key (the sheet has the rest), a
 *  gesture by its name or the pad's way to do it; an entry with nothing to show is left out. */
export function hintsFor(hints: readonly StripHint[], device: Device, binds: Binds): Hint[] {
  return hints.flatMap(([names, words, padWords]): Hint[] => {
    const tokens = names.split(' / ');
    const shown = tokens.flatMap((token) => {
      const [forKeys = '', forPad = forKeys] = token.split('|');
      const which = device === 'keys' ? forKeys : forPad;
      if (!(which in CONTROLS)) return device === 'keys' ? [which] : (ON_THE_PAD[which] ?? []);
      const bound = binds[which as keyof typeof CONTROLS][device];
      return bound.slice(0, 1).map(device === 'keys' ? keyName : padName);
    });
    const unique = sticksJoined([...new Set(shown)]);
    if (unique.length === 0) return [];
    return [[unique.join(' / '), device === 'pad' ? (padWords ?? words) : words]];
  });
}

/** What the player is doing on foot, for the keys shown: the Art worn (its id, 0 for none, as in the prologue),
 *  whether a weapon is drawn and is one that shoots, whether it aims, whether Dusk Daggers are being aimed, whether
 *  the player rides, and whether the mouse is free for a click to take it. */
export interface OnFoot {
  readonly worn: number;
  readonly drawn: boolean;
  readonly ranged: boolean;
  readonly aiming: boolean;
  readonly daggers: boolean;
  readonly mounted: boolean;
  readonly free: boolean;
}

/** What the player is doing on foot, read from the walker, the fight's frame and the fight; `free` while the mouse
 *  is not the view's. */
export function onFoot(
  walker: Pick<Walker, 'you' | 'player'>,
  shown: Pick<PlayerFightFrame, 'rangedDrawn' | 'aiming'>,
  fight: Pick<Fighting, 'arts' | 'aimRing'>,
  free: boolean,
): OnFoot {
  return {
    worn: fight.arts?.art ?? 0,
    drawn: walker.you.dress.outfit.drawn,
    ranged: shown.rangedDrawn,
    aiming: shown.aiming,
    daggers: fight.aimRing !== null,
    mounted: walker.player.mounted,
    free,
  };
}

function stanceOf(foot: OnFoot): Stance {
  if (foot.mounted) return 'mounted';
  if (foot.daggers) return 'daggers';
  if (foot.aiming) return 'aiming';
  if (!foot.drawn) return 'away';
  return foot.ranged ? 'ranged' : 'melee';
}

/** The keys shown on foot: the click to look while the mouse is free, the stance's own, the Arts' while one is worn
 *  and nothing else holds the keys, the menu's at rest or riding, and the strip's last. */
export function footHints(foot: OnFoot): readonly StripHint[] {
  const stance = stanceOf(foot);
  const casts = foot.worn !== 0 && (stance === 'away' || stance === 'melee' || stance === 'ranged');
  return [
    ...(foot.free ? [LOOK] : []),
    ...STANCES[stance],
    ...(casts ? [['anima / tenetOne / tenetTwo', 'Arts'] as const] : []),
    ...(stance === 'away' || stance === 'mounted' ? [MENU] : []),
    ALL_CONTROLS,
  ];
}

/** The keys shown on foot as the player stands with the section: none while a fall plays out (no key does anything
 *  until Respawn is offered), Respawn's once death is told, and otherwise what the player is doing asks. */
export function keysShown(standing: Standing, foot: OnFoot): readonly StripHint[] {
  if (standing.kind !== 'dead') return footHints(foot);
  return standing.told ? HINTS.dead : [];
}

/** What the player is doing at sea, for the keys shown: fighting and aiming the guns, choosing a landing, at the helm
 *  with the map, walking its deck (the mouse free for a click to take it or not), managing it, or sailing. */
export interface AtSea {
  readonly fighting: boolean;
  readonly aiming: boolean;
  readonly landing: boolean;
  readonly atHelm: boolean;
  readonly walking: boolean;
  readonly managing: boolean;
  readonly free: boolean;
}

/** The keys shown at sea for what the player is doing. */
export function seaHints(state: AtSea): readonly StripHint[] {
  if (state.fighting) return state.aiming ? HINTS.aim : HINTS.fight;
  if (state.landing) return HINTS.landing;
  if (state.atHelm) return HINTS.map;
  if (state.walking) return state.free ? [LOOK, ...HINTS.deck] : HINTS.deck;
  return state.managing ? HINTS.manage : HINTS.sea;
}
