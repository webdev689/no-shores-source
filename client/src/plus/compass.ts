// The compass across the top of the screen, after DFO's Enhanced HUD: a strip a quarter of the circle wide, its eight
// points placed by the way the view looks and hidden off its ends, a brass needle at its middle, and over it a mark for
// each ship round the player at its bearing, held at the end nearer it while it is off the strip, so the strip says
// which way to turn. A point off the strip is hidden, never held at an end: one held there would say "north is exactly
// there", which is a lie.

/** The eight points in the order a player turning clockwise meets them, each at its bearing in turns from north. */
export const COMPASS_POINTS: readonly (readonly [string, number])[] = [
  ['N', 0],
  ['NE', 0.125],
  ['E', 0.25],
  ['SE', 0.375],
  ['S', 0.5],
  ['SW', 0.625],
  ['W', 0.75],
  ['NW', 0.875],
];

/** How much of the circle the strip shows at once: wide enough that two points always show, narrow enough that a turn
 *  moves it. Its marks stand on the same quarter turn, so a mark at a point's bearing stands under its letter. */
export const COMPASS_SPAN = 0.25;

/** The compass's place and size in CSS pixels: how far down it stands, its width (at most `width`, or `share` of a
 *  narrower screen), its strip's height and the rule under it, and the gap to what stands under it. */
export const COMPASS = { top: 18, width: 520, share: 0.6, height: 26, rule: 2, gap: 10 } as const;

/** How far down the first thing under the compass stands, in CSS pixels. */
export const UNDER_COMPASS = COMPASS.top + COMPASS.height + COMPASS.rule + COMPASS.gap;

/** What a ship is to the player, which colours its mark: one that would take the player, another player's, one whose
 *  colours are down, or a friendly merchantman in Overlook's blue. */
export type ShipMarkKind = 'hostile' | 'ship' | 'struck' | 'friendly';
export const SHIP_MARK_COLOURS: Readonly<Record<ShipMarkKind, string>> = {
  hostile: '#ee5745',
  ship: '#ebe0c2',
  struck: '#8f8f8f',
  friendly: '#2f5d9a',
};
/** Ships farther off than this, in metres, have no mark, but one that names its own range. */
export const SHIP_MARK_RANGE_M = 900;

/** A ship the compass marks: where it lies (metres, x east and y south), what it is to the player, and how far off
 *  it is marked from (a hostile ship's sight; `SHIP_MARK_RANGE_M` where none is named). */
export interface ShipMark {
  readonly x: number;
  readonly y: number;
  readonly kind: ShipMarkKind;
  readonly rangeM?: number;
}

const turnsOf = (radians: number) => {
  const turns = radians / (2 * Math.PI);
  return turns - Math.floor(turns);
};
/** `apart` turns brought the shortest way round, between -0.5 and 0.5. */
const shortest = (apart: number) => apart - Math.round(apart);

/** The bearing a camera looks at, in turns clockwise from north, from the way it looks (x east, y south, z up). */
export function headingOf(forward: readonly [number, number, number]): number {
  return turnsOf(Math.atan2(forward[0], -forward[1]));
}

/** Where a point at `bearing` (turns) stands on the strip of a view looking at `heading`: 0 at its left end, 1 at its
 *  right; null off the strip. The shortest way round, so a point just west of north is left of a view looking north. */
export function compassPlace(bearing: number, heading: number, span = COMPASS_SPAN): number | null {
  const apart = shortest(bearing - heading);
  if (Math.abs(apart) > span / 2) return null;
  return apart / span + 0.5;
}

/** Where a mark at `spot` stands on the strip of a player at `from` looking at `heading`: at its bearing while on the
 *  strip, held at the end nearer it, the side to turn toward, while off it; dead ahead where the player stands on it. */
export function markPlace(
  spot: readonly [number, number],
  from: readonly [number, number],
  heading: number,
  span = COMPASS_SPAN,
): number {
  const [east, south] = [spot[0] - from[0], spot[1] - from[1]];
  if (Math.hypot(east, south) < 1e-9) return 0.5;
  const apart = shortest(turnsOf(Math.atan2(east, -south)) - heading);
  return Math.min(1, Math.max(0, apart / span + 0.5));
}

/** The ships the compass marks of `ships` round a player at `from`: those within their range. */
export function shipsMarked(ships: readonly ShipMark[], from: readonly [number, number]): ShipMark[] {
  return ships.filter((ship) => Math.hypot(ship.x - from[0], ship.y - from[1]) <= (ship.rangeM ?? SHIP_MARK_RANGE_M));
}
