// A hull's masts and spars as boxes on its deck, from its sails in the ships manifest (tools/ships write it): each mast
// a column from its deck up to its highest sail on it, each gaff sail's boom along its foot and its gaff along its
// head, and each square sail's yards across it; and its sides, a wall past its outermost plank on each row and across
// its bow and stern. The camera on its deck keeps a clear line to the boarder past them and stays inboard, as on land
// it keeps off walls; nothing else stands on them, since its deck room knows only its planks.
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import type { Block } from '../rules/movementRules.ts';
import { cellHeight, type Deck, HULL_DECKS } from './deck.ts';
import { HULL_NAMES } from './hulls.ts';

type Corner = readonly number[];

/** A mast's half thickness, and a spar's, metres. */
const MAST_HALF_M = 0.3;
const SPAR_HALF_M = 0.2;
/** Its sides' walls: how thick, and how far over its planks they reach for the camera, metres. */
const SIDE_M = 0.3;
const SIDE_HIGH_M = 6;

/** A sail as the manifest lays it, in its mesh's frame: x to its bow, y across it, z over its waterline. */
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

/** A box round the line from `from` to `to` (its mesh's frame), `half` either side of it, on its deck (x to its
 *  starboard, y to its stern). */
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

/** A mast standing at its mesh's `x` on its middle line, from below its deck to `top`. */
function mast(x: number, top: number): Block {
  return { minX: -MAST_HALF_M, maxX: MAST_HALF_M, minY: -x - MAST_HALF_M, maxY: -x + MAST_HALF_M, top, bottom: 0 };
}

/** Its sides as walls just past its outermost plank on each row of its deck, and across its bow and stern past its
 *  first and last rows. */
export function sideBoxes(deck: Deck): Block[] {
  const walls: Block[] = [];
  const rows: { readonly north: number; readonly south: number; readonly west: number; readonly east: number }[] = [];
  let top = 0;
  for (let row = 0; row < deck.rows; row += 1) {
    const [north, south] = [deck.north + row * deck.cell, deck.north + (row + 1) * deck.cell];
    const middle = (north + south) / 2;
    const middles = Array.from({ length: deck.columns }, (unused, column) => deck.west + (column + 0.5) * deck.cell);
    const planked = middles.filter((x) => cellHeight(deck, x, middle) !== null);
    if (planked.length === 0) continue;
    const [west, east] = [Math.min(...planked) - deck.cell / 2, Math.max(...planked) + deck.cell / 2];
    top = Math.max(top, ...planked.map((x) => cellHeight(deck, x, middle) ?? 0));
    rows.push({ north, south, west, east });
  }
  for (const { north, south, west, east } of rows) {
    walls.push({ minX: west - SIDE_M, maxX: west, minY: north, maxY: south, top: top + SIDE_HIGH_M, bottom: 0 });
    walls.push({ minX: east, maxX: east + SIDE_M, minY: north, maxY: south, top: top + SIDE_HIGH_M, bottom: 0 });
  }
  const [bow, stern] = [rows[0], rows.at(-1)];
  const across = {
    minX: deck.west - SIDE_M,
    maxX: deck.west + deck.cell * deck.columns + SIDE_M,
    top: top + SIDE_HIGH_M,
    bottom: 0,
  };
  if (bow) walls.push({ ...across, minY: bow.north - SIDE_M, maxY: bow.north });
  if (stern) walls.push({ ...across, minY: stern.south, maxY: stern.south + SIDE_M });
  return walls;
}

/** What the camera on its deck keeps clear of and inboard of, by its hull's number: its sides, masts and spars. */
export function deckCameraBlocks(hull: number): Block[] {
  const deck = HULL_DECKS[hull] ?? HULL_DECKS[0];
  return [...(deck ? sideBoxes(deck) : []), ...sparBoxes(hull)];
}

/** Its masts and spars by its hull's number (0 the Sloop to 3 the Frigate), as boxes on its deck. */
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
