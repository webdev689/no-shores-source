// Where each word, mark and the key stand on the held map, worked out before anything is painted: every word at a
// size that grows with the map, inside the part of the parchment the gauntlets leave clear, and never over another
// word or mark. A word that finds no clear place is dropped, the least needed first. Nothing here draws.
import { type Rect, stageOf } from './heldMapLaw.ts';
import { keyCorners, type KeyPlace, keyPlace } from './mapKey.ts';

/** The words' sizes at a 1280 x 720 screen, pixels: every word at least `WORD_PX`, a port's name a step larger. They
 *  grow with the map, `letterScale` times over, and every other length the lettering is drawn with grows with them. */
export const WORD_PX = 13;
export const PORT_PX = 15;
/** A line of the map's words, the gap between a mark and its name, and the clear space every word keeps round it. */
export const LINE = 16;
export const NAME_GAP = 5;
const SPACE = 2;
/** How far a water's ring stands out from her name either side, and her words' half height within it. */
export const RING = 6;
/** Each mark's half width: a port's filled ring, a ruin's diamond, a node's ring, and the ship's arrow. */
const MARK_HALF: Readonly<Record<string, number>> = { port: 4.5, ruin: 5, ship: 10 };
const NODE_HALF = 4;
export const markHalf = (kind: string) => MARK_HALF[kind] ?? NODE_HALF;

/** Who is lettered first, and who is dropped first when no clear place is left: ports, waters' names, ruins, then
 *  nodes. The ship's arrow and every place's mark stand where they lie and are never dropped. */
const PRIORITY: readonly string[] = ['port', 'water', 'ruin'];
const rankOf = (kind: string) => {
  const rank = PRIORITY.indexOf(kind);
  return rank < 0 ? PRIORITY.length : rank;
};

/** The gauntlets' cover over the parchment, as shares of the painting: where the thumbs of every set reach in over
 *  the map in any frame of their fidget, measured from the forge's art (each strip's frame is 274 x 181 texels). */
export const HANDS_COVER: readonly Rect[] = [
  { x: 0, y: 81 / 181, width: 80 / 274, height: 21 / 181 },
  { x: 195 / 274, y: 84 / 181, width: 79 / 274, height: 20 / 181 },
];

/** How many times over the map's words and marks are drawn at their sizes: once at a 1280 x 720 screen, growing
 *  with the map on a larger one and never shrinking below. */
const REFERENCE_INK = stageOf({ width: 1280, height: 720 }).ink;
export function letterScale(ink: { readonly height: number }): number {
  return Math.max(1, ink.height / REFERENCE_INK.height);
}

/** The gauntlets' cover over the map, ink pixels, for the painting at `sprite` and the map at `ink` (screen pixels). */
export function handsCover(sprite: Rect, ink: Rect): Rect[] {
  return HANDS_COVER.map((cover) => ({
    x: sprite.x + cover.x * sprite.width - ink.x,
    y: sprite.y + cover.y * sprite.height - ink.y,
    width: cover.width * sprite.width,
    height: cover.height * sprite.height,
  }));
}

/** A place's mark and name on the map, ink pixels: its name beside its mark (`side`, or null where it found no clear
 *  place and is dropped), or a water's name centred on its point. */
export interface MapLetter {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  readonly chosen: boolean;
  readonly side: 'right' | 'left' | 'centre' | null;
  /** How far a place's name stands from its mark's middle, units: past its mark, or past the ship's arrow where that
   *  stands on it. */
  readonly away?: number | undefined;
  /** A water's colour on the difficulty ramp, which her name and its ring are inked in. */
  readonly colour?: string | undefined;
}

/** What one frame letters on the parchment, ink pixels from the map's top-left: the words and marks, the ship's
 *  arrow (null off the map), the key, and how many times over they are drawn at their sizes (`letterScale`). */
export interface Lettering {
  readonly letters: readonly MapLetter[];
  readonly ship: { readonly x: number; readonly y: number; readonly heading: number } | null;
  readonly key: KeyPlace | null;
  readonly scale: number;
}

/** What the map asks to letter: places and waters at their points, ink pixels, and the key's size, in the words'
 *  units (pixels at a scale of 1). */
