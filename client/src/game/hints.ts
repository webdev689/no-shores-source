// The key strip at the bottom right: only the keys that matter at this moment, each a key (keys that do the same
// parted by " / ", each on its own keycap or drawn as the mouse's button) and what it does, and last the key to the
// sheet of every control (`controls.ts`).

import { DAGGERS } from '../combat/casting.ts';
import type { PlayerFightFrame } from '../combat/playerFight.ts';
import type { Fighting } from '../combat/fighting.ts';
import { SPELLS, spellNumber } from '../network/artMessages.ts';
import type { Mode } from '../rules/movementRules.ts';
import type { Walker } from '../player/walker.ts';
import type { Hint } from './gearNodes.ts';
import type { Standing } from './hudLaw.ts';

/** The strip's last entry wherever it shows: the key to every control. */
export const ALL_CONTROLS: Hint = ['K', 'All controls'];
/** The click that takes the mouse to look round, shown while the mouse is free. */
const LOOK: Hint = ['Left button', 'Look round'];
const MENU: Hint = ['M', 'Menu'];
const MAP: Hint = ['N', 'Map'];

/** The keys each moment shows, the strip's last entry with them. */
export const HINTS = {
  landMap: [['Drag', 'Pan'], ['Wheel', 'Zoom'], ['N / Esc', 'Close'], ALL_CONTROLS],
  dead: [['Enter', 'Respawn'], ALL_CONTROLS],
  sea: [['Left button', 'Sail there'], ['A / D', 'Steer'], ['W', 'Sail on'], ['S', 'Heave to'], MENU, ALL_CONTROLS],
  manage: [['Drag', 'Turn'], ['Wheel', 'Zoom'], ['B', 'Back'], ALL_CONTROLS],
  deck: [['Shift', 'Run'], ['Space', 'Jump'], ['E', 'Take the helm'], ALL_CONTROLS],
  fight: [
    ['A / D', 'Steer'],
    ['W / S', 'Sails'],
    ['Shift', 'Burst'],
    ['Right button', 'Aim'],
    ['C', 'Brace'],
    ALL_CONTROLS,
  ],
  aim: [
    ['Drag', 'Aim'],
    ['Right button', 'Release to fire'],
    ['Left button', 'Hold fire'],
    ['Wheel', 'Change shot'],
    ALL_CONTROLS,
  ],
  map: [
    ['Drag', 'Pan'],
    ['Wheel', 'Zoom'],
    ['Left button', 'Choose'],
    ['Enter', 'Set sail'],
    ['Esc', 'Close'],
    ALL_CONTROLS,
  ],
  landing: [['Left button', 'Choose; again to land'], ['Enter', 'Land'], ['Esc', 'Back'], ALL_CONTROLS],
} as const satisfies Record<string, readonly Hint[]>;

/** The keys of each stance on foot, before the Arts', the menu's and the strip's last. */
const STANCES = {
  away: [
    ['Z', 'Draw'],
    ['Shift', 'Run'],
    ['Space', 'Jump'],
    ['C', 'Crouch'],
  ],
  melee: [
    ['Right button', 'Swing'],
    ['Left button / F', 'Guard or parry'],
    ['V', 'Dodge'],
    ['3', 'Heal'],
    ['2', 'Ranged'],
  ],
  ranged: [
    ['Right button', 'Aim'],
    ['Left button / F', 'Fire'],
    ['V', 'Dodge'],
    ['3', 'Heal'],
    ['1', 'Melee'],
  ],
  aiming: [
    ['Left button / F', 'Fire'],
    ['Right button', 'Release to stop'],
    ['V', 'Dodge'],
  ],
  daggers: [['Q', 'Release to cast']],
  hang: [
    ['W / A / D', 'Climb'],
    ['C', 'Let go'],
  ],
  climb: [
    ['W / A / S / D', 'Climb'],
    ['Space', 'Kick off'],
    ['C', 'Let go'],
  ],
  mounted: [
    [',', 'Get down'],
    ['Shift', 'Gallop'],
  ],
} as const satisfies Record<string, readonly Hint[]>;
type Stance = keyof typeof STANCES;

/** What the player is doing on foot, for the keys shown: the Art worn (its id, 0 for none, as in the prologue),
 *  whether a weapon is drawn and is one that shoots, whether it aims, whether Dusk Daggers are being aimed, whether
 *  the player rides, the body's mode (hanging from a ledge or climbing a wall among them), and whether the mouse is
 *  free for a click to take it. */
export interface OnFoot {
  readonly worn: number;
  readonly drawn: boolean;
  readonly ranged: boolean;
  readonly aiming: boolean;
  readonly daggers: boolean;
  readonly mounted: boolean;
  readonly mode: Mode;
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
    mode: walker.player.body.mode,
    free,
  };
}

function stanceOf(foot: OnFoot): Stance {
  if (foot.mounted) return 'mounted';
  // On a wall only the climb's keys act: the fight's and the Arts' wait for the ground.
  if (foot.mode === 'hang' || foot.mode === 'climb') return foot.mode;
  if (foot.daggers) return 'daggers';
  if (foot.aiming) return 'aiming';
  if (!foot.drawn) return 'away';
  return foot.ranged ? 'ranged' : 'melee';
}

/** The Arts' keys while one is worn and the hands are free to cast: Shadow's Q held aims Dusk Daggers. */
const ARTS: readonly Hint[] = [['R / Q / G', 'Arts']];
const SHADOW: readonly Hint[] = [
  ['Q', 'Hold to aim daggers'],
  ['R / G', 'Arts'],
];

/** The keys shown on foot: the click to look while the mouse is free, the stance's own, the Arts' while one is worn
 *  and nothing else holds the keys, the menu's at rest or riding, and the strip's last. */
export function footHints(foot: OnFoot): readonly Hint[] {
  const stance = stanceOf(foot);
  const casts = foot.worn !== 0 && (stance === 'away' || stance === 'melee' || stance === 'ranged');
  const daggersWorn = spellNumber(foot.worn, DAGGERS) === SPELLS.duskDaggers;
  return [
    ...(foot.free ? [LOOK] : []),
    ...STANCES[stance],
    ...(casts ? (daggersWorn ? SHADOW : ARTS) : []),
    ...(stance === 'away' || stance === 'mounted' ? [MENU] : []),
    ALL_CONTROLS,
  ];
}

/** The keys shown on foot as the player stands with the section: none while a fall plays out (no key does anything
 *  until Respawn is offered), Respawn's once death is told, and otherwise what the player is doing asks. */
export function keysShown(standing: Standing, foot: OnFoot): readonly Hint[] {
  if (standing.kind !== 'dead') return footHints(foot);
  return standing.told ? HINTS.dead : [];
}

/** The keys shown on foot where the held map can be raised (not in the story, nor on a ship's deck, nor down): N
 *  before the menu's M, or before the strip's last where M is not shown. */
export function withMapKey(hints: readonly Hint[]): readonly Hint[] {
  const menu = hints.findIndex(([key]) => key === 'M');
  const place = menu >= 0 ? menu : hints.length - 1;
  return [...hints.slice(0, place), MAP, ...hints.slice(place)];
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
export function seaHints(state: AtSea): readonly Hint[] {
  if (state.fighting) return state.aiming ? HINTS.aim : HINTS.fight;
  if (state.landing) return HINTS.landing;
  if (state.atHelm) return HINTS.map;
  if (state.walking) return state.free ? [LOOK, ...HINTS.deck] : HINTS.deck;
  return state.managing ? HINTS.manage : HINTS.sea;
}
