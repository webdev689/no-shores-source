// The land sheet (landSheet.ts) painted onto the parchment's picture in the map's own inks and washes, as the waters
// are lettered at sea (mapLetters.ts): the sea washed and the shore inked, the ground's relief, the plan's grounds
// hand-coloured, its walks, paths, what stands with its shadow, its trees and bushes, the edge walked; the places by
// name; every mark as its glyph; the player's arrow; and the table that says what each glyph is (landTable.ts).
import type { Point2 } from '../overworld/ground.ts';
import type { Rect, View } from './heldMapLaw.ts';
import { GLYPH_HALF, paintGlyph } from './landGlyphs.ts';
import type { GroundKind, LandSheet, MapMarks, Quad } from './landSheet.ts';
import { barOf, paintDot, paintTable, tablePlace, tableRows, tableSize } from './landTable.ts';
import { FACE, INK, type KeyPlace } from './mapKey.ts';
import { PORT_PX } from './mapLayout.ts';
import { LIGHT_INK, paintArrow, type Painter, ROUTE, word } from './mapLetters.ts';

/** What a painting of the land asks: the sheet, the view of it (its metres), the map's size, how many times over its
 *  words and marks are drawn (`letterScale`), the gauntlets' cover over the map (ink pixels), where the table stood
 *  last, and the player's arrow where they stand and face, the sheet's metres. */
export interface LandPainting {
  readonly sheet: LandSheet;
  readonly view: View;
  readonly ink: { readonly width: number; readonly height: number };
  readonly scale: number;
  readonly covers: readonly Rect[];
  readonly table: KeyPlace | null;
  readonly player: { readonly at: Point2; readonly heading: number } | null;
  /** What moves on the land, in the world: the other players and the public event running. */
  readonly moving?: MapMarks;
}

/** The washes and inks of the land, as a surveyor colours a plan: the sea, each ground, the walks, what stands and
 *  its shadow, the tracks' casing and their way, the footpaths, the relief and its index lines, the trees. */
const SEA = 'rgba(96, 128, 140, 0.24)';
const GROUNDS: Readonly<Record<GroundKind, string>> = {
  paving: 'rgba(58, 40, 22, 0.07)',
  lawn: 'rgba(104, 132, 64, 0.26)',
  earth: 'rgba(150, 108, 58, 0.2)',
  water: 'rgba(80, 122, 142, 0.38)',
};
const WALK = 'rgba(92, 70, 49, 0.26)';
const STANDING = 'rgba(58, 40, 22, 0.78)';
const SHADOW = 'rgba(58, 40, 22, 0.22)';
const CASING = 'rgba(58, 40, 22, 0.6)';
const TRACK = 'rgb(226, 206, 164)';
const FOOTPATH = 'rgba(92, 70, 49, 0.6)';
const RELIEF = 'rgba(92, 70, 49, 0.28)';
const INDEX = 'rgba(92, 70, 49, 0.5)';
const TREE = 'rgba(84, 112, 56, 0.6)';
const RIVER = 'rgba(80, 122, 142, 0.55)';
const LOW = 'rgba(58, 40, 22, 0.38)';
const OVERHEAD = 'rgba(58, 40, 22, 0.55)';
/** A tree's crown and a bush's, metres across, and the least, units. */
const CROWN_M = { tree: 5, bush: 2.4 } as const;
const LEAST_CROWN = 1.4;
/** How far a place's name stands from its middle, units, clear of a glyph standing there: under it, else over it,
 *  else twice as far under or over. */
const NAME_OFF = GLYPH_HALF + PORT_PX * 0.6 + 1;

const overlaps = (one: Rect, two: Rect) =>
  one.x < two.x + two.width && two.x < one.x + one.width && one.y < two.y + two.height && two.y < one.y + one.height;

/** Paints `painting` onto the parchment's picture: `inkAt` is where the map's top-left stands in it, and `dpr` its
 *  pixels a screen pixel. The picture is cleared first, and nothing is painted outside the map. Answers where the
 *  table stands, for the next painting to keep it there. */
