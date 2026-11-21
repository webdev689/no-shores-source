// Where each word, mark and the key stand on the held map, worked out before anything is painted: every word at a
// size that grows with the map, inside the part of the parchment the gauntlets leave clear, and never over another
// word or mark. A word that finds no clear place is dropped, the least needed first. Nothing here draws.
import { type Rect, stageOf } from './heldMapLaw.ts';
import { keyCorners, keyEdges, type KeyPlace, keyPlace } from './mapKey.ts';

/** The words' sizes at a 1280 x 720 screen, pixels: every word at least `WORD_PX`, a port's name a step larger. They
 *  grow with the map, `letterScale` times over, and every other length the lettering is drawn with grows with them. */
export const WORD_PX = 13;
export const PORT_PX = 15;
/** A line of the map's words, the gap between a mark and its name, and the clear space every word keeps round it. */
export const LINE = 16;
export const NAME_GAP = 5;
const SPACE = 2;
/** How far a water's ring stands out from its name either side, and its words' half height within it. */
export const RING = 6;
/** Each mark's half width: a port's filled ring, a ruin's diamond, a node's ring, and the ship's arrow. */
const MARK_HALF: Readonly<Record<string, number>> = { port: 4.5, ruin: 5, ship: 10 };
const NODE_HALF = 4;
/** The clear gap a mark keeps round it from a mark laid before it, units. */
const MARK_GAP = 1.5;
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
  /** A water's colour on the difficulty ramp, which its name and its ring are inked in. */
  readonly colour?: string | undefined;
  /** A water's words lettered as two lines, its name over its level band (`waterLines`), where one would not fit. */
  readonly lines?: 1 | 2 | undefined;
}

/** A water's words as the lines they are lettered in: "The Fen Deeps, 22-26" whole, or its name over "22-26". */
export function waterLines(text: string, lines: 1 | 2 | undefined): string[] {
  const comma = text.lastIndexOf(', ');
  return lines === 2 && comma > 0 ? [text.slice(0, comma), text.slice(comma + 2)] : [text];
}

/** A word's width, units, as `widthOf` measures its kind's face: a water's on two lines the wider line's. */
export function nameWidth(
  letter: Pick<MapLetter, 'text' | 'kind' | 'lines'>,
  widthOf: (text: string, kind: string) => number,
) {
  return Math.max(...waterLines(letter.text, letter.lines).map((line) => widthOf(line, letter.kind)));
}

/** What one frame letters on the parchment, ink pixels from the map's top-left: the words and marks (each place's
 *  first, in the order asked, at its mark), the ship's arrow (null off the map), the key, and how many times over
 *  they are drawn at their sizes (`letterScale`). */
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
  /** Each water in view: its name, its continent's index, its colour, and the spots its name may stand at, ink pixels,
   *  the likeliest first (`HeldMapWaters.letters`). */
  readonly waters: readonly {
    text: string;
    continent: number;
    colour?: string | undefined;
    spots: readonly { x: number; y: number }[];
  }[];
  readonly ship: { readonly x: number; readonly y: number; readonly heading: number } | null;
  /** A word's width in its kind's face, units. */
  readonly widthOf: (text: string, kind: string) => number;
  /** How a box, ink pixels, stands on the sea of the water whose continent's index is given: 2 wholly, 1 on no land
   *  with its middle on it, 0 not at all (`onOwnSea`). */
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
 *  in its ring; each with the clear space a word keeps. */
