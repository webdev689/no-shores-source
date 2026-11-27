// Where each word, mark and the key stand on the held map, worked out before anything is painted: every word at a
// size that grows with the map, inside the part of the parchment the gauntlets leave clear, and never over another
// word or mark. A word that finds no clear place is dropped, the least needed first. A place is its mark alone, its
// name shown as the pointer passes over it; a sea's name is arched across its sea; an island's name carries its
// level band. Nothing here draws.
import { type Rect, stageOf } from './heldMapLaw.ts';
import { keyCorners, keyEdges, type KeyPlace, keyPlace } from './mapKey.ts';

/** The words' sizes at a 1280 x 720 screen, pixels: every word at least `WORD_PX`, a port's or an island's name a
 *  step larger, a sea's larger again. They grow with the map, `letterScale` times over, and every other length the
 *  lettering is drawn with grows with them. */
export const WORD_PX = 13;
export const PORT_PX = 15;
export const SEA_PX = 18;
/** A sea's name, arched across its sea: the room between its letters, units, and its size, pixels, spread wide where
 *  it fits, closer where it does not, and at a plain word's size where nothing larger fits; and the arc's radius, a
 *  share of the name's length along it. */
export const SEA_FITS: readonly { readonly spread: number; readonly px: number }[] = [
  { spread: 9, px: SEA_PX },
  { spread: 4, px: SEA_PX },
  { spread: 0, px: SEA_PX },
  { spread: 0, px: WORD_PX },
];
const ARCH_RADIUS = 0.85;
/** A line of the map's words, the gap between a mark and its name, and the clear space every word keeps round it. */
export const LINE = 16;
export const NAME_GAP = 5;
const SPACE = 2;
/** Each mark's half width: a port's anchor, a ruin's, a locked sea's padlock, a node's ring, and the ship's arrow. */
const MARK_HALF: Readonly<Record<string, number>> = { port: 6, ruin: 6, lock: 15, ship: 10 };
const NODE_HALF = 4;
/** The clear gap a mark keeps round it from a mark laid before it, units. */
const MARK_GAP = 1.5;
export const markHalf = (kind: string) => MARK_HALF[kind] ?? NODE_HALF;

/** Who is lettered first, and who is dropped first when no clear place is left: islands' names, then seas'. The
 *  ship's arrow, every place's mark and every lock stand where they lie and are never dropped. */
const PRIORITY: readonly string[] = ['island', 'water'];
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

/** A place's mark on the map, ink pixels (`side` null: its name is shown on hover), or a sea's or an island's name
 *  centred on its point. */
export interface MapLetter {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  readonly chosen: boolean;
  /** A place the quest walked names, ringed. */
  readonly quest?: boolean;
  readonly side: 'centre' | null;
  /** An island's level band, after its name, and the band's colour on the difficulty ramp. */
  readonly band?: string | undefined;
  readonly colour?: string | undefined;
  /** A sea's name: the room between its letters, units, and its size, pixels (`SEA_FITS`). */
  readonly spread?: number | undefined;
  readonly px?: number | undefined;
}

/** A sea's name arched along a circle: its `length` along the arc with its letters spread (units), the chord it spans
 *  and how far its middle rises over its ends. */
export function archOf(length: number): { readonly chord: number; readonly rise: number; readonly radius: number } {
  const radius = Math.max(1, length * ARCH_RADIUS);
  const half = length / (2 * radius);
  return { chord: 2 * radius * Math.sin(half), rise: radius * (1 - Math.cos(half)), radius };
}

/** A sea's name's length along its arc, units: its text `width` and the room between its letters. */
export const archedLength = (text: string, width: number, spread: number) =>
  width + spread * Math.max(0, [...text].length - 1);

/** What one frame letters on the parchment, ink pixels from the map's top-left: the words and marks (each place's
 *  first, in the order asked, at its mark), the ship's arrow (null off the map), the key, and how many times over
 *  they are drawn at their sizes (`letterScale`). */
export interface Lettering {
  readonly letters: readonly MapLetter[];
  readonly ship: { readonly x: number; readonly y: number; readonly heading: number } | null;
  readonly key: KeyPlace | null;
  readonly scale: number;
  /** The box each name laid covers, ink pixels. */
  readonly named: readonly Rect[];
}

/** What the map asks to letter: places and waters at their points, ink pixels, and the key's size, in the words'
 *  units (pixels at a scale of 1). */