export interface LayoutAsk {
  readonly ink: { readonly width: number; readonly height: number };
  readonly scale: number;
  /** What the hands cover, ink pixels (`handsCover`). */
  readonly covers: readonly Rect[];
  readonly places: readonly { text: string; x: number; y: number; kind: string; chosen: boolean }[];
  readonly waters: readonly { text: string; x: number; y: number; continent: number; colour?: string | undefined }[];
  readonly ship: { readonly x: number; readonly y: number; readonly heading: number } | null;
  /** A word's width in its kind's face, units. */
  readonly widthOf: (text: string, kind: string) => number;
  /** How well a box, ink pixels, stands on the sea of the water whose continent's index is given: 2 wholly, 1 off
   *  land with its middle on hers, 0 not at all (`onOwnSea`). */
  readonly sea: (box: Rect, continent: number) => 0 | 1 | 2;
  /** Whether discovered land lies under a box, ink pixels. */
  readonly land: (box: Rect) => boolean;
  /** The key's panel's size, units; null while the waters are not open. */
  readonly key: { readonly width: number; readonly height: number } | null;
  readonly current: KeyPlace | null;
}

const overlaps = (one: Rect, other: Rect) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height;

/** The box a mark covers, ink pixels. */
export function markBox(kind: string, x: number, y: number, scale: number): Rect {
  const half = markHalf(kind) * scale;
  return { x: x - half, y: y - half, width: half * 2, height: half * 2 };
}

/** The box a name covers, ink pixels, its text `width` units wide: beside its mark on `side`, or a water's centred
 *  in her ring; each with the clear space a word keeps. */
export function nameBox(
  letter: Pick<MapLetter, 'x' | 'y' | 'kind' | 'away'>,
  side: 'right' | 'left' | 'centre',
  width: number,
  scale: number,
): Rect {
  const height = (letter.kind === 'water' ? LINE + 2 : LINE) * scale;
  const top = letter.y - height / 2 - SPACE * scale;
  if (side === 'centre') {
    const half = (width / 2 + RING) * scale;
    return {
      x: letter.x - half - SPACE * scale,
      y: top,
      width: half * 2 + SPACE * 2 * scale,
      height: height + SPACE * 2 * scale,
    };
  }
  const reach = (letter.away ?? markHalf(letter.kind) + NAME_GAP) * scale;
  const span = (width + SPACE * 2) * scale;
  const x = side === 'right' ? letter.x + reach - SPACE * scale : letter.x - reach - width * scale - SPACE * scale;
  return { x, y: top, width: span, height: height + SPACE * 2 * scale };
}

/** Where a place's name may stand: right of its mark, then left; where the ship's arrow stands on the mark, right and
 *  left of the arrow after. */
function besideSpots<T extends { x: number; y: number; kind: string }>(
  letter: T,
  ship: { x: number; y: number } | null,
  scale: number,
): (T & { side: 'right' | 'left'; away: number | undefined })[] {
  const spots = (['right', 'left'] as const).map((side) => ({
    ...letter,
    side,
    away: undefined as number | undefined,
  }));
  if (ship && overlaps(markBox('ship', ship.x, ship.y, scale), markBox(letter.kind, letter.x, letter.y, scale))) {
    const past = markHalf('ship') + NAME_GAP;
    spots.push({ ...letter, side: 'right', away: past + (ship.x - letter.x) / scale });
    spots.push({ ...letter, side: 'left', away: past + (letter.x - ship.x) / scale });
  }
  return spots;
}

/** Where a water's name may stand, nearest her point first: on it, then a line and two above and below, each held
 *  inside the map and, where it would lie under a hand, moved inward clear of that hand. */
function waterSpots(ask: LayoutAsk, water: { x: number; y: number }, width: number): { x: number; y: number }[] {
  const { scale, ink } = ask;
  const half = (width / 2 + RING + SPACE) * scale;
  const rise = (LINE / 2 + SPACE + 1) * scale;
  const inside = (x: number) => Math.min(Math.max(x, half), ink.width - half);
  const spots: { x: number; y: number }[] = [];
  for (const lines of [0, -1, 1, -2, 2]) {
    const y = Math.min(Math.max(water.y + lines * (LINE + 4) * scale, rise), ink.height - rise);
    const x = inside(water.x);
    spots.push({ x, y });
    for (const cover of ask.covers) {
      const under = y + rise > cover.y && y - rise < cover.y + cover.height;
      if (!under || x + half <= cover.x || x - half >= cover.x + cover.width) continue;
      const inward = cover.x + cover.width / 2 < ink.width / 2 ? cover.x + cover.width + half : cover.x - half;
      spots.push({ x: inside(inward), y });
    }
  }
  return spots;
}