export function nameBox(
  letter: Pick<MapLetter, 'x' | 'y' | 'kind' | 'away' | 'lines'>,
  side: 'right' | 'left' | 'centre',
  width: number,
  scale: number,
): Rect {
  const height = (letter.kind === 'water' ? LINE * (letter.lines ?? 1) + 2 : LINE) * scale;
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

/** Lays the map's lettering out: the ship and every mark first, then each name in its priority, beside its mark
 *  (right, else left), or a water's at the first of its spots wholly on its own sea, else on no land; then the key by its
 *  clear-corner rule (`keyPlace`). Every name stands inside the map and clear of the hands, of every mark and of every
 *  name laid before it. With no corner clear, the key takes the corner that costs least, and the names are laid again
 *  round it. */
export function layOut(ask: LayoutAsk): Lettering {
  const { scale, ink } = ask;
  const spacedPlaces = spaced(ask.places, scale, ink);
  const marks: Rect[] = spacedPlaces.map((place) => markBox(place.kind, place.x, place.y, scale));
  if (ask.ship) marks.push(markBox('ship', ask.ship.x, ask.ship.y, scale));
  const asked = [
    ...spacedPlaces.map((place) => ({ ...place, continent: -1, colour: undefined as string | undefined, spots: [] })),
    ...ask.waters.map((water) => ({ ...water, x: 0, y: 0, kind: 'water', chosen: false })),
  ];
  const first = laidOut(ask, asked, [...ask.covers, ...marks]);
  if (!ask.key) return { letters: first.letters, ship: ask.ship, key: null, scale };
  const size = { width: ask.key.width * scale, height: ask.key.height * scale };
  const clearKey = keyPlace(ink, size, scale, [...ask.covers, ...marks, ...first.boxes], ask.land, ask.current);
  if (clearKey) return { letters: first.letters, ship: ask.ship, key: clearKey, scale };
  // No corner clear: the key takes a corner, or a place along the top or bottom edge, clear of the hands, the marks and
  // the ports' and the chosen place's names (where it stood first),
  // round which the names laid again lose least: a water's name lost counts ten, land under the key five, any other
  // name lost one.
  const kept = first.boxes.filter(
    (box, index) => asked[first.indices[index]!]?.chosen || first.kinds[index] === 'port',
  );
  const yielding = [...ask.covers, ...marks, ...kept];
  const places = [
    ...(ask.current ? [ask.current] : []),
    ...keyCorners(ink, size, scale, null),
    ...keyEdges(ink, size, scale),
  ];
  const tries = places
    .filter((place) => !yielding.some((box) => overlaps(box, place.box)))
    .map((place) => {
      const again = laidOut(ask, asked, [...ask.covers, ...marks, place.box]);
      const named = (kind: string) =>
        again.letters.filter((letter) => (kind === 'water') === (letter.kind === 'water') && letter.side).length;
      const lost = (named('water') - first.letters.filter((letter) => letter.kind === 'water').length) * -10;
      const lesser = first.letters.filter((letter) => letter.kind !== 'water' && letter.side).length - named('place');
      return { place, again, cost: (ask.land(place.box) ? 5 : 0) + lost + lesser };
    });
  const best = tries.reduce<(typeof tries)[number] | null>(
    (most, each) => (most && most.cost <= each.cost ? most : each),
    null,
  );
  if (!best) return { letters: first.letters, ship: ask.ship, key: null, scale };
  const { place: key, again } = best;
  return { letters: again.letters, ship: ask.ship, key, scale };
}

/** Which marks stand where they lie when two meet: a port's, then a ruin's, then any node's. */
const markRank = (kind: string) => {
  const rank = ['port', 'ruin'].indexOf(kind);
  return rank < 0 ? 2 : rank;
};

/** The places with every mark clear of every other, laid ports first, then ruins, then nodes: a mark that meets one
 *  laid before it moves out along the line between their middles, just far enough to clear every mark. */
function spaced<T extends { x: number; y: number; kind: string }>(
  places: readonly T[],
  scale: number,
  ink: { readonly width: number; readonly height: number },
): T[] {
  const order = places
    .map((place, index) => ({ place, index }))
    .sort((one, other) => markRank(one.place.kind) - markRank(other.place.kind) || one.index - other.index);
  const laid: Rect[] = [];
  const out = [...places];
  const inside = (box: Rect) =>
    box.x >= 0 && box.y >= 0 && box.x + box.width <= ink.width && box.y + box.height <= ink.height;
  for (const { place, index } of order) {
    const boxAt = (x: number, y: number) => markBox(place.kind, x, y, scale);
    const clear = (box: Rect) => inside(box) && !laid.some((each) => overlaps(each, box));
    let stand: readonly [number, number] = [place.x, place.y];
    const hit = laid.find((box) => overlaps(box, boxAt(place.x, place.y)));
    if (hit) {
      const [middleX, middleY] = [hit.x + hit.width / 2, hit.y + hit.height / 2];
      const line = place.x === middleX && place.y === middleY ? 0 : Math.atan2(place.y - middleY, place.x - middleX);
      const reach = hit.width / 2 + markHalf(place.kind) * scale;
      // Out along the line from the mark it meets to the first spot clear of every mark and inside the map; where
      // that way is blocked, the same a twelfth of a turn either side, then two. With none, it stands where it lies.
      search: for (let turn = 0; turn < 12; turn++) {
        const angle = line + (Math.PI / 6) * (turn % 2 ? -Math.ceil(turn / 2) : turn / 2);
        const [towardX, towardY] = [Math.cos(angle), Math.sin(angle)];
        const first = Math.min(reach / Math.abs(towardX), reach / Math.abs(towardY)) + 0.01;
        for (let along = first; along < first + 6 * reach; along += scale) {
          const spot = [middleX + towardX * along, middleY + towardY * along] as const;
          if (clear(boxAt(...spot))) {
            stand = spot;
            break search;
          }
        }
      }
    }
    const box = boxAt(...stand);
    // Grown by a clear gap, so two marks never stand edge to edge, read as one.
    const gap = MARK_GAP * scale;
    laid.push({ x: box.x - gap, y: box.y - gap, width: box.width + gap * 2, height: box.height + gap * 2 });
    out[index] = { ...place, x: stand[0], y: stand[1] };
  }
  return out;
}

type Asked = {
  text: string;
  x: number;
  y: number;
  kind: string;
  chosen: boolean;
  continent: number;
  colour?: string | undefined;
  spots: readonly { x: number; y: number }[];
};

/** Each name laid in its priority, clear of `blocked` and of the names before it: the letters, and each laid name's
 *  box with its kind and its place in `asked`. */
function laidOut(ask: LayoutAsk, asked: readonly Asked[], blocked: readonly Rect[]) {
  const { scale, ink } = ask;
  const taken = [...blocked];
  const within = (box: Rect) =>
    box.x >= 0 && box.y >= 0 && box.x + box.width <= ink.width && box.y + box.height <= ink.height;
  const clear = (box: Rect) => within(box) && !taken.some((each) => overlaps(each, box));
  const order = asked
    .map((letter, index) => ({ letter, index }))
    .sort(
      (one, other) =>
        Number(other.letter.chosen) - Number(one.letter.chosen) ||
        rankOf(one.letter.kind) - rankOf(other.letter.kind) ||
        one.index - other.index,
    );
  const laid: (MapLetter | null)[] = asked.map(() => null);
  const boxes: Rect[] = [];
  const kinds: string[] = [];
  const indices: number[] = [];
  const keep = (box: Rect, index: number, kind: string) => {
    taken.push(box);
    boxes.push(box);
    kinds.push(kind);
    indices.push(index);
  };
  for (const { letter, index } of order) {
    const width = ask.widthOf(letter.text, letter.kind);
    if (letter.kind === 'water') {
      // On one line or two, wholly on its own sea at any spot that allows it, else on no land, its middle on its sea.
      let found: { spot: { x: number; y: number }; lines: 1 | 2; box: Rect } | null = null;
      for (const sea of [2, 1] as const)
        for (const lines of [1, 2] as const) {
          if (found) break;
          const shape = { kind: 'water', lines, text: letter.text };
          const boxAt = (point: { x: number; y: number }): Rect =>
            nameBox({ ...point, ...shape }, 'centre', nameWidth(shape, ask.widthOf), scale);
          const fits = letter.spots.find(
            (each) => clear(boxAt(each)) && ask.sea(boxAt(each), letter.continent) === sea,
          );
          if (fits) found = { spot: fits, lines, box: boxAt(fits) };
        }
      if (!found) continue;
      keep(found.box, index, 'water');
      laid[index] = {
        text: letter.text,
        kind: 'water',
        chosen: false,
        colour: letter.colour,
        ...found.spot,
        side: 'centre',
        lines: found.lines,
      };
      continue;
    }
    const place = { text: letter.text, x: letter.x, y: letter.y, kind: letter.kind, chosen: letter.chosen };
    const spot = besideSpots(place, ask.ship, scale).find((each) => clear(nameBox(each, each.side, width, scale)));
    if (spot) keep(nameBox(spot, spot.side, width, scale), index, letter.kind);
    laid[index] = spot ?? { ...place, side: null };
  }
  return { letters: laid.filter((letter) => letter !== null), boxes, kinds, indices };
}
