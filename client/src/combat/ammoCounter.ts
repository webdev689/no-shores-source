// The shots left beside the crosshair while the Ranged loadout is drawn, as the fight's rules count them on the
// player's own fighter: in brass once a fifth of the capacity or less is left, and "No ammo" in the loss colour at none.

import type { Node } from '../ui/node.ts';

/** The share of the capacity at or under which the shots left read as low. */
const LOW_SHARE = 0.2;

/** What the counter says of `ammo` shots left of `most`: its words, and whether it tells of none or of few; null says
 *  nothing. */
export function ammoWords(
  ammo: number | null | undefined,
  most: number | null = null,
): { readonly words: string; readonly empty: boolean; readonly low: boolean } | null {
  if (ammo === null || ammo === undefined) return null;
  if (ammo <= 0) return { words: 'No ammo', empty: true, low: false };
  return { words: String(ammo), empty: false, low: most !== null && most > 0 && ammo <= most * LOW_SHARE };
}

/** The counter, standing by the screen's middle where the crosshair stands, on the face's grid and outlined as the
 *  HUD's words are; few in brass, none in the gear screen's loss colour. Nothing while it says nothing. */
export function ammoNode(ammo: number | null | undefined, most: number | null = null): Node | null {
  const said = ammoWords(ammo, most);
  if (!said) return null;
  const colour = said.empty ? '#e8968a' : said.low ? '#f1c04f' : '#f2f2f2';
  return {
    text: { words: said.words, size: 2, colour, edge: 'halo', wrap: false },
    float: { to: 'screen', at: [0.5, 0.5], x: 22, y: 11, z: 1 },
  };
}
