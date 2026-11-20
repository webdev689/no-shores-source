// The bars over captains' ships, in the fight display's layout: its faction's emblem in a square at the left and, to
// its right, its name above a long thin bar of its hull, coloured by its rank, over a dark trough with a hairline edge;
// a Boss's the same, wide across the top of the screen. Drawn on an SVG laid over the picture, in the kit's palette.
// Its hull's losses read as a foe's do on foot: a pale strip where the bar stood, a real bite breaking off and falling,
// and the bar's edge flashing with it.

import { BarLayout, PLATES } from '../plus/barLayout.ts';
import { bitten, type Loss, PIECE_LEAST, pieceAt, stepLoss } from '../plus/barLoss.ts';
import { EMBLEM_PIXELS, emblemUrl, markPicture } from '../plus/emblems.ts';
import { motionReduced } from '../plus/kit.ts';
import { FILLS, TONES } from '../plus/tones.ts';
import { rankBand, rankMark } from '../rules/roster.ts';

/** The factions whose captains sail, by their numbers (crates/naval/src/ranks.rs), each with its Sloop's name. */
export const SHIP_FACTIONS = [
  { faction: 1, name: 'The Grey Tithe', ship: 'Tithe Sloop' },
  { faction: 2, name: 'Pirates', ship: 'Pirate Sloop' },
] as const;
/** The ranks by their numbers, 1 to 5. */
export const RANKS = ['Minor', 'Major', 'Elite', 'Miniboss', 'Boss'] as const;
const BOSS = 5;
/** A ship's plate over it and a Boss's across the top: a foe's over its head and the boss bar, size for size. */
const { overhead: PLATE, boss: BOSS_PLATE } = PLATES;
/** How far over its waterline the Sloop's bar stands, metres: over its masthead. */
export const BAR_OVER_M = 16;

/** The hulls by their numbers (crates/sailing/src/hull.rs HullKind), as a captain's name says them. */
const HULL_NAMES = ['Sloop', 'Schooner', 'Brig', 'Frigate'] as const;

/** Their ship's name, by the faction they sail for and its hull (the Sloop unless named): the Tithe's or the pirates'
 *  Sloop, Schooner, Brig or Frigate, as crates/naval/src/ranks.rs names it. */
export function shipName(faction: number, hull = 0): string {
  // Any faction but the Tithe's sails as the pirates do, as the rules name it.
  const sloop = SHIP_FACTIONS.find((each) => each.faction === faction)?.ship ?? 'Pirate Sloop';
  return sloop.replace(/Sloop$/, HULL_NAMES[hull] ?? 'Sloop');
}

