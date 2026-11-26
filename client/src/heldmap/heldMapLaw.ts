// The held map's rules, as DFO's held map had them: the painting fitted to the screen by its parchment, raised and
// lowered, and the view of the world on the parchment panned, zoomed and picked. Nothing here draws; the held map's
// view does.

import type { Difficulty } from './heldMap.ts';

/** The voyage card's difficulties, easiest first. */
const SEAS_ORDER: readonly Difficulty[] = ['normal', 'elite', 'abyss'];

/** The voyage card's difficulty as the gates leave it: the hardest one open at or below the one picked, and the first
 *  reason a tier is shut, for the card's line (null when none is). With no word of the character, none is shut. */
export function seasChoices(
  picked: Difficulty,
  shut: readonly (string | null)[],
): { readonly picked: Difficulty; readonly why: string | null } {
  const open = SEAS_ORDER.slice(0, SEAS_ORDER.indexOf(picked) + 1).filter((tier, index) => !shut[index]);
  return { picked: open.at(-1) ?? 'normal', why: shut.find((reason) => reason) ?? null };
}

/** The forge's held-map painting, pixels: the sheet and each frame of the hands, drawn six times over, are this size. */
export const SPRITE = { width: 1648, height: 1086 } as const;
/** The parchment on the painting, as shares of its width and height (the sheet's opaque extent). */
export const SHEET = { x0: 330 / 1648, x1: 1320 / 1648, y0: 168 / 1086, y1: 804 / 1086 } as const;
/** The share of the parchment's size left bare round the map, for its torn edge. */
const INK_INSET = 0.035;
/** The parchment's fit: at most this share of the screen's width or height, under a head and over a foot of these
 *  shares, and at least these many pixels. */
const FIT = { width: 0.9, height: 0.84, head: 0.1, headPx: 78, foot: 0.06, footPx: 52 } as const;
/** How far past the screen's foot the painting's foot sits, as a share of its height: the gauntlets run off the screen
 *  where the parchment's fit allows. */
const BITE = 0.04;
/** Seconds the painting takes to rise and to lower. */
export const OPEN_S = 0.42;
export const CLOSE_S = 0.36;
/** The most the map zooms in, screen pixels a kilometre. */
export const SCALE_MOST = 6 / 1000;
/** How much of the world the map first shows across, metres. */
const FIRST_SPAN_M = 1_600_000;
/** A press that moves more than this, screen pixels across and down together, pans; less is a click. */
export const PAN_PX = 6;
/** How near a click must come to a mark to pick it, screen pixels. */
export const PICK_PX = 16;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The painting's rectangle on a screen and the map's within its parchment, the parchment fitted first. */
export function stageOf(viewport: { readonly width: number; readonly height: number }): {
  readonly sprite: Rect;
  readonly ink: Rect;
} {
  const { width: screenW, height: screenH } = viewport;
  const [sheetW, sheetH] = [SHEET.x1 - SHEET.x0, SHEET.y1 - SHEET.y0];
  const aspect = SPRITE.height / SPRITE.width;
  const head = Math.max(FIT.head * screenH, FIT.headPx);
  const foot = screenH - Math.max(FIT.foot * screenH, FIT.footPx);
  let width = (FIT.width * screenW) / sheetW;
  let height = width * aspect;
  // A window shorter than the head and foot it keeps clear still holds a painting, however small, never one of no size.
  const tallest = Math.max(1, Math.min(FIT.height * screenH, foot - head));
  if (height * sheetH > tallest) {
    height = tallest / sheetH;
    width = height / aspect;
  }
  let y = Math.max(head - height * SHEET.y0, screenH - (1 - BITE) * height);
  y = Math.min(y, foot - height * SHEET.y1);
  const sprite = { x: (screenW - width) / 2, y, width, height };
  const insetX = INK_INSET * sheetW * width;
  const insetY = INK_INSET * sheetH * height;
  return {
    sprite,
    ink: {
      x: sprite.x + SHEET.x0 * width + insetX,
      y: sprite.y + SHEET.y0 * height + insetY,
      width: sheetW * width - 2 * insetX,
      height: sheetH * height - 2 * insetY,
    },
  };
}

/** How far up the painting has come, 0 down to 1 raised, from how far through its rise or lower `share` is: eased at
 *  both ends, as DFO's sheet slides. */
