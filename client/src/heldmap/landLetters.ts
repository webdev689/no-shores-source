// The land sheet (landSheet.ts) painted onto the parchment's picture in the map's own inks, as the waters are lettered
// at sea (mapLetters.ts): the ground's relief and shore, the plan's floors, walks, paths and what stands, the edge
// walked, the marks and the places by name, the player's arrow, the land's name and a key of its marks.
import type { Point2 } from '../overworld/ground.ts';
import type { View } from './heldMapLaw.ts';
import { FACE, INK } from './mapKey.ts';
import { PORT_PX, WORD_PX } from './mapLayout.ts';
import { LIGHT_INK, paintArrow, type Painter, ROUTE, word } from './mapLetters.ts';
import type { LandMarkKind, LandSheet, Quad } from './landSheet.ts';

/** What a painting of the land asks: the sheet, the view of it (its metres), the map's size, how many times over its
 *  words and marks are drawn (`letterScale`), and the player's arrow where they stand and face, the sheet's metres. */
export interface LandPainting {
  readonly sheet: LandSheet;
  readonly view: View;
  readonly ink: { readonly width: number; readonly height: number };
  readonly scale: number;
  readonly player: { readonly at: Point2; readonly heading: number } | null;
}

/** The inks of the plan: its floors faint, its walks a shade more, what stands on it near solid. */
const FLOOR = 'rgba(58, 40, 22, 0.06)';
const WALK = 'rgba(92, 70, 49, 0.24)';
const STANDING = 'rgba(58, 40, 22, 0.72)';
const PATH = 'rgba(92, 70, 49, 0.55)';
const RELIEF = 'rgba(92, 70, 49, 0.32)';
const KEY_FILL = 'rgba(238, 222, 190, 0.92)';
/** A track's width and a footpath's, metres. */
const PATH_M = { track: 4, footpath: 2 } as const;
const TITLE_PX = 20;

/** What the key calls each mark; a keeper's stall is named beside its mark instead. */
export const MARK_WORDS: Readonly<Record<Exclude<LandMarkKind, 'vendor'>, string>> = {
  landing: 'Landing',
  gate: 'Gate',
  event: 'Public event',
  beacon: 'Beacon',
  resource: 'Resource',
  foes: 'Foes',
  objective: 'Objective',
  door: 'Sealed door',
};

/** Paints `painting` onto the parchment's picture: `inkAt` is where the map's top-left stands in it, and `dpr` its
 *  pixels a screen pixel. The picture is cleared first, and nothing is painted outside the map. */
export function paintLand(
  painter: Painter,
  picture: { readonly width: number; readonly height: number },
  inkAt: { readonly x: number; readonly y: number },
  dpr: number,
  painting: LandPainting,
): void {
  const { sheet, view, ink, scale, player } = painting;
  painter.setTransform(1, 0, 0, 1, 0, 0);
  painter.clearRect(0, 0, picture.width, picture.height);
  painter.setTransform(dpr, 0, 0, dpr, inkAt.x * dpr, inkAt.y * dpr);
  painter.save();
  painter.beginPath();
  painter.rect(0, 0, ink.width, ink.height);
  painter.clip();
  painter.textBaseline = 'middle';
  painter.lineJoin = 'round';
  const onMap = (point: Point2): Point2 => [(point[0] - view.left) * view.scale, (point[1] - view.top) * view.scale];
  const trace = (points: readonly Point2[]) =>
    points.forEach((point, index) => {
      const [x, y] = onMap(point);
      if (index === 0) painter.moveTo(x, y);
      else painter.lineTo(x, y);
    });
  const lines = (segments: readonly (readonly Point2[])[], colour: string, width: number) => {
    painter.beginPath();
    for (const points of segments) trace(points);
    painter.strokeStyle = colour;
    painter.lineWidth = width;
    painter.stroke();
  };
  const fills = (quads: readonly Quad[], colour: string) => {
    painter.beginPath();
    for (const quad of quads) {
      trace(quad);
      painter.closePath();
    }
    painter.fillStyle = colour;
    painter.fill();
  };
  lines(sheet.relief, RELIEF, 0.8 * scale);
  lines(sheet.coast, INK, 1.6 * scale);
  fills(sheet.floors, FLOOR);
  fills(sheet.walks, WALK);
  for (const tier of ['footpath', 'track'] as const) {
    const laid = sheet.paths.filter((path) => path.track === (tier === 'track')).map((path) => path.points);
    lines(laid, PATH, Math.max(1.2 * scale, PATH_M[tier] * view.scale));
  }
  fills(sheet.standing, STANDING);
  painter.setLineDash([4 * scale, 3 * scale]);
  lines([[...sheet.ring, ...sheet.ring.slice(0, 1)]], LIGHT_INK, scale);
  painter.setLineDash([]);
  const local = (point: Point2, draw: () => void) => {
    painter.save();
    painter.translate(...point);
    painter.scale(scale, scale);
    draw();
    painter.restore();
  };
  for (const mark of sheet.marks) local(onMap(mark.at), () => paintMark(painter, mark.kind));
  // The places' names under their middles, clear of a mark standing there; then each keeper's beside their stall
  // where it keeps clear of every name before it.
  const taken: { x: number; y: number; width: number; height: number }[] = [];
  painter.font = `500 ${PORT_PX}px ${FACE}`;
  painter.textAlign = 'center';
  for (const place of sheet.places) {
    const [x, y] = onMap(place.at);
    const [width, middle] = [painter.measureText(place.name).width * scale, y + 10 * scale];
    taken.push({ x: x - width / 2, y: middle - PORT_PX * 0.6 * scale, width, height: PORT_PX * 1.2 * scale });
    local([x, middle], () => word(painter, place.name, 0, 0, INK));
  }
  painter.font = `500 ${WORD_PX}px ${FACE}`;
  painter.textAlign = 'left';
  for (const mark of sheet.marks) {
    if (!mark.name) continue;
    const [x, y] = onMap(mark.at);
    const width = painter.measureText(mark.name).width * scale;
    const box = { x: x + 7 * scale, y: y - (WORD_PX / 2) * scale, width, height: WORD_PX * scale };
    if (taken.some((other) => overlaps(box, other))) continue;
    taken.push(box);
    local([x, y], () => word(painter, mark.name ?? '', 7, 0, LIGHT_INK));
  }
  if (player) local(onMap(player.at), () => paintArrow(painter, player.heading));
  painter.font = `500 ${TITLE_PX}px ${FACE}`;
  painter.textAlign = 'center';
  local([ink.width / 2, 16 * scale], () => word(painter, sheet.name, 0, 0, INK));
  paintMarkKey(painter, sheet, ink, scale);
  painter.restore();
}

