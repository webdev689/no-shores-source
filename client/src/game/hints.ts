// The keys the heads-up display lists for each mode of the game, one line each.

/** The keys each mode lists, one line each. */
export const HINTS = {
  foot: [
    'Click to look round · W A S D move · Shift run',
    'Space jump · C crouch · Z weapon · Q cast',
    'Wheel: third person · M menu',
  ],
  dead: ['Enter or Respawn: back at the nearest spawn'],
  sea: [
    'Click the sea to sail · Drag to look · Wheel zoom',
    'N map · [ ] pace · Space stop or resume',
    'B manage · H leave the helm · M menu',
  ],
  manage: ['Drag to turn round her · Wheel to zoom', 'B back to the sea · M menu'],
  deck: ['Click to look round · W A S D move · Shift run · Space jump', 'At her wheel, E: take the helm · M menu'],
  fight: [
    'A D steer · W S sails · Drag to look',
    'Hold right button: aim, let go: fire · Click: hold fire · C brace · Wheel shot',
  ],
  map: ['Drag to pan · Wheel to zoom · Click a port or the sea', 'Enter set sail · Esc put the map away'],
  landing: ['Click a mark to choose it', 'Click it again or Enter to land · Esc back to sea'],
} as const;

/** What the player is doing at sea, for the keys listed: fighting (with the fight's own lines), choosing a landing, at
 *  the helm with the map, walking her deck, managing her, or sailing. */
export interface AtSea {
  readonly fighting: readonly string[] | null;
  readonly landing: boolean;
  readonly atHelm: boolean;
  readonly walking: boolean;
  readonly managing: boolean;
}

/** The keys listed at sea for what the player is doing. */
export function seaHints(state: AtSea): readonly string[] {
  if (state.fighting) return [...state.fighting, ...HINTS.fight];
  if (state.landing) return HINTS.landing;
  if (state.atHelm) return HINTS.map;
  if (state.walking) return HINTS.deck;
  return state.managing ? HINTS.manage : HINTS.sea;
}