export function raised(share: number): number {
  const t = Math.min(1, Math.max(0, share));
  return t * t * (3 - 2 * t);
}

/** The map's view: the world point at the map's top-left, metres, and screen pixels a metre. */
export interface View {
  readonly left: number;
  readonly top: number;
  readonly scale: number;
}

type Size = { readonly width: number; readonly height: number };
/** What a view is held to: the world it shows, and the most it zooms in, screen pixels a metre (`SCALE_MOST` unless
 *  said, as on land, where the sheet is a few hundred metres across). */
export type Extent = Size & { readonly most?: number };

/** The least scale: the whole world fits the map. */
export function leastScale(ink: Size, world: Size): number {
  return Math.min(ink.width / world.width, ink.height / world.height);
}

/** A view held to its limits: the scale between the whole world and the closest, and on each axis the world centred
 *  where it is narrower than the map, else kept filling it. */
export function clampView(view: View, ink: Size, world: Extent): View {
  const scale = Math.min(world.most ?? SCALE_MOST, Math.max(leastScale(ink, world), view.scale));
  const along = (origin: number, inkSize: number, worldSize: number) => {
    const seen = inkSize / scale;
    return seen >= worldSize ? (worldSize - seen) / 2 : Math.min(worldSize - seen, Math.max(0, origin));
  };
  return {
    left: along(view.left, ink.width, world.width),
    top: along(view.top, ink.height, world.height),
    scale,
  };
}

/** The view a map opens on: centred on `focus`, `span` metres across (at sea `FIRST_SPAN_M`). */
export function viewOn(focus: readonly [number, number], ink: Size, world: Extent, span = FIRST_SPAN_M): View {
  const scale = ink.width / span;
  return clampView(
    { left: focus[0] - ink.width / 2 / scale, top: focus[1] - ink.height / 2 / scale, scale },
    ink,
    world,
  );
}

/** A world point on the map, screen pixels from its top-left. */
export function toInk(view: View, x: number, y: number): readonly [number, number] {
  return [(x - view.left) * view.scale, (y - view.top) * view.scale];
}

/** The world point under a point on the map, screen pixels from its top-left. */
export function toWorld(view: View, inkX: number, inkY: number): readonly [number, number] {
  return [view.left + inkX / view.scale, view.top + inkY / view.scale];
}

/** The view zoomed by `factor` about a point on the map, which stays under the cursor where the limits allow. */
export function zoomAt(view: View, inkX: number, inkY: number, factor: number, ink: Size, world: Extent): View {
  const scale = clampView({ ...view, scale: view.scale * factor }, ink, world).scale;
  const [x, y] = toWorld(view, inkX, inkY);
  return clampView({ left: x - inkX / scale, top: y - inkY / scale, scale }, ink, world);
}

/** A wheel's turn as a zoom factor: a line is 16 pixels, a page the map's height, and in by a fifth near a notch. */
export function wheelFactor(deltaY: number, deltaMode: number, pagePx: number): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * pagePx : deltaY;
  return Math.exp(-pixels * 0.0012);
}

/** The nearest of some marks, screen pixels on the map, within `PICK_PX` of a point; null where none is. */
export function nearestMark<T extends { readonly x: number; readonly y: number }>(
  marks: readonly T[],
  inkX: number,
  inkY: number,
): T | null {
  let best: { mark: T; distance: number } | null = null;
  for (const mark of marks) {
    const distance = Math.hypot(mark.x - inkX, mark.y - inkY);
    if (distance <= PICK_PX && (!best || distance < best.distance)) best = { mark, distance };
  }
  return best?.mark ?? null;
}

/** A route as the map inks it: every step-th point and the last, at most `most`, each with how far along the route it
 *  lies, four floats a point (east, south, metres along, 0). */
export function routeOf(points: readonly (readonly [number, number])[], most: number): Float32Array {
  const step = Math.max(1, Math.ceil((points.length - 1) / (most - 1)));
  const kept = points.filter((unused, index) => index % step === 0 || index === points.length - 1);
  const out = new Float32Array(kept.length * 4);
  let along = 0;
  kept.forEach((point, index) => {
    const before = kept[index - 1];
    if (before) along += Math.hypot(point[0] - before[0], point[1] - before[1]);
    out.set([point[0], point[1], along, 0], index * 4);
  });
  return out;
}
