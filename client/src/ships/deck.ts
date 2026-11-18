// The Sloop's deck as the ships manifest holds it (tools/ships/deck.py measures it from her mesh): the grid of heights a
// walker stands on, in her own frame (x to her starboard, y to her stern, the origin amidships, metres over her
// waterline), and the spot behind her wheel where her helm is kept. The sea room stands its walkers on the same grid.
import ships from '../../../content/ships/ships.json' with { type: 'json' };
import { shipAxes } from './shipAxes.ts';

/** A ship's deck: its grid's west and north edges and square cell, its columns and rows, each cell's height row by
 *  row from the north (null where no body stands), and the spot behind her wheel. */
export interface Deck {
  readonly west: number;
  readonly north: number;
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  readonly heights: readonly (number | null)[];
  readonly helm: readonly [number, number];
}

interface DeckEntry {
  readonly cell_m: number;
  readonly west_m: number;
  readonly north_m: number;
  readonly columns: number;
  readonly rows: number;
  readonly heights_cm: readonly (readonly (number | null)[])[];
  readonly helm: readonly number[];
}

/** A deck from the manifest's entry; throws where its rows do not hold its cells. */
export function deckOf(entry: DeckEntry): Deck {
  const { columns, rows } = entry;
  if (entry.heights_cm.length !== rows || entry.heights_cm.some((row) => row.length !== columns))
    throw new Error(`a deck is not ${rows} rows of ${columns} cells`);
  const [helmX = 0, helmY = 0] = entry.helm;
  return {
    west: entry.west_m,
    north: entry.north_m,
    cell: entry.cell_m,
    columns,
    rows,
    // Centimetres to metres as the room's door divides them, so both hold the same numbers to the bit.
    heights: entry.heights_cm.flat().map((centimetres) => (centimetres === null ? null : centimetres / 100)),
    helm: [helmX, helmY],
  };
}

/** The Sloop's deck. */
export const SLOOP_DECK: Deck = deckOf(ships.ships.sloop.deck);

/** The deck as the movement crate's grid numbers it (`Heights::from_floats`): its shape, then each height, NaN for
 *  none. */
export function deckFloats(deck: Deck): number[] {
  return [deck.west, deck.north, deck.cell, deck.columns, deck.rows, ...deck.heights.map((height) => height ?? NaN)];
}

/** The height of the cell under (x, y) on her deck, or null where no body stands. */
export function cellHeight(deck: Deck, x: number, y: number): number | null {
  const column = Math.floor((x - deck.west) / deck.cell);
  const row = Math.floor((y - deck.north) / deck.cell);
  if (column < 0 || row < 0 || column >= deck.columns || row >= deck.rows) return null;
  return deck.heights[row * deck.columns + column] ?? null;
}

/** Each cell a body walks to from (x, y), from cell to cell across their edges, as its centre on her deck and its
 *  height: her walls and the rail tops beyond them left out. */
export function cellsReached(
  deck: Deck,
  x: number,
  y: number,
): { readonly x: number; readonly y: number; readonly z: number }[] {
  const { columns, rows, heights } = deck;
  const column = Math.floor((x - deck.west) / deck.cell);
  const row = Math.floor((y - deck.north) / deck.cell);
  if (cellHeight(deck, x, y) === null) return [];
  const reached = new Set([row * columns + column]);
  for (const cell of reached) {
    const [down, across] = [Math.floor(cell / columns), cell % columns];
    const near = [
      down > 0 && cell - columns,
      down < rows - 1 && cell + columns,
      across > 0 && cell - 1,
      across < columns - 1 && cell + 1,
    ];
    for (const next of near) if (next !== false && (heights[next] ?? null) !== null) reached.add(next);
  }
  return [...reached].map((cell) => ({
    x: deck.west + ((cell % columns) + 0.5) * deck.cell,
    y: deck.north + (Math.floor(cell / columns) + 0.5) * deck.cell,
    z: heights[cell] ?? 0,
  }));
}

/** Where a ship lies as she is drawn: her middle on the water, her heading (radians clockwise from north), how many
 *  times her size she is drawn, how far the swell lifts her, and her bow's rise and heel to starboard (radians). */
export interface Lying {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly scale: number;
  readonly heave: number;
  readonly pitch: number;
  readonly roll: number;
}

/** A point on her deck (x to her starboard, y to her stern, z over her waterline) in the world as she lies. */
export function deckToWorld(lying: Lying, x: number, y: number, z: number): readonly [number, number, number] {
  const [bow, starboard, up] = shipAxes(lying.heading, lying.pitch, lying.roll);
  const along = (axis: number) =>
    ((bow[axis] ?? 0) * -y + (starboard[axis] ?? 0) * x + (up[axis] ?? 0) * z) * lying.scale;
  return [lying.x + along(0), lying.y + along(1), lying.heave + along(2)];
}

/** A point in the world on her deck as she lies: `deckToWorld` undone. */
export function worldToDeck(lying: Lying, x: number, y: number, z: number): readonly [number, number, number] {
  const [bow, starboard, up] = shipAxes(lying.heading, lying.pitch, lying.roll);
  const offset = [(x - lying.x) / lying.scale, (y - lying.y) / lying.scale, (z - lying.heave) / lying.scale];
  const onto = (axis: readonly number[]) => offset.reduce((sum, value, index) => sum + value * (axis[index] ?? 0), 0);
  return [onto(starboard), -onto(bow), onto(up)];
}
