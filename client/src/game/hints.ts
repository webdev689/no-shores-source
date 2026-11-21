// The keys the heads-up display's key strip shows for each mode of the game: each a key (keys that do the same
// parted by " / ", each on its own keycap) and what it does.

import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { Hint } from './gearDom.ts';
import type { Standing } from './hudLaw.ts';

/** What the Arts' keys add for an Art whose first Tenet is aimed while its key is held, by the Tenet's key. */
const AIMED: Readonly<Record<string, Hint>> = { duskDaggers: ['Hold Q', 'Aim Dusk Daggers'] };

/** The keys each mode shows. On foot the strip keeps to what the fight and the body do beyond walking, which the
 *  player learns first and needs no reminder of; the click that takes the mouse to look round stays, as nothing else
 *  says it once the pointer is let go. */
export const HINTS = {
  foot: [
    ['Click', 'Look round'],
    ['Right button', 'Swing or aim'],
    ['Left button / F', 'Guard or fire'],
    ['V', 'Dodge'],
    ['Shift', 'Run'],
    ['Space', 'Jump'],
    ['C', 'Crouch'],
    ['Z', 'Weapon'],
    ['1 / 2', 'Loadout'],
    ['R', 'Anima'],
    ['Q / G', 'Tenets'],
    ['Wheel', 'Third person'],
    ['M', 'Menu'],
  ],
  landMap: [
    ['Drag', 'Pan'],
    ['Wheel', 'Zoom'],
    ['N / Esc', 'Put the map away'],
  ],
  dead: [['Enter', 'Respawn at the nearest spawn']],
  sea: [
    ['Click', 'Sail there'],
    ['W', 'Sail on'],
    ['A / D', 'Steer'],
    ['S', 'Heave to'],
    ['Drag', 'Look'],
    ['Wheel', 'Zoom'],
    ['N', 'Map'],
    ['[ / ]', 'Pace'],
    ['Space', 'Stop or resume'],
    ['B', 'Manage'],
    ['H', 'Leave the helm'],
    ['M', 'Menu'],
  ],
  manage: [
    ['Drag', 'Turn round the ship'],
    ['Wheel', 'Zoom'],
    ['B', 'Back to the sea'],
    ['M', 'Menu'],
  ],
  deck: [
    ['Click', 'Look round'],
    ['W / A / S / D', 'Move'],
    ['Shift', 'Run'],
    ['Space', 'Jump'],
    ['E', 'Take the helm at the wheel'],
    ['M', 'Menu'],
  ],
  fight: [
    ['A / D', 'Steer'],
    ['W / S', 'Sails'],
    ['Shift', 'Boost'],
    ['Drag', 'Look'],
    ['Hold right button', 'Aim, let go to fire'],
    ['Click', 'Hold fire'],
    ['C', 'Brace'],
    ['Wheel', 'Shot'],
  ],
  map: [
    ['Drag', 'Pan'],
    ['Wheel', 'Zoom'],
    ['Click', 'A port or the sea'],
    ['Enter', 'Set sail'],
    ['Esc', 'Put the map away'],
  ],
  landing: [
    ['Click', 'Choose a mark, again to land'],
    ['Enter', 'Land'],
    ['Esc', 'Back to sea'],
  ],
} as const satisfies Record<string, readonly Hint[]>;

/** The Arts' own keys on foot, shown only while an Art is worn. */
const ART_KEYS = new Set(['R', 'Q / G']);

/** The keys shown on foot with the Art worn (its id, 0 for none, as in the prologue): the Arts' keys only while one is
 *  worn, and an aimed Tenet named only while its Art is. */
export function footHints(worn: number): readonly Hint[] {
  const art = arts.arts.find((each) => each.id === worn);
  if (!art) return HINTS.foot.filter(([key]) => !ART_KEYS.has(key));
  const aimed = AIMED[art.tenets[0]?.key ?? ''];
  return aimed ? [...HINTS.foot, aimed] : HINTS.foot;
}

/** The keys shown on foot as the player stands with the section: none while a fall plays out (no key does anything
 *  until Respawn is offered), Respawn's once death is told, and otherwise the foot's with the Art worn. */
export function keysShown(standing: Standing, worn: number): readonly Hint[] {
  if (standing.kind !== 'dead') return footHints(worn);
  return standing.told ? HINTS.dead : [];
}

/** The keys shown on foot where the held map is raised (not in the story, nor on a ship's deck): N beside the
 *  menu's M. */
export function withMapKey(hints: readonly Hint[]): readonly Hint[] {
  return hints.flatMap((hint): Hint[] => (hint[0] === 'M' ? [['N', 'Map'], hint] : [hint]));
}

/** What the player is doing at sea, for the keys shown: fighting, choosing a landing, at the helm with the map,
 *  walking its deck, managing it, or sailing. */
export interface AtSea {
  readonly fighting: boolean;
  readonly landing: boolean;
  readonly atHelm: boolean;
  readonly walking: boolean;
  readonly managing: boolean;
}

/** The keys shown at sea for what the player is doing. */
export function seaHints(state: AtSea): readonly Hint[] {
  if (state.fighting) return HINTS.fight;
  if (state.landing) return HINTS.landing;
  if (state.atHelm) return HINTS.map;
  if (state.walking) return HINTS.deck;
  return state.managing ? HINTS.manage : HINTS.sea;
}
