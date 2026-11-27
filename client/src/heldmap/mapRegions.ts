// The regions of an island on the held map at sea: every island is cut into three, each point of its land (inside its outline) in the region of that island whose centre is nearest
// (`content/world/regions.json`). The regions of the island whose waters the ship is in light as the pointer passes
// over their land, named on a card of parchment, and a click on one sets a course to its anchorage. A port's name
// shows on the same card as the pointer passes over its anchor.
import type { Point2 } from '../overworld/ground.ts';
import type { MapRegion } from '../overworld/regions.ts';
import type { HoverSaid, WaterJudge } from './heldMapAsk.ts';
import { LIGHT_INK, PARCHMENT, type Painter, word } from './mapLetters.ts';
import { FACE, INK } from './mapKey.ts';
import { PORT_PX } from './mapLayout.ts';
import { difficultyColour, type MapWaters } from './watersWash.ts';

/** The card a hovered name shows on, units at the lettering's scale 1: its title's and caption's sizes, the room
 *  round its words, its inner rule's inset, its corner diamonds' half width, and how far over the point it stands. */
const CARD = { title: PORT_PX, caption: 11, pad: 8, inset: 2.5, diamond: 1.8, above: 12 } as const;

/** The region whose centre is nearest a point, of those given. */
function nearest(regions: readonly MapRegion[], [x, y]: Point2): MapRegion | null {
  let best: MapRegion | null = null;
  let bestApart = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    const apart = Math.hypot(region.centre[0] - x, region.centre[1] - y);
    if (apart < bestApart) [best, bestApart] = [region, apart];
  }
  return best;
}

/** The cells of the waters' grid whose middles lie inside `outline`, a byte each (1 inside), laid a row at a time by
 *  where the outline crosses it (even-odd); kept for each outline while the grid is the same. */
const insides = new WeakMap<readonly Point2[], { readonly waters: MapWaters; readonly cells: Uint8Array }>();
export function insideCells(waters: MapWaters, outline: readonly Point2[]): Uint8Array {
  const kept = insides.get(outline);
  if (kept?.waters === waters) return kept.cells;
  const { columns, rows, cellM } = waters;
  const cells = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * cellM;
    const crossings = outline.flatMap(([fromX, fromY], index) => {
      const [toX, toY] = outline[(index + 1) % outline.length] ?? [fromX, fromY];
      return fromY > y !== toY > y ? [fromX + ((y - fromY) / (toY - fromY)) * (toX - fromX)] : [];
    });
    crossings.sort((first, second) => first - second);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const west = Math.max(0, Math.ceil((crossings[pair] ?? 0) / cellM - 0.5));
      const east = Math.min(columns, Math.ceil((crossings[pair + 1] ?? 0) / cellM - 0.5));
      cells.fill(1, row * columns + west, row * columns + Math.max(west, east));
    }
  }
  insides.set(outline, { waters, cells });
  return cells;
}

/** The cell of the waters' grid a point lies in; null off the grid. */
function cellOf(waters: MapWaters, [x, y]: Point2): number | null {
  const [column, row] = [Math.floor(x / waters.cellM), Math.floor(y / waters.cellM)];
  if (column < 0 || row < 0 || column >= waters.columns || row >= waters.rows) return null;
  return row * waters.columns + column;
}

/** The region of the island `island` whose land lies under a point: a cell of land inside the island's outline, in
 *  the region of the island's own whose centre is nearest; none over the sea or another island's land. */
export function regionAt(
  waters: MapWaters,
  regions: readonly MapRegion[],
  island: string | null,
  point: Point2,
): MapRegion | null {
  const cell = cellOf(waters, point);
  if (island === null || cell === null || (waters.water[cell] ?? -1) >= 0) return null;
  const own = regions.filter((region) => region.island === island);
  return own[0] && insideCells(waters, own[0].outline)[cell] ? nearest(own, point) : null;
}

/** A byte a cell of the waters' grid, 255 over the land of `region`; all 0 for none. */
export function regionCells(waters: MapWaters, regions: readonly MapRegion[], region: MapRegion | null): Uint8Array {
  const { columns, rows, cellM, water } = waters;
  const lit = new Uint8Array(columns * rows);
  if (!region) return lit;
  const inside = insideCells(waters, region.outline);
  const own = regions.filter((each) => each.island === region.island);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const cell = row * columns + column;
      if (!inside[cell] || (water[cell] ?? -1) >= 0) continue;
      if (nearest(own, [(column + 0.5) * cellM, (row + 0.5) * cellM]) === region) lit[cell] = 255;
    }
  return lit;
}

