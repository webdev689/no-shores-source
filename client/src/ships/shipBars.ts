// The bars over captains' ships, in the fight display's layout: her faction's emblem in a square at the left and, to
// its right, her name above a long thin bar of her hull, coloured by her rank, over a dark trough with a hairline edge;
// a Boss's the same, wide across the top of the screen. Drawn on an SVG laid over the picture, in the kit's palette.

import { BarLayout, PLATES } from '../plus/barLayout.ts';
import { EMBLEM_PIXELS, emblemUrl, markPicture } from '../plus/emblems.ts';
import { FILLS, TONES } from '../plus/tones.ts';
import { rankBand, rankMark } from '../rules/roster.ts';

/** The factions whose captains sail, by their numbers (crates/naval/src/ranks.rs), each with her Sloop's name. */
export const SHIP_FACTIONS = [
  { faction: 1, name: 'The Grey Tithe', ship: 'Tithe Sloop' },
  { faction: 2, name: 'Pirates', ship: 'Pirate Sloop' },
] as const;
/** The ranks by their numbers, 1 to 5. */
export const RANKS = ['Minor', 'Major', 'Elite', 'Miniboss', 'Boss'] as const;
export const PIRATES = 2;
const BOSS = 5;
/** A ship's plate over her and a Boss's across the top: a foe's over its head and the boss bar, size for size. */
const { overhead: PLATE, boss: BOSS_PLATE } = PLATES;
/** How far over her waterline a ship's bar stands, metres: over her masthead. */
export const BAR_OVER_M = 16;

/** Her Sloop's name, by the faction she sails for. */
export function shipName(faction: number): string {
  return SHIP_FACTIONS.find((each) => each.faction === faction)?.ship ?? 'Sloop';
}

/** A rank's bar colour: Minor red, Major orange, Elite and Miniboss yellow; a Boss's bar yellow too. */
export function rankColour(rank: number): string {
  return FILLS[rankBand(rank)];
}

/** A captain's ship as her bar shows her: her key among the scene's ships, her name, faction and rank, the share of
 *  her hull left, and the point over her in the frame the picture is projected from. */
export interface ShipBar {
  readonly key: number;
  readonly name: string;
  readonly faction: number;
  readonly rank: number;
  readonly share: number;
  readonly over: readonly [number, number, number];
}

/** A captain's Sloop as a bar reads her: her number in the room (none for the one captain of a fight), name, faction,
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

/** Her bar over her masthead, in a picture drawn from `view`'s corner with heights `shown` times; none once sunk. */
export function barOver(
  captain: Barred,
  view: { readonly leftM: number; readonly topM: number },
  shown: number,
): ShipBar | null {
  if (captain.state === 'sunk') return null;
  const [x = 0, y = 0, heave = 0] = [captain.ship[0], captain.ship[1], captain.pose[0]];
  const over = [x - view.leftM, y - view.topM, (heave + BAR_OVER_M) * shown] as const;
  const share = captain.hull / Math.max(1, captain.maxHull);
  return { key: captain.id ?? 0, name: captain.name, faction: captain.faction, rank: captain.rank, share, over };
}

/** A plate as laid on the screen: its box's left and top, its size and its bar's height (CSS pixels), what it shows,
 *  and the words after its name (a Boss's faction), as the boss bar on foot writes them. */
export interface PlacedBar {
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
}

/** Each ship's plate where `project` puts the point over her (none off the picture), laid by `layout` so none covers
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
    add('rect', { x: left, y: barTop, width: right - left, height: bar.bar, fill: TONES.groundTrack });
    add('rect', { x: left, y: barTop, width: (right - left) * bar.share, height: bar.bar, fill: bar.colour });
    add('rect', { x: left, y: barTop, width: (right - left) * bar.share, height: 1, fill: 'rgba(255,255,255,0.34)' });
    edge(left - 1, barTop - 1, right - left + 2, bar.bar + 2, TONES.stoneLo);
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

/** The plates of one picture's ships, laid from frame to frame so none covers another. */
export class ShipPlates {
  private readonly layout = new BarLayout();
  private drawnAt: number | null = null;

  /** Draws `bars` onto `svg` at `now` (seconds), each where `project` puts the point over her, the picture `width`
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
    drawShipBars(svg, placeShipBars(bars, project, width, this.layout, seconds));
  }
}
