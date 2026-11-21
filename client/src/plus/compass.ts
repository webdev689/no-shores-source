// The compass across the top of the screen, after DFO's Enhanced HUD: a strip a quarter of the circle wide, its eight
// points placed by the way the view looks and hidden off its ends, a brass needle at its middle, and over it a mark for
// each ship round the player at its bearing, held at the end nearer it while it is off the strip, so the strip says
// which way to turn. A point off the strip is hidden, never held at an end: one held there would say "north is exactly
// there", which is a lie.
import { HALO, TONES } from './tones.ts';

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

/** A place the compass marks beside the ships: a public event's ground, or its heroic task's mark (the growth, the
 *  tithe-taker), at its bearing as a ship's is, held at the end nearer it while off the strip. */
export interface PlaceMark {
  readonly x: number;
  readonly y: number;
  readonly kind: 'event' | 'heroic' | 'chest' | 'store';
}

/** The ships the compass marks of `ships` round a player at `from`: those within their range. */
export function shipsMarked(ships: readonly ShipMark[], from: readonly [number, number]): ShipMark[] {
  return ships.filter((ship) => Math.hypot(ship.x - from[0], ship.y - from[1]) <= (ship.rangeM ?? SHIP_MARK_RANGE_M));
}

const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

function made(tag: string, className: string, parent: HTMLElement, text = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

/** The compass: its strip of points, its needle, and its ships' marks, made once and moved each frame, a mark no
 *  longer wanted hidden rather than removed. */
export class Compass {
  readonly root: HTMLElement;
  private readonly points: readonly { readonly node: HTMLElement; readonly bearing: number }[];
  private readonly ships: HTMLElement[] = [];
  private readonly places: HTMLElement[] = [];

  constructor(parent: HTMLElement) {
    this.root = made('div', 'compass', parent);
    // Its letters, read in a row, would say nothing of the bearing: a screen reader skips the strip.
    this.root.ariaHidden = 'true';
    const strip = made('div', 'compass-strip', this.root);
    this.points = COMPASS_POINTS.map(([letters, bearing]) => ({
      node: made('span', `compass-point${letters.length === 1 ? ' cardinal' : ''}`, strip, letters),
      bearing,
    }));
    made('i', 'compass-needle', this.root);
  }

  /** Turns the strip to `heading` (turns from north) and marks `ships` and `places` round a player at `from`. */
  update(
    heading: number,
    from: readonly [number, number] = [0, 0],
    ships: readonly ShipMark[] = [],
    places: readonly PlaceMark[] = [],
  ): void {
    while (this.places.length < places.length) this.places.push(made('i', 'compass-place', this.root));
    this.places.forEach((node, index) => {
      const place = places[index];
      node.hidden = !place;
      if (!place) return;
      node.style.left = percent(markPlace([place.x, place.y], from, heading));
      node.dataset.kind = place.kind;
    });
    for (const { node, bearing } of this.points) {
      const place = compassPlace(bearing, heading);
      node.hidden = place === null;
      if (place !== null) node.style.left = percent(place);
    }
    const marked = shipsMarked(ships, from);
    while (this.ships.length < marked.length) this.ships.push(made('i', 'compass-ship', this.root));
    this.ships.forEach((node, index) => {
      const ship = marked[index];
      node.hidden = !ship;
      if (!ship) return;
      node.style.left = percent(markPlace([ship.x, ship.y], from, heading));
      node.style.borderBottomColor = SHIP_MARK_COLOURS[ship.kind];
    });
  }
}

/** The compass's sheet: the column it heads at the top of the screen, the strip, its points, the needle under its
 *  middle and the ships' marks on its top edge, a bow pointing up; a public event's places on its foot, the heroic mark
 *  blinking, which reduced motion holds still. */
export function compassCss(): string {
  const { top, width, share, height, rule, gap } = COMPASS;
  return `
.compass-column { position: absolute; left: 0; right: 0; top: ${top}px; display: flex; flex-direction: column;
  align-items: center; gap: ${gap}px; pointer-events: none; }
.compass { position: relative; flex: none; width: min(${width}px, ${share * 100}%); height: ${height}px;
  border-bottom: ${rule}px solid color-mix(in srgb, ${TONES.stoneMid} 55%, transparent); pointer-events: none;
  box-shadow: 0 1px 0 color-mix(in srgb, ${TONES.outline} 50%, transparent);
  font-weight: 600; }
.compass [hidden] { display: none !important; }
/* A point at an end fades out rather than being cut in half, where half of NE would read as N. */
.compass-strip { position: absolute; inset: 0; overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
.compass-point { position: absolute; top: 8px; translate: -50% 0; font-size: 11px; line-height: 11px; letter-spacing: 0.18em;
  color: ${TONES.wordDim}; text-shadow: ${HALO}; }
.compass-point.cardinal { top: 2px; font-size: 22px; line-height: 22px; color: ${TONES.word}; }
.compass-needle { position: absolute; left: 50%; bottom: -${rule}px; width: 2px; height: 8px; translate: -50% 0;
  background: ${TONES.brass}; box-shadow: 0 0 0 1px ${TONES.outline}; }
/* A public event's ground, a gold diamond on the strip's foot; its heroic task's mark, an orange one, pulsing. */
.compass-place { position: absolute; bottom: -6px; width: 9px; height: 9px; margin-left: -5px; rotate: 45deg;
  background: #e9b44c; box-shadow: 0 0 0 1px ${TONES.outline}, 0 0 5px rgba(233,180,76,0.8); }
.compass-place[data-kind='heroic'] { background: #ff7a3d; box-shadow: 0 0 0 1px ${TONES.outline}, 0 0 6px #ff7a3d;
  animation: compass-pulse 0.8s steps(2, end) infinite; }
@keyframes compass-pulse { 50% { opacity: 0.4; } }
/* A chest waiting, a smaller gold one; a store under attack, a red one, pulsing. */
.compass-place[data-kind='chest'] { width: 7px; height: 7px; margin-left: -4px; bottom: -5px; }
.compass-place[data-kind='store'] { background: #e0483c; box-shadow: 0 0 0 1px ${TONES.outline}, 0 0 6px #e0483c;
  animation: compass-pulse 0.5s steps(2, end) infinite; }
@media (prefers-reduced-motion: reduce) { .compass-place[data-kind='heroic'], .compass-place[data-kind='store'] {
  animation: none; } }
.compass-ship { position: absolute; top: 0; width: 0; height: 0; margin-left: -4px; border-left: 4px solid transparent;
  border-right: 4px solid transparent; border-bottom: 5px solid; filter: drop-shadow(0 0 1px rgba(0,0,0,0.9)); }
`;
}

const SHEET_ID = 'plus-compass';

/** Lays the compass's sheet on `page`, once. */
export function wearCompass(page: Document): void {
  if (page.getElementById(SHEET_ID)) return;
  const sheet = page.createElement('style');
  sheet.id = SHEET_ID;
  sheet.textContent = compassCss();
  page.head.append(sheet);
}