export interface LayoutAsk {
  readonly ink: { readonly width: number; readonly height: number };
  readonly scale: number;
  /** What the hands cover, ink pixels (`handsCover`). */
  readonly covers: readonly Rect[];
  readonly places: readonly { text: string; x: number; y: number; kind: string; chosen: boolean; quest?: boolean }[];
  /** Each water in view: its name, its continent's index, and the spots its name may stand at, ink pixels, the
   *  likeliest first (`HeldMapWaters.letters`). */
  readonly waters: readonly { text: string; continent: number; spots: readonly { x: number; y: number }[] }[];
  /** Each named island in view: its name, its level band and the band's colour, at its middle, ink pixels. */
  readonly islands?: readonly { text: string; band: string; colour: string; x: number; y: number }[];
  /** A lock at the middle of each locked sea in view, ink pixels. */
  readonly locks?: readonly { x: number; y: number }[];
  readonly ship: { readonly x: number; readonly y: number; readonly heading: number } | null;
  /** A word's width in its kind's face, units. */
  readonly widthOf: (text: string, kind: string) => number;
  /** How a box, ink pixels, stands on the sea of the water whose continent's index is given: 2 wholly, 1 on no land
   *  with its middle on it, 0 not at all (`onOwnSea`). */
  readonly sea: (box: Rect, continent: number) => 0 | 1 | 2;
  /** Whether shown land lies under a box, ink pixels. */
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

/** The box a name covers, ink pixels, centred on its point, its text `width` units wide: a sea's arched with its
 *  letters `spread` apart (`archOf`), an island's on one line; each with the clear space a word keeps. */
export function nameBox(
  letter: Pick<MapLetter, 'x' | 'y' | 'kind' | 'text'>,
  width: number,
  scale: number,
  spread = 0,
): Rect {
  const sea = letter.kind === 'water';
  const arch = archOf(archedLength(letter.text, width, spread));
  const [across, high] = sea ? [arch.chord, arch.rise + LINE] : [width, LINE];
  const half = (across / 2 + SPACE) * scale;
  const tall = (high / 2 + SPACE) * scale;
  return { x: letter.x - half, y: letter.y - tall, width: half * 2, height: tall * 2 };
}

/** Lays the map's lettering out: the ship, every mark and every lock first, then each name in its priority: an
 *  island's at its middle, a sea's arched at the first of its spots wholly on its own sea, else on no land, its letters
 *  spread wide where it fits and closer where not; then the key by its clear-corner rule (`keyPlace`). Every name
 *  stands inside the map and clear of the hands, of every mark and of every name laid before it. With no corner clear,
 *  the key takes the corner that costs least, and the names are laid again round it. */
export function layOut(ask: LayoutAsk): Lettering {
  const { scale, ink } = ask;
  const spacedPlaces = spaced(ask.places, scale, ink);
  const marks: Rect[] = spacedPlaces.map((place) => markBox(place.kind, place.x, place.y, scale));
  if (ask.ship) marks.push(markBox('ship', ask.ship.x, ask.ship.y, scale));
  // A lock stands only where it is whole inside the map.
  const locks = (ask.locks ?? []).filter(({ x, y }) => {
    const box = markBox('lock', x, y, scale);
    return box.x >= 0 && box.y >= 0 && box.x + box.width <= ink.width && box.y + box.height <= ink.height;
  });
  marks.push(...locks.map((lock) => markBox('lock', lock.x, lock.y, scale)));
  const asked: Asked[] = [
    ...spacedPlaces.map((place) => ({ ...place, continent: -1, spots: [] })),
    ...ask.waters.map((water) => ({ ...water, x: 0, y: 0, kind: 'water', chosen: false })),
    ...(ask.islands ?? []).map((island) => ({ ...island, continent: -1, kind: 'island', chosen: false, spots: [] })),
  ];
  const seas = seasKnown(ask);
  const first = laidOut(ask, asked, [...ask.covers, ...marks], seas);
  const lettered = (letters: readonly MapLetter[]) => [
    ...letters,
    ...locks.map((lock) => ({ text: '', ...lock, kind: 'lock', chosen: false, side: null })),
  ];
  if (!ask.key) return { letters: lettered(first.letters), ship: ask.ship, key: null, scale, named: first.boxes };
  const size = { width: ask.key.width * scale, height: ask.key.height * scale };
  const clearKey = keyPlace(ink, size, scale, [...ask.covers, ...marks, ...first.boxes], ask.land, ask.current);
  if (clearKey) return { letters: lettered(first.letters), ship: ask.ship, key: clearKey, scale, named: first.boxes };
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
      const again = laidOut(ask, asked, [...ask.covers, ...marks, place.box], seas, { first, added: place.box });
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
  if (!best) return { letters: lettered(first.letters), ship: ask.ship, key: null, scale, named: first.boxes };
  const { place: key, again } = best;
  return { letters: lettered(again.letters), ship: ask.ship, key, scale, named: again.boxes };
}

/** Whether the ship's arrow at `ship` (ink pixels, null off the map) has no room in `lettering`: it covers a name
 *  or the key, or the lettering left it none, laid with the arrow off the map. Until it has none, the lettering laid
 *  round where the arrow was keeps every word clear of it, and stands. */
export function shipRoomLost(lettering: Lettering, ship: { readonly x: number; readonly y: number } | null): boolean {
  if (!ship) return false;
  if (!lettering.ship) return true;
  const box = markBox('ship', ship.x, ship.y, lettering.scale);
  return (
    (lettering.key !== null && overlaps(box, lettering.key.box)) || lettering.named.some((each) => overlaps(each, box))
  );
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
  quest?: boolean;
  continent: number;
  band?: string | undefined;
  colour?: string | undefined;
  spots: readonly { x: number; y: number }[];
};

/** How a sea's name at a spot in a fit stands on its sea (`LayoutAsk.sea`), asked once a layout: each layout of the
 *  key's places tried asks the same boxes again, and the passes for wholly and partly on it ask each box twice. */
function seasKnown(ask: LayoutAsk) {
  const known = new Map<Asked, Int8Array[]>();
  return (letter: Asked, fit: number, spot: number, box: Rect): 0 | 1 | 2 => {
    let fits = known.get(letter);
    if (!fits) known.set(letter, (fits = []));
    const answers = (fits[fit] ??= new Int8Array(letter.spots.length).fill(-1));
    const answer = answers[spot] ?? -1;
    if (answer >= 0) return answer as 0 | 1 | 2;
    const asked = ask.sea(box, letter.continent);
    answers[spot] = asked;
    return asked;
  };
}

/** Each name laid in its priority, clear of `blocked` and of the names before it: the letters, and each laid name's
 *  box with its kind and its place in `asked`. */
function laidOut(
  ask: LayoutAsk,
  asked: readonly Asked[],
  blocked: readonly Rect[],
  seaOf: ReturnType<typeof seasKnown>,
  again?: { readonly first: Laid; readonly added: Rect },
): Laid {
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
  const boxOf = new Map<number, Rect>();
  const keep = (box: Rect, index: number, kind: string) => {
    boxOf.set(index, box);
    taken.push(box);
    boxes.push(box);
    kinds.push(kind);
    indices.push(index);
  };
  // Laid again with one more box blocked (`again`), each name stands as it first did until one meets that box: with
  // the same names before it and more blocked, a spot clear now was clear then, and none before it was.
  let same = again !== undefined;
  for (const { letter, index } of order) {
    const { text, x, y, kind, chosen, quest } = letter;
    const before = again?.first.byIndex[index];
    if (same && again && before !== undefined && !(before.box && overlaps(before.box, again.added))) {
      if (before.letter) laid[index] = before.letter;
      if (before.box) keep(before.box, index, kind);
      continue;
    }
    same = false;
    if (kind === 'island') {
      const box = nameBox(letter, ask.widthOf(`${text}, ${letter.band ?? ''}`, kind), scale);
      if (!clear(box)) continue;
      keep(box, index, kind);
      laid[index] = { text, x, y, kind, chosen, band: letter.band, colour: letter.colour, side: 'centre' };
      continue;
    }
    if (kind !== 'water') {
      laid[index] = { text, x, y, kind, chosen, ...(quest ? { quest } : {}), side: null };
      continue;
    }
    // Spread wide wholly on its own sea at any spot that allows it, else closer; else on no land, its middle on its sea.
    const width = ask.widthOf(text, kind);
    let found: { spot: { x: number; y: number }; fit: (typeof SEA_FITS)[number]; box: Rect } | null = null;
    // A box's size is the same at every spot, and whether a spot is clear the same in both passes: each worked out once.
    const shapes = SEA_FITS.map((fit) =>
      nameBox({ x: 0, y: 0, kind, text }, (width * fit.px) / SEA_PX, scale, fit.spread),
    );
    const clearAt = SEA_FITS.map(() => new Int8Array(letter.spots.length).fill(-1));
    for (const sea of [2, 1] as const)
      for (const [fitIndex, fit] of SEA_FITS.entries()) {
        if (found) break;
        const shape = shapes[fitIndex]!;
        const known = clearAt[fitIndex]!;
        for (const [spotIndex, spot] of letter.spots.entries()) {
          if (known[spotIndex] === 0) continue;
          const box = { ...shape, x: spot.x + shape.x, y: spot.y + shape.y };
          if (known[spotIndex] === -1) known[spotIndex] = clear(box) ? 1 : 0;
          if (known[spotIndex] === 0 || seaOf(letter, fitIndex, spotIndex, box) !== sea) continue;
          found = { spot, fit, box };
          break;
        }
      }
    if (!found) continue;
    keep(found.box, index, kind);
    const { spread, px } = found.fit;
    laid[index] = { text, kind, chosen: false, ...found.spot, side: 'centre', spread, px };
  }
  const byIndex = laid.map((letter, index) => ({ letter, box: boxOf.get(index) ?? null }));
  return { letters: laid.filter((letter) => letter !== null), boxes, kinds, indices, byIndex };
}

/** A layout's names: the letters, each laid name's box with its kind and its place in the names asked, and for each
 *  name asked, its letter and its box (null where it was dropped or has none). */
type Laid = {
  readonly letters: readonly MapLetter[];
  readonly boxes: readonly Rect[];
  readonly kinds: readonly string[];
  readonly indices: readonly number[];
  readonly byIndex: readonly { readonly letter: MapLetter | null; readonly box: Rect | null }[];
};
