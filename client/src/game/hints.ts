// The key strip at the bottom right: the moment's name, then only the controls that matter at this moment, each its
// keys (keys that do the same parted by " / ", each on its own keycap, drawn as the mouse's button or as the pad's)
// and what it does, and last the key to the sheet of every control (`controls.ts`). A strip names controls
// (`binds.ts`), or the mouse's gestures and a window's keys by name; `hintsFor` shows them as bound now, for the keys
// or the pad.

import { DAGGERS } from '../combat/casting.ts';
import type { PlayerFightFrame } from '../combat/playerFight.ts';
import type { Fighting } from '../combat/fighting.ts';
import { SPELLS, spellNumber } from '../network/artMessages.ts';
import { type Binds, CONTROLS, type Device } from '../player/binds.ts';
import type { Mode } from '../rules/movementRules.ts';
import type { Walker } from '../player/walker.ts';
import { keyName, padName } from './controls.ts';
import type { Standing } from './hudLaw.ts';

/** One entry of the strip: what it names, " / " between them (a control, or a gesture or key by name; `keys|pad`
 *  names one for the keys and another for the pad), what it does, and what it does on the pad where that differs. */
export type StripHint = readonly [names: string, words: string, padWords?: string];

/** What the strip shows at a moment: the moment's name over its entries. */
export interface Strip {
  readonly title: string;
  readonly hints: readonly StripHint[];
}

/** The strip's last entry wherever it shows: the key to every control. */
export const ALL_CONTROLS: StripHint = ['controls', 'All controls'];
/** Fallen in a Breach, the key that follows the next of the company, naming whom the camera follows (`name`). */
export const followHint = (name: string): StripHint => ['follow', name ? `Following ${name} · Next` : 'Follow'];
/** The click that takes the mouse to look round, shown while the mouse is free. */
const LOOK: StripHint = ['Left button', 'Look round'];
/** Held, the leave control takes the player back to their ship from wherever they stand on foot (`leaveHold.ts`). */
const LEAVE: StripHint = ['leave', 'Hold to leave', 'Leave'];
const MAP: StripHint = ['landMap', 'Map'];