/** Paints a hovered name on a card of parchment centred over `x`, `y` (ink units, in the painter's ink transform,
 *  `scale` the lettering's), kept whole inside the map `ink`: a double rule of ink with a diamond at each inner
 *  corner, the name, and under a short rule its caption (a region's island) in the lighter ink. */
export function paintCard(
  painter: Painter,
  { line, caption }: { readonly line: string; readonly caption?: string | undefined },
  [x, y]: readonly [number, number],
  ink: { readonly width: number; readonly height: number },
  scale: number,
): void {
  const [titleFont, captionFont] = [`600 ${CARD.title}px ${FACE}`, `500 ${CARD.caption}px ${FACE}`];
  painter.save();
  painter.font = titleFont;
  const titleWidth = painter.measureText(line).width;
  painter.font = captionFont;
  const captionWidth = caption ? painter.measureText(caption).width : 0;
  const width = Math.max(titleWidth, captionWidth) + CARD.pad * 2;
  const height = CARD.title + (caption ? CARD.caption + 6 : 0) + CARD.pad * 2;
  const [halfX, halfY] = [(width / 2) * scale, (height / 2) * scale];
  const middleY = y - (CARD.above + height / 2) * scale;
  painter.translate(
    Math.max(halfX, Math.min(x, ink.width - halfX)),
    Math.max(halfY, Math.min(middleY < halfY ? y + (CARD.above + height / 2) * scale : middleY, ink.height - halfY)),
  );
  painter.scale(scale, scale);
  const [left, top] = [-width / 2, -height / 2];
  painter.fillStyle = PARCHMENT;
  painter.fillRect(left, top, width, height);
  painter.strokeStyle = INK;
  painter.lineWidth = 1.4;
  painter.strokeRect(left, top, width, height);
  const inner = {
    x: left + CARD.inset,
    y: top + CARD.inset,
    width: width - CARD.inset * 2,
    height: height - CARD.inset * 2,
  };
  painter.lineWidth = 0.6;
  painter.strokeRect(inner.x, inner.y, inner.width, inner.height);
  painter.fillStyle = INK;
  for (const [cornerX, cornerY] of [
    [inner.x, inner.y],
    [inner.x + inner.width, inner.y],
    [inner.x, inner.y + inner.height],
    [inner.x + inner.width, inner.y + inner.height],
  ] as const) {
    painter.beginPath();
    painter.moveTo(cornerX, cornerY - CARD.diamond);
    painter.lineTo(cornerX + CARD.diamond, cornerY);
    painter.lineTo(cornerX, cornerY + CARD.diamond);
    painter.lineTo(cornerX - CARD.diamond, cornerY);
    painter.closePath();
    painter.fill();
  }
  painter.textAlign = 'center';
  painter.textBaseline = 'middle';
  const titleY = top + CARD.pad + CARD.title / 2;
  painter.font = titleFont;
  word(painter, line, 0, titleY, INK);
  if (caption) {
    const ruleY = titleY + CARD.title / 2 + 3;
    painter.beginPath();
    painter.moveTo(-captionWidth / 3, ruleY);
    painter.lineTo(captionWidth / 3, ruleY);
    painter.lineWidth = 0.6;
    painter.strokeStyle = LIGHT_INK;
    painter.stroke();
    painter.font = captionFont;
    word(painter, caption, 0, ruleY + 3 + CARD.caption / 2, LIGHT_INK);
  }
  painter.restore();
}

/** The middle of an outline, by its area (the shoelace formula); its first point for one with none. */
export function middleOf(outline: readonly Point2[]): Point2 {
  let [area, x, y] = [0, 0, 0];
  outline.forEach(([fromX, fromY], index) => {
    const [toX, toY] = outline[(index + 1) % outline.length] ?? [fromX, fromY];
    const cross = fromX * toY - toX * fromY;
    [area, x, y] = [area + cross, x + (fromX + toX) * cross, y + (fromY + toY) * cross];
  });
  return area === 0 ? (outline[0] ?? [0, 0]) : [x / (3 * area), y / (3 * area)];
}

