// The keys the heads-up display's key strip shows for each mode of the game: each a key (keys that do the same
// parted by " / ", each on its own keycap) and what it does.

import arts from '../../../content/arts/arts.json' with { type: 'json' };
import type { Hint } from './gearDom.ts';

/** What the Arts' keys add for an Art whose first Tenet is aimed while its key is held, by the Tenet's key. */
const AIMED: Readonly<Record<string, Hint>> = { duskDaggers: ['Hold Q', 'Aim Dusk Daggers'] };

/** The keys each mode shows. On foot the strip keeps to what the fight and the body do beyond walking and looking,
 *  which the player learns first and needs no reminder of. */
export const HINTS = {
  foot: [
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
  dead: [['Enter', 'Respawn at the nearest spawn']],
  sea: [
    ['Click', 'Sail there'],
    ['W', 'Sail on'],
    ['A / D', 'Steer'],
    ['S', 'Heave to'],
    ['Drag', 'Look'],
    ['N', 'Map'],
    ['[ / ]', 'Pace'],
    ['Space', 'Stop or resume'],
    ['B', 'Manage'],
    ['H', 'Leave the helm'],
    ['M', 'Menu'],
  ],
  manage: [
    ['Drag', 'Turn round her'],
    ['Wheel', 'Zoom'],
    ['B', 'Back to the sea'],
    ['M', 'Menu'],
  ],
  deck: [
    ['W / A / S / D', 'Move'],
    ['Shift', 'Run'],
    ['Space', 'Jump'],
    ['E', 'Take the helm at her wheel'],
    ['M', 'Menu'],
  ],
  fight: [
    ['A / D', 'Steer'],
    ['W / S', 'Sails'],
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
    ['Click', 'Choose a mark'],
    ['Enter', 'Land'],
    ['Esc', 'Back to sea'],
  ],
} as const satisfies Record<string, readonly Hint[]>;

/** The keys shown on foot with the Art worn (its id, 0 for none): an aimed Tenet is named only while its Art is worn. */
export function footHints(worn: number): readonly Hint[] {
  const aimed = AIMED[arts.arts.find((art) => art.id === worn)?.tenets[0]?.key ?? ''];
  return aimed ? [...HINTS.foot, aimed] : HINTS.foot;
}

/** What the player is doing at sea, for the keys shown: fighting, choosing a landing, at the helm with the map,
 *  walking her deck, managing her, or sailing. */
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
