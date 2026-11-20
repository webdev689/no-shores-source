// A hull's masts and spars as boxes on her deck, from her sails in the ships manifest (tools/ships write it): each mast
// a column from her deck up to her highest sail on it, each gaff sail's boom along its foot and its gaff along its head,
// and each square sail's yards across her. The camera on her deck keeps a clear line to the boarder past them, as on
// land it keeps off walls; nothing else stands on them, since her deck room knows only her planks.
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import type { Block } from '../rules/movementRules.ts';
import { HULL_NAMES } from './hulls.ts';

type Corner = readonly number[];

/** A mast's half thickness, and a spar's, metres. */
const MAST_HALF_M = 0.3;
const SPAR_HALF_M = 0.2;

/** A sail as the manifest lays it, in her mesh's frame: x to her bow, y across her, z over her waterline. */
type Sail =
  | {
      readonly kind: 'gaff';
      readonly tack: Corner;
      readonly clew: Corner;
      readonly throat: Corner;
      readonly peak: Corner;
    }
  | {
      readonly kind: 'square';
      readonly foot_port: Corner;
      readonly foot_starboard: Corner;
      readonly head_port: Corner;
      readonly head_starboard: Corner;
    }
  | { readonly kind: 'stay' };

/** A box round the line from `from` to `to` (her mesh's frame), `half` either side of it, on her deck (x to her
 *  starboard, y to her stern). */
function sparBox(from: Corner, to: Corner, half: number): Block {
  const [fromX = 0, fromY = 0, fromZ = 0] = from;
  const [toX = 0, toY = 0, toZ = 0] = to;
  return {
    minX: Math.min(fromY, toY) - half,
    maxX: Math.max(fromY, toY) + half,
    minY: -Math.max(fromX, toX) - half,
    maxY: -Math.min(fromX, toX) + half,
    bottom: Math.min(fromZ, toZ) - half,
    top: Math.max(fromZ, toZ) + half,
  };
}

/** A mast standing at her mesh's `x` on her middle line, from below her deck to `top`. */
function mast(x: number, top: number): Block {
  return { minX: -MAST_HALF_M, maxX: MAST_HALF_M, minY: -x - MAST_HALF_M, maxY: -x + MAST_HALF_M, top };
}

/** Her masts and spars by her hull's number (0 the Sloop to 3 the Frigate), as boxes on her deck. */
export function sparBoxes(hull: number): Block[] {
  const name = HULL_NAMES[hull] ?? HULL_NAMES[0];
  const sails = ships.ships[name].sails as readonly Sail[];
  return sails.flatMap((sail): Block[] => {
    if (sail.kind === 'gaff') {
      const top = Math.max(sail.throat[2] ?? 0, sail.peak[2] ?? 0);
      const spars = [sparBox(sail.tack, sail.clew, SPAR_HALF_M), sparBox(sail.throat, sail.peak, SPAR_HALF_M)];
      return [mast(sail.tack[0] ?? 0, top), ...spars];
    }
    if (sail.kind === 'square') {
      const top = Math.max(sail.head_port[2] ?? 0, sail.head_starboard[2] ?? 0);
      const yards = [
        sparBox(sail.foot_port, sail.foot_starboard, SPAR_HALF_M),
        sparBox(sail.head_port, sail.head_starboard, SPAR_HALF_M),
      ];
      return [mast(sail.foot_port[0] ?? 0, top), ...yards];
    }
    return [];
  });
}
