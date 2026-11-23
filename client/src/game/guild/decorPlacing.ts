import { DECOR_TURNS, type Plot, decorRefusal, pieceOf } from './outpostLaw.ts';
import { PLOT_M } from './outpostLaw.ts';
import type { Ground } from './outpostPlaces.ts';
import type { StripHint } from '../hints.ts';

/**
 * A piece of decoration being stood on an outpost's plot in the world: chosen on the Outposts page's Decorate part,
 * its ghost stands at the player's feet, snapped to a quarter metre and turned in steps by its keys, until it is
 * placed or let go. Its spot is the law's: metres from the plot's north-west corner, as the accounts take it.
 */

/** The piece being placed, at which site, and its turn in steps; and the accounts' last word on placing it. */
export interface Placing {
  readonly site: string;
  readonly piece: string;
  turn: number;
  said: string | null;
}

/** The keys shown on the hint strip while a piece is placed. */
export const PLACING_HINTS: readonly StripHint[] = [
  ['[ ]', 'Turn'],
  ['use', 'Place'],
  ['Escape', 'Let go'],
];

let placing: Placing | null = null;

/** Turns the ghost a step either way, or lets it go. */
function heard(event: KeyboardEvent): void {
  if (!placing) return;
  if (event.key === 'Escape') letGo();
  else if (event.key === '[' || event.key === ']') {
    placing.turn = (placing.turn + (event.key === ']' ? 1 : DECOR_TURNS - 1)) % DECOR_TURNS;
    placing.said = null;
  }
}

/** Begins placing a piece at a site. */
export function startPlacing(site: string, piece: string): void {
  if (!placing) addEventListener('keydown', heard);
  placing = { site, piece, turn: 0, said: null };
}

/** Lets the piece go. */
export function letGo(): void {
  if (placing) removeEventListener('keydown', heard);
  placing = null;
}

/** The piece being placed, if any. */
export const placingNow = (): Placing | null => placing;

/** Where the ghost of a piece stands for feet at (`x`, `y`) on a plot's ground, in metres from the plot's corner
 *  snapped to a quarter, and the law's words where it may not stand (null where it may). */
export function ghostOf(
  placed: Pick<Placing, 'piece' | 'turn'>,
  feet: readonly [number, number],
  plot: Plot,
  ground: Ground,
) {
  const quarter = (value: number) => Math.round(value * 4) / 4;
  const decor = {
    piece: placed.piece,
    x: quarter(feet[0] - (ground.plot[0] - PLOT_M / 2)),
    y: quarter(feet[1] - (ground.plot[1] - PLOT_M / 2)),
    turn: placed.turn,
  };
  return { decor, refusal: decorRefusal(plot, decor), name: pieceOf(placed.piece)?.name ?? 'piece' };
}