/** A distance as the sea says it: metres to the nearest ten near, kilometres past one. */
export function distanceWords(metres: number): string {
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  return metres < 20_000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 1000)} km`;
}

/** The one sentence a ship is sighted in, on the voyage and in a fight alike. */
export function sightedWords(name: string, metres: number): string {
  return `${/^[AEIOU]/i.test(name) ? 'An' : 'A'} ${name} sighted, ${distanceWords(metres)} off.`;
}

/** A rank's bar colour: Minor red, Major orange, Elite and Miniboss yellow; a Boss's bar yellow too. */
export function rankColour(rank: number): string {
  return FILLS[rankBand(rank)];
}

/** A captain's ship as its bar shows it: its key among the scene's ships, its name, faction and rank, the share of
 *  its hull left, and the point over it in the frame the picture is projected from. */
export interface ShipBar {
  readonly key: number;
  readonly name: string;
  readonly faction: number;
  readonly rank: number;
  readonly share: number;
  readonly over: readonly [number, number, number];
}

/** A captain's Sloop as a bar reads it: its number in the room (none for the one captain of a fight), name, faction,
 *  rank, hull and whole hull, state, helm's numbers and pose. */
export interface Barred {
  readonly id?: number;
  readonly name: string;
  readonly faction: number;
  readonly rank: number;
  readonly hull: number;
  readonly maxHull: number;
  readonly state: string;
  readonly ship: ArrayLike<number>;
  readonly pose: ArrayLike<number>;
}

/** Its bar over its masthead, `overM` over its waterline (the Sloop's unless said), in a picture drawn from `view`'s
 *  corner with heights `shown` times; none once sunk. */
export function barOver(
  captain: Barred,
  view: { readonly leftM: number; readonly topM: number },
  shown: number,
  overM = BAR_OVER_M,
): ShipBar | null {
  if (captain.state === 'sunk') return null;
  const [x = 0, y = 0, heave = 0] = [captain.ship[0], captain.ship[1], captain.pose[0]];
  const over = [x - view.leftM, y - view.topM, (heave + overM) * shown] as const;
  const share = captain.hull / Math.max(1, captain.maxHull);
  return { key: captain.id ?? 0, name: captain.name, faction: captain.faction, rank: captain.rank, share, over };
}

/** A plate as laid on the screen: its key, its box's left and top, its size and its bar's height (CSS pixels), what it
 *  shows, and the words after its name (a Boss's faction), as the boss bar on foot writes them; and its hull's losses
 *  as they read: the strip's share, the pieces falling (their span as shares of the bar, and how long each has fallen)
 *  and how much of a bite's flash is left on the bar's edge, 1 down to 0. */
export interface PlacedBar {
  readonly key: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly bar: number;
  readonly name: string;
  readonly faction: number;
  readonly rank: number;
  readonly colour: string;
  readonly share: number;
  readonly words: string;
  readonly lost?: number;
  readonly pieces?: readonly { readonly left: number; readonly width: number; readonly age: number }[];
  readonly flash?: number;
}

/** How long the bar's edge flashes for a bite, in seconds, in three hard steps. */
export const HULL_FLASH_SECONDS = 0.24;

/** How much of a bite's flash is left `age` seconds on: whole, two thirds, a third, then none. */
export function flashLeft(age: number): number {
  return age >= 0 && age < HULL_FLASH_SECONDS ? 1 - Math.floor((age / HULL_FLASH_SECONDS) * 3) / 3 : 0;
}

/** A colour a share of the way to the cream the losses are lit with, as `#rrggbb`. */
function toward(colour: string, share: number): string {
  const channel = (hex: string, start: number) => Number.parseInt(hex.slice(start, start + 2), 16);
  const mixed = [1, 3, 5].map((start) =>
    Math.round(channel(colour, start) + (channel('#fff6e4', start) - channel(colour, start)) * share),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** Each ship's plate where `project` puts the point over it (none off the picture), laid by `layout` so none covers
 *  another, `seconds` on; a Boss's across the top of a picture `width` CSS pixels wide instead, one under another. */
export function placeShipBars(
  bars: readonly ShipBar[],
  project: (
    point: readonly [number, number, number],
  ) => { readonly x: number; readonly y: number; depth: number } | null,
  width: number,
  layout: BarLayout,
  seconds: number,
): PlacedBar[] {
  const shown = (bar: ShipBar) => ({
    key: bar.key,
    name: bar.name,
    faction: bar.faction,
    rank: bar.rank,
    colour: rankColour(bar.rank),
    share: Math.max(0, Math.min(1, bar.share)),
  });
  const bossWidth = Math.min(BOSS_PLATE.width, BOSS_PLATE.share * width);
  const bosses = bars.filter((bar) => bar.rank >= BOSS);
  const placedBosses = bosses.map((bar, index) => ({
    ...shown(bar),
    left: (width - bossWidth) / 2,
    top: BOSS_PLATE.top + index * (BOSS_PLATE.height + BOSS_PLATE.top),
    width: bossWidth,
    height: BOSS_PLATE.height,
    bar: BOSS_PLATE.bar,
    words: SHIP_FACTIONS.find((each) => each.faction === bar.faction)?.name ?? '',
  }));
  const spots = bars.flatMap((bar) => {
    const spot = bar.rank < BOSS ? project(bar.over) : null;
    return spot ? [{ bar, ...spot }] : [];
  });
  const laid = layout.lay(
    spots.map(({ bar, x, y, depth }) => ({ key: bar.key, x, y, depth, width: PLATE.width, height: PLATE.height })),
    seconds,
  );
  const overheads = spots
    .map(({ bar, x, y }) => ({ bar, x, y, place: laid.get(bar.key) ?? { lift: 0, front: 0 } }))
    .sort((first, second) => second.place.front - first.place.front)
    .map(({ bar, x, y, place }) => ({
      ...shown(bar),
      left: x - PLATE.width / 2,
      top: y - place.lift - PLATE.height,
      width: PLATE.width,
      height: PLATE.height,
      bar: PLATE.bar,
      words: '',
    }));
  return [...overheads, ...placedBosses];
}

/** Draws the plates onto `svg`, the farthest first so the nearest stands in front: each an emblem's square, a name
 *  over a trough, its fill and its hairline edge. */
export function drawShipBars(svg: SVGSVGElement, bars: readonly PlacedBar[]): void {
  const add = (name: string, attributes: Record<string, string | number>, text = '') => {
    const node = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    node.textContent = text;
    svg.append(node);
    return node;
  };
  const pixels = (href: string, x: number, y: number, width: number, height: number) =>
    add('image', { href, x, y, width, height, style: 'image-rendering: pixelated' });
  const edge = (x: number, y: number, width: number, height: number, stroke: string) =>
    add('rect', { x: x + 0.5, y: y + 0.5, width: width - 1, height: height - 1, fill: 'none', stroke });
  const words = { 'stroke': TONES.outline, 'stroke-width': 3, 'paint-order': 'stroke', 'font-weight': 600 };
  for (const bar of bars) {
    const square = bar.height;
    add('rect', { x: bar.left, y: bar.top, width: square, height: square, fill: TONES.groundChip });
    edge(bar.left, bar.top, square, square, TONES.stoneMid);
    const emblem = emblemUrl(bar.faction);
    const side = Math.floor((square - 4) / EMBLEM_PIXELS) * EMBLEM_PIXELS;
    if (emblem) pixels(emblem, bar.left + (square - side) / 2, bar.top + (square - side) / 2, side, side);
    const [left, right] = [bar.left + square + 5, bar.left + bar.width];
    const barTop = bar.top + bar.height - bar.bar;
    const span = right - left;
    add('rect', { x: left, y: barTop, width: span, height: bar.bar, fill: TONES.groundTrack });
    const pale = { 'fill': toward(bar.colour, 0.55), 'opacity': 0.6 };
    if ((bar.lost ?? 0) > bar.share)
      add('rect', { ...pale, x: left, y: barTop, width: span * (bar.lost ?? 0), height: bar.bar });
    add('rect', { x: left, y: barTop, width: span * bar.share, height: bar.bar, fill: bar.colour });
    add('rect', { x: left, y: barTop, width: span * bar.share, height: 1, fill: 'rgba(255,255,255,0.34)' });
    edge(left - 1, barTop - 1, span + 2, bar.bar + 2, TONES.stoneLo);
    const flash = bar.flash ?? 0;
    if (flash > 0)
      add('rect', {
        x: left - 0.5,
        y: barTop - 0.5,
        width: span + 1,
        height: bar.bar + 1,
        fill: 'none',
        'stroke': '#fff6e4',
        'opacity': flash,
      });
    for (const piece of bar.pieces ?? []) {
      const pieceLeft = left + span * piece.left;
      const halves = [
        [pieceAt(piece.age, 'left'), pieceLeft, span * piece.width * 0.55],
        [pieceAt(piece.age, 'right'), pieceLeft + span * piece.width * 0.55, span * piece.width * 0.45],
      ] as const;
      for (const [fallen, x, width] of halves) {
        if (!fallen) continue;
        const [shownX, shownY] = [x + fallen.x, barTop + fallen.y];
        add('rect', {
          x: shownX,
          y: shownY,
          width,
          height: bar.bar,
          fill: bar.colour,
          opacity: fallen.opacity,
          'stroke': TONES.outline,
          'stroke-width': 1,
        });
        add('rect', {
          x: shownX,
          y: shownY,
          width,
          height: Math.min(2, bar.bar),
          fill: '#fff6e4',
          opacity: fallen.opacity,
        });
      }
    }
    const baseline = barTop - 4;
    const fontSize = bar.bar > PLATE.bar ? 18 : 12;
    const name = add(
      'text',
      { ...words, 'x': left, 'y': baseline, 'fill': TONES.word, 'font-size': fontSize },
      bar.name,
    );
    const mark = rankMark(bar.rank);
    const picture = mark && markPicture(mark);
    if (picture && name instanceof SVGTextElement) {
      const [width, height] = [picture.width * 2, picture.height * 2];
      pixels(picture.url, left + name.getComputedTextLength() + 5, baseline - height, width, height);
    }
    const after = left + (name instanceof SVGTextElement ? name.getComputedTextLength() : 0) + 12;
    const small = { 'x': after, 'y': baseline, 'font-size': 11, 'letter-spacing': '0.14em', 'fill': TONES.wordDim };
    if (bar.words) add('text', { ...words, ...small }, bar.words.toUpperCase());
  }
}

/** A ship's hull as its bar last read it: the strip, the two pieces its bites fall as in turn, how many bites, and how
 *  long since the last. */
interface Hull {
  loss: Loss;
  readonly pieces: ({ left: number; width: number; age: number } | null)[];
  bites: number;
  sinceBite: number;
}

/** Each ship's hull losses, read from frame to frame by its key. */
export class HullLosses {
  private readonly hulls = new Map<number, Hull>();

  /** One frame of `bar`'s hull losses, `seconds` on, with nothing falling or flashing when `still`: a ship first seen
   *  starts whole at its bar, so only a loss seen happen reads as one. */
  read(bar: PlacedBar, seconds: number, still: boolean): PlacedBar {
    const hull = this.hulls.get(bar.key) ?? {
      loss: stepLoss(null, bar.share, 0),
      pieces: [null, null],
      bites: 0,
      sinceBite: Infinity,
    };
    this.hulls.set(bar.key, hull);
    const was = hull.loss;
    hull.loss = stepLoss(was, bar.share, seconds);
    hull.sinceBite += seconds;
    hull.pieces.forEach((piece, index) => {
      hull.pieces[index] = piece && piece.age + seconds < 1 ? { ...piece, age: piece.age + seconds } : null;
    });
    const bite = bitten(was, hull.loss, PIECE_LEAST.hull);
    if (bite && !still) {
      hull.pieces[hull.bites % 2] = { ...bite, age: 0 };
      hull.bites += 1;
      hull.sinceBite = 0;
    }
    const pieces = hull.pieces.filter((piece) => piece !== null);
    return { ...bar, lost: hull.loss.at, pieces, flash: flashLeft(hull.sinceBite) };
  }

  /** Forgets every ship not in `kept`. */
  keep(kept: ReadonlySet<number>): void {
    for (const key of this.hulls.keys()) if (!kept.has(key)) this.hulls.delete(key);
  }
}

/** The plates of one picture's ships, laid from frame to frame so none covers another, each reading its hull's
 *  losses. */
export class ShipPlates {
  private readonly layout = new BarLayout();
  private readonly hulls = new HullLosses();

  /** How far down the highest plate's top may stand, CSS pixels: under the compass, or what stands under it. */
  set top(pixels: number) {
    this.layout.top = pixels;
  }
  private drawnAt: number | null = null;

  /** Draws `bars` onto `svg` at `now` (seconds), each where `project` puts the point over it, the picture `width`
   *  CSS pixels wide. */
  draw(
    svg: SVGSVGElement,
    bars: readonly ShipBar[],
    project: Parameters<typeof placeShipBars>[1],
    width: number,
    now: number,
  ): void {
    const seconds = this.drawnAt === null ? Infinity : now - this.drawnAt;
    this.drawnAt = now;
    const still = motionReduced();
    const placed = placeShipBars(bars, project, width, this.layout, still ? Infinity : seconds);
    this.hulls.keep(new Set(bars.map((bar) => bar.key)));
    const shownSeconds = Number.isFinite(seconds) ? seconds : 0;
    drawShipBars(
      svg,
      placed.map((bar) => this.hulls.read(bar, shownSeconds, still)),
    );
  }
}