/** The keys each moment shows, the strip's last entry with them. */
export const HINTS = {
  landMap: [['Drag', 'Pan'], ['Wheel', 'Zoom'], ['landMap / Esc', 'Close'], ALL_CONTROLS],
  dead: [['respawn', 'Respawn'], ALL_CONTROLS],
  oversea: [['Left button', 'Sail there'], ['map', 'Plan a voyage'], ['seaView', 'Sea level'], ALL_CONTROLS],
  sealevel: [
    ['steerLeft / steerRight', 'Steer'],
    ['sailOn', 'Sail on'],
    ['heaveTo', 'Heave to'],
    ['seaView', 'Oversea'],
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
  landing: [['Left button', 'Land or open'], ['confirm', 'Land or open the lit tile'], ['Esc', 'Back'], ALL_CONTROLS],
} as const satisfies Record<string, readonly StripHint[]>;

/** Each moment's name, as the strip's head says it. */
const TITLES: Readonly<Record<keyof typeof HINTS, string>> = {
  landMap: 'Map',
  dead: 'Fallen',
  oversea: 'Oversea',
  sealevel: 'Sea level',
  manage: 'Manage',
  deck: 'On deck',
  fight: 'Sea fight',
  aim: 'Guns laid',
  map: 'Chart',
  landing: 'Landing',
};

/** The strip of the moment `name`. */
export const stripOf = (name: keyof typeof HINTS): Strip => ({ title: TITLES[name], hints: HINTS[name] });

/** The keys of each stance on foot, before the Arts', the leave's and the strip's last. A ranged weapon's aim and
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
  hang: [
    ['forward / left / right', 'Climb'],
    ['crouch', 'Let go'],
  ],
  climb: [
    ['forward / left / back / right', 'Climb'],
    ['jump', 'Kick off'],
    ['crouch', 'Let go'],
  ],
  mounted: [
    ['mount', 'Get down'],
    ['run', 'Gallop'],
    ['jump', 'Boost'],
  ],
} as const satisfies Record<string, readonly StripHint[]>;
type Stance = keyof typeof STANCES;
/** The Lodestone's bearer's keys at rest and with their bare hands up, in place of the stance's and the Arts': their
 *  swing is its Strike, their guard raises Hold True drawn or not, and any Art's key Grounds it once it is charged. */
const BEARER = {
  away: [
    ['ready', 'Draw'],
    ['run', 'Run'],
    ['jump', 'Jump'],
    ['guard', 'Hold True'],
  ],
  melee: [
    ['swing', 'Strike'],
    ['guard', 'Hold True'],
    ['dodge', 'Dodge'],
    ['heal', 'Heal'],
  ],
} as const satisfies Record<string, readonly StripHint[]>;
const GROUND_KEYS = 'anima / tenetOne / tenetTwo';

/** Each stance's name, as the strip's head says it. */
const STANCE_TITLES: Readonly<Record<Stance, string>> = {
  away: 'On foot',
  melee: 'Melee',
  ranged: 'Ranged',
  aiming: 'Aiming',
  daggers: 'Dusk Daggers',
  hang: 'Ledge',
  climb: 'Climbing',
  mounted: 'Riding',
};

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

/** The keys an entry's `names` show for `device` under `binds`: each control by its first key (`every` key with
 *  it), a gesture by its name or the pad's way to do it. */
export function keysOf(names: string, device: Device, binds: Binds, every = false): string[] {
  const shown = names.split(' / ').flatMap((token) => {
    const [forKeys = '', forPad = forKeys] = token.split('|');
    const which = device === 'keys' ? forKeys : forPad;
    if (!(which in CONTROLS)) return device === 'keys' ? [which] : (ON_THE_PAD[which] ?? []);
    const bound = binds[which as keyof typeof CONTROLS][device];
    return bound.slice(0, every ? undefined : 1).map(device === 'keys' ? keyName : padName);
  });
  return sticksJoined([...new Set(shown)]);
}

/** An entry as the strip draws it: its keys as shown (" / " between them), its words, and the controls it names. */
export type StripRow = readonly [keys: string, words: string, names: string];

/** The strip's entries shown for `device` under `binds`: each control by its first key (the sheet has the rest), a
 *  gesture by its name or the pad's way to do it; an entry with nothing to show is left out. */
export function hintsFor(hints: readonly StripHint[], device: Device, binds: Binds): StripRow[] {
  return hints.flatMap(([names, words, padWords]): StripRow[] => {
    const keys = keysOf(names, device, binds);
    return keys.length === 0 ? [] : [[keys.join(' / '), device === 'pad' ? (padWords ?? words) : words, names]];
  });
}

/** What the player is doing on foot, for the keys shown: the Art worn (its id, 0 for none, as in the prologue),
 *  whether a weapon is drawn and is one that shoots, whether it aims, whether Dusk Daggers are being aimed, whether
 *  the player rides, the body's mode (hanging from a ledge or climbing a wall among them), whether the mouse is free
 *  for a click to take it, and in a Breach whether they bear its Lodestone, its grounding charged or not. */
export interface OnFoot {
  readonly worn: number;
  readonly drawn: boolean;
  readonly ranged: boolean;
  readonly aiming: boolean;
  readonly daggers: boolean;
  readonly mounted: boolean;
  readonly mode: Mode;
  readonly free: boolean;
  readonly bearer?: { readonly charged: boolean } | null;
}

/** What the player is doing on foot, read from the walker, the fight's frame and the fight; `free` while the mouse
 *  is not the view's, `bearer` while they bear a Breach's Lodestone. */
export function onFoot(
  walker: Pick<Walker, 'you' | 'player'>,
  shown: Pick<PlayerFightFrame, 'rangedDrawn' | 'aiming'>,
  fight: Pick<Fighting, 'arts' | 'aimRing'>,
  free: boolean,
  bearer: { readonly charged: boolean } | null = null,
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
    bearer,
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

/** The Arts' keys while one is worn and the hands are free to cast: Shadow's First Tenet held aims Dusk
 *  Daggers. */
const ARTS: readonly StripHint[] = [['anima / tenetOne / tenetTwo', 'Arts']];
const SHADOW: readonly StripHint[] = [
  ['tenetOne', 'Hold to aim daggers'],
  ['anima / tenetTwo', 'Arts'],
];

/** The keys shown on foot: the click to look while the mouse is free, the stance's own, the Arts' while one is worn
 *  and nothing else holds the keys (the bearer's own in place of both, at rest or with their hands up), the leave's
 *  at rest or riding, and the strip's last. */
export function footHints(foot: OnFoot): readonly StripHint[] {
  const stance = stanceOf(foot);
  const casts = foot.worn !== 0 && (stance === 'away' || stance === 'melee' || stance === 'ranged');
  const daggersWorn = spellNumber(foot.worn, DAGGERS) === SPELLS.duskDaggers;
  const bearer = foot.bearer && (stance === 'away' || stance === 'melee') ? BEARER[stance] : null;
  const ground: StripHint = [GROUND_KEYS, foot.bearer?.charged ? 'Ground' : 'Ground (charging)'];
  return [
    ...(foot.free ? [LOOK] : []),
    ...(bearer ? [...bearer, ground] : [...STANCES[stance], ...(casts ? (daggersWorn ? SHADOW : ARTS) : [])]),
    ...(stance === 'away' || stance === 'mounted' ? [LEAVE] : []),
    ALL_CONTROLS,
  ];
}

/** The strip on foot: the stance's name over its keys (`footHints`). */
export const footStrip = (foot: OnFoot): Strip => ({ title: STANCE_TITLES[stanceOf(foot)], hints: footHints(foot) });

/** The strip on foot as the player stands with the section and the fight: none while a fall plays out or a fall in
 *  the fight waits (no key does anything until Respawn is offered), Respawn's once it may be pressed (none but the
 *  sheet's where the place stands the fallen again of itself), and otherwise what the player is doing asks. */
export function keysShown(
  standing: Standing,
  foot: OnFoot,
  fallen: { readonly canRespawn: boolean } | null = null,
): Strip {
  const none = { title: '', hints: [] };
  if (standing.kind === 'dead' && standing.waits)
    return standing.told ? { title: TITLES.dead, hints: [ALL_CONTROLS] } : none;
  if (standing.kind === 'dead') return standing.told ? stripOf('dead') : none;
  if (fallen) return fallen.canRespawn ? stripOf('dead') : none;
  return footStrip(foot);
}

/** Fallen in a Breach, `strip` under the fallen's name with the key that follows the company first (`followHint`). */
export const withFollow = (strip: Strip, name: string): Strip => ({
  title: TITLES.dead,
  hints: [followHint(name), ...strip.hints],
});

/** `strip` without the leave held, where there is nothing to leave: the story, a struck ship's deck at sea. */
export const withoutLeave = (strip: Strip): Strip => ({
  ...strip,
  hints: strip.hints.filter(([names]) => names !== 'leave'),
});

/** The strip on foot where the held map can be raised (not in the story, nor on a ship's deck, nor down): the map's
 *  before the leave's, or before the strip's last where the leave's is not shown. */
export function withMapKey(strip: Strip): Strip {
  const { hints } = strip;
  const leave = hints.findIndex(([names]) => names === 'leave');
  const place = leave >= 0 ? leave : hints.length - 1;
  return { ...strip, hints: [...hints.slice(0, place), MAP, ...hints.slice(place)] };
}

/** What the player is doing at sea, for the keys shown: fighting and aiming the guns, choosing a landing, at the helm
 *  with the map, walking its deck (the mouse free for a click to take it or not), managing it, or sailing in the view
 *  switched to (`level`). */
export interface AtSea {
  readonly level: 'oversea' | 'sealevel';
  readonly fighting: boolean;
  readonly aiming: boolean;
  readonly landing: boolean;
  readonly atHelm: boolean;
  readonly walking: boolean;
  readonly managing: boolean;
  readonly free: boolean;
}

/** The strip at sea for what the player is doing. */
export function seaStrip(state: AtSea): Strip {
  if (state.fighting) return stripOf(state.aiming ? 'aim' : 'fight');
  if (state.landing) return stripOf('landing');
  if (state.atHelm) return stripOf('map');
  if (state.walking) return state.free ? { ...stripOf('deck'), hints: [LOOK, ...HINTS.deck] } : stripOf('deck');
  return stripOf(state.managing ? 'manage' : state.level);
}