export function paintLand(
  painter: Painter,
  picture: { readonly width: number; readonly height: number },
  inkAt: { readonly x: number; readonly y: number },
  dpr: number,
  painting: LandPainting,
): KeyPlace {
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
  const trace = (points: readonly Point2[], shift = 0) =>
    points.forEach((point, index) => {
      const [x, y] = onMap(point);
      if (index === 0) painter.moveTo(x + shift, y + shift);
      else painter.lineTo(x + shift, y + shift);
    });
  const lines = (segments: readonly (readonly Point2[])[], colour: string, width: number) => {
    painter.beginPath();
    for (const points of segments) trace(points);
    painter.strokeStyle = colour;
    painter.lineWidth = width;
    painter.stroke();
  };
  const fills = (shapes: readonly (readonly Point2[])[], colour: string, shift = 0) => {
    painter.beginPath();
    for (const shape of shapes) {
      trace(shape, shift);
      painter.closePath();
    }
    painter.fillStyle = colour;
    painter.fill();
  };
  fills(sheet.sea, SEA);
  painter.strokeStyle = RIVER;
  for (const river of sheet.rivers) {
    painter.lineWidth = Math.max(1.2 * scale, river.width * view.scale);
    painter.beginPath();
    trace([river.from, river.to]);
    painter.stroke();
  }
  lines(sheet.relief, RELIEF, 0.7 * scale);
  lines(sheet.index, INDEX, 1.1 * scale);
  lines(sheet.coast, INK, 1.5 * scale);
  for (const kind of Object.keys(GROUNDS) as GroundKind[]) {
    const quads: Quad[] = sheet.grounds.filter((ground) => ground.kind === kind).map((ground) => ground.quad);
    fills(quads, GROUNDS[kind]);
  }
  fills(sheet.walks, WALK);
  // Every track's casing before any track's way, so where tracks meet their ways run on together; then the
  // footpaths, dashed, a little narrower than they are laid so they read as trodden.
  const [tracks, footpaths] = [sheet.paths.filter((path) => path.track), sheet.paths.filter((path) => !path.track)];
  const across = (path: (typeof tracks)[number], share = 1) => Math.max(1.2 * scale, path.width * share * view.scale);
  for (const path of tracks) lines([path.points], CASING, across(path) + 1.4 * scale);
  for (const path of tracks) lines([path.points], TRACK, across(path));
  painter.setLineDash([3 * scale, 2 * scale]);
  for (const path of footpaths) lines([path.points], FOOTPATH, across(path, 0.6));
  painter.setLineDash([]);
  fills(sheet.low, LOW);
  fills(sheet.standing, SHADOW, 1.4 * scale);
  fills(sheet.standing, STANDING);
  // What stands overhead, walked under: its outline only, dashed, as a plan shows a roof or an arch above.
  painter.setLineDash([2.5 * scale, 2 * scale]);
  painter.beginPath();
  for (const quad of sheet.overhead) {
    trace(quad);
    painter.closePath();
  }
  painter.strokeStyle = OVERHEAD;
  painter.lineWidth = 0.8 * scale;
  painter.stroke();
  painter.setLineDash([]);
  painter.beginPath();
  for (const plant of sheet.plants) {
    const [x, y] = onMap(plant.at);
    const radius = Math.max(LEAST_CROWN * scale, ((plant.tree ? CROWN_M.tree : CROWN_M.bush) * view.scale) / 2);
    painter.moveTo(x + radius, y);
    painter.arc(x, y, radius, 0, 2 * Math.PI);
  }
  painter.fillStyle = TREE;
  painter.fill();
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
  // Every mark as its glyph; then each place's name under its middle, else over it, where it keeps clear of the
  // glyphs, the names before it and the gauntlets; then the player's arrow over all, and the table.
  const half = GLYPH_HALF * scale;
  const taken: Rect[] = sheet.marks.map((mark) => {
    const [x, y] = onMap(mark.at);
    return { x: x - half, y: y - half, width: 2 * half, height: 2 * half };
  });
  for (const mark of sheet.marks) local(onMap(mark.at), () => paintGlyph(painter, mark.glyph));
  painter.font = `500 ${PORT_PX}px ${FACE}`;
  painter.textAlign = 'center';
  for (const place of sheet.places) {
    const [x, y] = onMap(place.at);
    const [width, height] = [painter.measureText(place.name).width * scale, PORT_PX * 1.2 * scale];
    const spot = [1, -1, 2, -2]
      .map((away) => y + away * NAME_OFF * scale)
      .map((middle) => ({ middle, box: { x: x - width / 2, y: middle - height / 2, width, height } }))
      .find(({ box }) => ![...taken, ...painting.covers].some((other) => overlaps(box, other)));
    if (!spot) continue;
    taken.push(spot.box);
    local([x, spot.middle], () => word(painter, place.name, 0, 0, INK));
  }
  // The public event running: ringed at its ground in the route's red-brown, its name and the time it has left beside.
  const fromWorld = ([x, y]: Point2): Point2 => onMap([x - sheet.origin[0], y - sheet.origin[1]]);
  for (const event of painting.moving?.events ?? []) {
    local(fromWorld(event.at), () => {
      painter.beginPath();
      painter.arc(0, 0, GLYPH_HALF + 3, 0, 2 * Math.PI);
      painter.strokeStyle = ROUTE;
      painter.lineWidth = 1.6;
      painter.stroke();
      painter.textAlign = 'left';
      word(painter, `${event.name} ${event.clock}`, GLYPH_HALF + 6, 0, ROUTE);
    });
  }
  // Every other player in the room, then the player's own arrow over all.
  for (const other of painting.moving?.others ?? []) local(fromWorld(other.at), () => paintDot(painter, other.company));
  if (player) local(onMap(player.at), () => paintArrow(painter, player.heading));
  const rows = tableRows(sheet, painting.moving?.others);
  const size = tableSize(painter, sheet.name, rows);
  const box = { width: size.width * scale, height: size.height * scale };
  const place = tablePlace(ink, box, scale, taken, painting.covers, painting.table);
  paintTable(painter, place, scale, { name: sheet.name, rows, bar: barOf(view, scale) });
  painter.restore();
  return place;
}