const overlaps = (
  one: { x: number; y: number; width: number; height: number },
  two: { x: number; y: number; width: number; height: number },
) => one.x < two.x + two.width && two.x < one.x + one.width && one.y < two.y + two.height && two.y < one.y + one.height;

/** The key in the map's top-right corner: each kind of mark the sheet holds, its mark and what it is. */
function paintMarkKey(painter: Painter, sheet: LandSheet, ink: { readonly width: number }, scale: number): void {
  const kinds = (Object.keys(MARK_WORDS) as (keyof typeof MARK_WORDS)[]).filter((kind) =>
    sheet.marks.some((mark) => mark.kind === kind),
  );
  if (kinds.length === 0) return;
  painter.font = `500 ${WORD_PX}px ${FACE}`;
  const widest = Math.max(...kinds.map((kind) => painter.measureText(MARK_WORDS[kind]).width));
  const [width, height] = [widest + 34, kinds.length * 17 + 10];
  painter.save();
  painter.translate(ink.width - (width + 10) * scale, 10 * scale);
  painter.scale(scale, scale);
  painter.fillStyle = KEY_FILL;
  painter.fillRect(0, 0, width, height);
  painter.lineWidth = 1;
  painter.strokeStyle = INK;
  painter.strokeRect(0, 0, width, height);
  painter.textAlign = 'left';
  kinds.forEach((kind, index) => {
    const y = 13 + index * 17;
    painter.save();
    painter.translate(13, y);
    paintMark(painter, kind);
    painter.restore();
    painter.fillStyle = INK;
    painter.fillText(MARK_WORDS[kind], 25, y);
  });
  painter.restore();
}

/** A mark at the origin, units: a stall's filled coin, a landing's chevron, a gate's arch, a public event's red-brown
 *  diamond, a beacon's flame, a resource's small ring, foes' cross, an objective's ringed dot, a sealed door. */
export function paintMark(painter: Painter, kind: LandMarkKind): void {
  painter.lineWidth = 1.4;
  painter.strokeStyle = INK;
  painter.fillStyle = INK;
  painter.beginPath();
  if (kind === 'vendor') {
    painter.arc(0, 0, 3.5, 0, 2 * Math.PI);
    painter.fill();
  } else if (kind === 'landing') {
    painter.moveTo(-4.5, -3);
    painter.lineTo(0, 1.5);
    painter.lineTo(4.5, -3);
    painter.moveTo(-4.5, 1);
    painter.lineTo(0, 5.5);
    painter.lineTo(4.5, 1);
    painter.stroke();
  } else if (kind === 'gate') {
    painter.moveTo(-3.5, 4);
    painter.lineTo(-3.5, 0);
    painter.arc(0, 0, 3.5, Math.PI, 0);
    painter.lineTo(3.5, 4);
    painter.stroke();
  } else if (kind === 'event') {
    painter.fillStyle = ROUTE;
    painter.moveTo(0, -5.5);
    painter.lineTo(5.5, 0);
    painter.lineTo(0, 5.5);
    painter.lineTo(-5.5, 0);
    painter.closePath();
    painter.fill();
  } else if (kind === 'beacon') {
    painter.moveTo(0, -5);
    painter.lineTo(3.5, 3.5);
    painter.lineTo(-3.5, 3.5);
    painter.closePath();
    painter.fill();
  } else if (kind === 'resource') {
    painter.strokeStyle = LIGHT_INK;
    painter.arc(0, 0, 2.5, 0, 2 * Math.PI);
    painter.stroke();
  } else if (kind === 'foes') {
    painter.strokeStyle = ROUTE;
    painter.lineWidth = 1.8;
    painter.moveTo(-3.5, -3.5);
    painter.lineTo(3.5, 3.5);
    painter.moveTo(3.5, -3.5);
    painter.lineTo(-3.5, 3.5);
    painter.stroke();
  } else if (kind === 'objective') {
    painter.strokeStyle = ROUTE;
    painter.fillStyle = ROUTE;
    painter.arc(0, 0, 4.5, 0, 2 * Math.PI);
    painter.stroke();
    painter.beginPath();
    painter.arc(0, 0, 1.6, 0, 2 * Math.PI);
    painter.fill();
  } else {
    painter.strokeRect(-3, -4, 6, 8);
    painter.moveTo(0, -4);
    painter.lineTo(0, 4);
    painter.stroke();
  }
}