/** The regions on the map at sea: every island's, and the one of the ship's island lit under the pointer, with where
 *  its name stands (ink units). */
export class MapRegions {
  all: readonly MapRegion[] = [];
  /** The islands' names, by their continent's id: an island with none has its sea locked. */
  names: Readonly<Record<string, string>> = {};
  lit: { readonly region: MapRegion; readonly x: number; readonly y: number } | null = null;
  /** The map's view and place the name was stood by. */
  private seenOn = '';

  /** The region of the ship's island (at `ship`, judged by the waters' rules) whose land lies under a world point. */
  under(
    waters: { readonly waters: MapWaters; readonly judge: WaterJudge } | null,
    ship: Point2,
    point: readonly number[],
  ): MapRegion | null {
    if (!waters) return null;
    const own = waters.judge(ship)?.continent;
    const island = waters.waters.waters.find((water) => water.continent === own)?.id ?? null;
    return regionAt(waters.waters, this.all, island, [point[0] ?? 0, point[1] ?? 0]);
  }

  /** The cells to light as the pointer (`ask.pointer`, screen pixels, on the map `ink` showing `view`) moves: a
   *  region's land as it comes into one, the water `ask` lights under the pointer again as it leaves (or `water`, the
   *  cells `ask` answered this frame, while no region is lit); null while nothing changes. */
  hover(
    waters: { readonly waters: MapWaters; readonly judge: WaterJudge } | null,
    ship: Point2,
    view: { readonly left: number; readonly top: number; readonly scale: number },
    ink: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    ask: {
      readonly pointer: { readonly x: number; readonly y: number } | null;
      cellsNow(waters: MapWaters): Uint8Array;
    },
    water: Uint8Array | null,
  ): Uint8Array | null {
    // While the waters are away (a pan, the land's map), the region lit stays lit, and is judged again after.
    if (!waters) return null;
    const inked = ask.pointer && { x: ask.pointer.x - ink.x, y: ask.pointer.y - ink.y };
    const onMap = inked && inked.x >= 0 && inked.y >= 0 && inked.x <= ink.width && inked.y <= ink.height;
    const world = onMap && [view.left + inked.x / view.scale, view.top + inked.y / view.scale];
    const region = world && inked ? this.under(waters, ship, world) : null;
    // As a water's words do, the name stands where the pointer came in until the map moves, then anew by it.
    const seenOn = JSON.stringify([view, ink]);
    const moved = seenOn !== this.seenOn;
    this.seenOn = seenOn;
    if (region === (this.lit?.region ?? null)) {
      if (region && inked && moved) this.lit = { region, ...inked };
      return region ? null : water;
    }
    this.lit = region && inked ? { region, ...inked } : null;
    return region ? regionCells(waters.waters, this.all, region) : ask.cellsNow(waters.waters);
  }

  /** The lit region's name on its card, its island's name under it, where the pointer came into it; none for none. */
  said(): HoverSaid | null {
    if (!this.lit) return null;
    const { region, x, y } = this.lit;
    return { line: region.name, x, y, card: true, caption: this.names[region.island] };
  }

  /** Each named island in view lettered at its middle, ink pixels (`toInk`, `onSheet`), with its water's level band
   *  and the band's colour on the difficulty ramp. */
  islandLetters(
    waters: MapWaters | null,
    toInk: (x: number, y: number) => readonly [number, number],
    onSheet: (x: number, y: number) => boolean,
  ): { text: string; band: string; colour: string; x: number; y: number }[] {
    return this.middles().flatMap(({ island, name, at }) => {
      const [x, y] = toInk(at[0], at[1]);
      const levels = waters?.waters.find((water) => water.id === island)?.levels ?? null;
      const band = levels ? `${levels[0]}-${levels[1]}` : '';
      return onSheet(x, y) ? [{ text: name, band, colour: difficultyColour(levels) ?? INK, x, y }] : [];
    });
  }

  /** Each named island's middle, the world's metres, its outline's (a region's of it). */
  middles(): { readonly island: string; readonly name: string; readonly at: Point2 }[] {
    return Object.entries(this.names).flatMap(([island, name]) => {
      const outline = this.all.find((region) => region.island === island)?.outline;
      return outline?.length ? [{ island, name, at: middleOf(outline) }] : [];
    });
  }
}
