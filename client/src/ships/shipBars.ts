// The bars over captains' ships: each one's name over a bar of her hull coloured by her rank, or a Boss's name and
// hull across the top of the screen; drawn on an SVG laid over the picture.

/** The factions whose captains sail, by their numbers (crates/naval/src/ranks.rs), each with her Sloop's name. */
export const SHIP_FACTIONS = [
  { faction: 1, name: 'The Grey Tithe', ship: 'Tithe Sloop' },
  { faction: 2, name: 'Pirates', ship: 'Pirate Sloop' },
] as const;
/** The ranks by their numbers, 1 to 5. */
export const RANKS = ['Minor', 'Major', 'Elite', 'Miniboss', 'Boss'] as const;
export const PIRATES = 2;
export const MAJOR = 2;
const BOSS = 5;
/** A bar's colours by rank: Minor red, Major orange, the rest yellow; and its trough. */
const RED = '#c8382f';
const ORANGE = '#e07a2a';
const YELLOW = '#e8c23a';
const TROUGH = '#0008';
/** A ship's bar, and a Boss's across the top: their widths and heights, and how far down the Boss's stands, in CSS
 *  pixels. */
const BAR = { width: 64, height: 6 } as const;
const BOSS_BAR = { width: 420, height: 10, top: 34 } as const;
/** How far over her waterline a ship's bar stands, metres: over her masthead. */
export const BAR_OVER_M = 16;

/** Her Sloop's name, by the faction she sails for. */
export function shipName(faction: number): string {
  return SHIP_FACTIONS.find((each) => each.faction === faction)?.ship ?? 'Sloop';
}

/** A rank's bar colour: Minor red, Major orange, Elite and Miniboss yellow; a Boss's bar yellow too. */
export function rankColour(rank: number): string {
  if (rank <= 1) return RED;
  return rank === MAJOR ? ORANGE : YELLOW;
}

/** A captain's ship as her bar shows her: her name, her rank, the share of her hull left, and the point over her in
 *  the frame the picture is projected from. */
export interface ShipBar {
  readonly name: string;
  readonly rank: number;
  readonly share: number;
  readonly over: readonly [number, number, number];
}

/** A captain's Sloop as a bar reads her: her name, rank, hull and whole hull, state, helm's numbers and pose. */
export interface Barred {
  readonly name: string;
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
  return { name: captain.name, rank: captain.rank, share: captain.hull / Math.max(1, captain.maxHull), over };
}

/** A bar as laid on the screen: where its middle stands (CSS pixels), how wide it is, and what it shows. */
export interface PlacedBar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly name: string;
  readonly colour: string;
  readonly share: number;
}

/** Each ship's bar where `project` puts the point over her (none off the picture), a Boss's across the top of a
 *  picture `width` CSS pixels wide instead, one under another. */
export function placeShipBars(
  bars: readonly ShipBar[],
  project: (point: readonly [number, number, number]) => { readonly x: number; readonly y: number } | null,
  width: number,
): PlacedBar[] {
  const bossWidth = Math.min(BOSS_BAR.width, width - 32);
  let bosses = 0;
  return bars.flatMap((bar): PlacedBar[] => {
    const shown = { name: bar.name, colour: rankColour(bar.rank), share: Math.max(0, Math.min(1, bar.share)) };
    if (bar.rank >= BOSS) {
      const y = BOSS_BAR.top + bosses++ * (BOSS_BAR.top + BOSS_BAR.height);
      return [{ ...shown, x: width / 2, y, width: bossWidth, height: BOSS_BAR.height }];
    }
    const spot = project(bar.over);
    return spot ? [{ ...shown, x: spot.x, y: spot.y, width: BAR.width, height: BAR.height }] : [];
  });
}

/** Draws the bars onto `svg`: each a trough, its fill and an outline, its name over it. */
export function drawShipBars(svg: SVGSVGElement, bars: readonly PlacedBar[]): void {
  const add = (name: string, attributes: Record<string, string | number>, text = '') => {
    const node = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    node.textContent = text;
    svg.append(node);
  };
  for (const bar of bars) {
    const [left, top] = [bar.x - bar.width / 2, bar.y - bar.height / 2];
    add('rect', { x: left, y: top, width: bar.width, height: bar.height, fill: TROUGH });
    add('rect', { x: left, y: top, width: bar.width * bar.share, height: bar.height, fill: bar.colour });
    add('rect', { 'x': left, 'y': top, 'width': bar.width, 'height': bar.height, 'fill': 'none', 'stroke': '#000a' });
    add(
      'text',
      {
        'x': bar.x,
        'y': top - 4,
        'fill': '#f2f2f2',
        'font-size': bar.height > BAR.height ? 15 : 12,
        'font-weight': 600,
        'text-anchor': 'middle',
        'stroke': '#000c',
        'stroke-width': 3,
        'paint-order': 'stroke',
      },
      bar.name,
    );
  }
}