/** Lays the map's lettering out: the ship and every mark first, then each name in its priority, beside its mark
 *  (right, else left) or, a water's, on her point or near it and on her own sea; then the key by its
 *  clear-corner rule (`keyPlace`). Every name stands inside the map and clear of the hands, of every mark and of
 *  every name laid before it. */
export function layOut(ask: LayoutAsk): Lettering {
  const { scale, ink } = ask;
  const within = (box: Rect) =>
    box.x >= 0 && box.y >= 0 && box.x + box.width <= ink.width && box.y + box.height <= ink.height;
  const taken: Rect[] = [...ask.covers];
  const marks: Rect[] = ask.places.map((place) => markBox(place.kind, place.x, place.y, scale));
  if (ask.ship) marks.push(markBox('ship', ask.ship.x, ask.ship.y, scale));
  taken.push(...marks);
  const clear = (box: Rect) => within(box) && !taken.some((each) => overlaps(each, box));
  const asked = [
    ...ask.places.map((place) => ({ ...place, colour: undefined as string | undefined })),
    ...ask.waters.map((water) => ({ ...water, kind: 'water', chosen: false })),
  ];
  const order = asked
    .map((letter, index) => ({ letter, index }))
    .sort(
      (one, other) =>
        Number(other.letter.chosen) - Number(one.letter.chosen) ||
        rankOf(one.letter.kind) - rankOf(other.letter.kind) ||
        one.index - other.index,
    );
  const laid: (MapLetter | null)[] = asked.map(() => null);
  const boxes: (Rect | null)[] = asked.map(() => null);
  for (const { letter, index } of order) {
    const width = ask.widthOf(letter.text, letter.kind);
    if (letter.kind === 'water') {
      const boxAt = (spot: { x: number; y: number }) => nameBox({ ...spot, kind: 'water' }, 'centre', width, scale);
      const continent = (letter as { continent?: number }).continent ?? -1;
      // Wholly on her own sea where any spot is, else on no land with her middle on her sea.
      const spots = waterSpots(ask, letter, width).filter((each) => clear(boxAt(each)));
      const spot =
        spots.find((each) => ask.sea(boxAt(each), continent) === 2) ??
        spots.find((each) => ask.sea(boxAt(each), continent) === 1);
      if (!spot) continue;
      taken.push((boxes[index] = boxAt(spot)));
      laid[index] = { ...letter, ...spot, side: 'centre' };
      continue;
    }
    const spot = besideSpots(letter, ask.ship, scale).find((each) => clear(nameBox(each, each.side, width, scale)));
    if (spot) taken.push((boxes[index] = nameBox(spot, spot.side, width, scale)));
    laid[index] = spot ?? { ...letter, side: null };
  }
  if (!ask.key) return { letters: laid.filter((letter) => letter !== null), ship: ask.ship, key: null, scale };
  const size = { width: ask.key.width * scale, height: ask.key.height * scale };
  let key = keyPlace(ink, size, scale, taken, ask.land, ask.current);
  if (!key) {
    // No corner clear: the key takes a corner clear of the hands, the marks and the ports' and the chosen place's
    // names, over no land where it can, dropping the fewest names under it, a water's counting as ten.
    const kept = boxes.filter((box, index) => box && (asked[index]?.chosen || rankOf(asked[index]?.kind ?? '') === 0));
    const yielding = [...ask.covers, ...marks, ...(kept as Rect[])];
    const cost = (place: KeyPlace) =>
      (ask.land(place.box) ? 1000 : 0) +
      boxes.reduce(
        (sum, box, index) => sum + (box && overlaps(box, place.box) ? (asked[index]?.kind === 'water' ? 10 : 1) : 0),
        0,
      );
    const open = keyCorners(ink, size, scale, ask.current).filter(
      (place) => !yielding.some((box) => overlaps(box, place.box)),
    );
    key = open.reduce<KeyPlace | null>((best, place) => (best && cost(best) <= cost(place) ? best : place), null);
    if (key) {
      const under = key.box;
      boxes.forEach((box, index) => {
        const letter = laid[index];
        if (!box || !letter || !overlaps(box, under)) return;
        laid[index] = letter.kind === 'water' ? null : { ...letter, side: null };
      });
    }
  }
  return { letters: laid.filter((letter) => letter !== null), ship: ask.ship, key, scale };
}
