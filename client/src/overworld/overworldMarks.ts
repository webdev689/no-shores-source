import { projectPoint, type CameraPose, type ScreenPoint, type Viewport } from './overworldCamera.ts';
import type { Vec3 } from './ground.ts';

/** The kinds of node an island's side shows, each drawn by its kind. */
export const MARK_KINDS = ['social', 'patrol', 'mission', 'dungeon', 'boss', 'port', 'playlist'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

/** A node to mark: its place in the world, whether it is held at the picture's edge when off it, and whether its node
 *  is locked, shown but never landed at. */
export interface Mark {
  readonly id: string;
  readonly kind: MarkKind;
  readonly name: string;
  readonly at: Vec3;
  readonly edge?: boolean;
  readonly locked?: boolean;
}

/** A mark laid on the picture: where it is drawn, how far it stands from the eye, its size in the world and on the
 *  screen, and, when held at the edge, the way its arrow points (degrees clockwise from up). */
export interface PlacedMark {
  readonly id: string;
  readonly kind: MarkKind;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly distance: number;
  readonly worldM: number;
  readonly sizePx: number;
  readonly held: boolean;
  readonly arrowDegrees: number | null;
}

/**
 * The grow law. A mark stands `worldM` tall with the eye `growHeightM` over it, and grows with the eye's height over
 * it from there, so it reads at one size on the screen from the sea camera to the island's bird's-eye view and still
 * nearer marks read larger. Its screen size is held between `minPx` and `maxPx`; a mark held at the edge is `heldPx`.
 * `edgeMarginPx` is how far in from the edge a held mark stands.
 */
export const MARK = { worldM: 24, growHeightM: 260, minPx: 20, maxPx: 96, heldPx: 28, edgeMarginPx: 28 } as const;

/** How many times its own size a mark is drawn with the eye `heightAboveM` over it. */
export function markGrow(heightAboveM: number): number {
  return Number.isFinite(heightAboveM) ? Math.max(1, heightAboveM / MARK.growHeightM) : 1;
}

/**
 * Where a mark off the picture is held at its edge (inset by `margin`, and by `top` and `foot` for the furniture
 * there), and the way its arrow points; null for a point on the picture. A point behind the eye projects through
 * the mirror of itself, so its way from the middle is turned round first.
 */
export function edgeHold(
  point: ScreenPoint,
  width: number,
  height: number,
  margin: number = MARK.edgeMarginPx,
  top: number = margin,
  foot: number = margin,
): { readonly x: number; readonly y: number; readonly angle: number } | null {
  if (point.front && point.x >= margin && point.x <= width - margin && point.y >= top && point.y <= height - foot) {
    return null;
  }
  const [middleX, middleY] = [width / 2, height / 2];
  let [offsetX, offsetY] = [point.x - middleX, point.y - middleY];
  if (!point.front) [offsetX, offsetY] = [-offsetX, -offsetY];
  // Straight behind: below, where the ground behind would be.
  if (Math.abs(offsetX) < 1e-6 && Math.abs(offsetY) < 1e-6) offsetY = 1;
  const acrossRoom = (middleX - margin) / Math.max(1e-6, Math.abs(offsetX));
  const downRoom = (offsetY < 0 ? middleY - top : middleY - foot) / Math.max(1e-6, Math.abs(offsetY));
  const scale = Math.min(acrossRoom, downRoom);
  return {
    x: middleX + offsetX * scale,
    y: middleY + offsetY * scale,
    angle: (Math.atan2(offsetX, -offsetY) * 180) / Math.PI,
  };
}

/**
 * The marks laid on the picture, farthest first, so the nearest is drawn last, on top. A mark off the picture is
 * held at its edge when it asks to be, else left out. `edges` insets the edge for furniture at the top and foot.
 */
export function placeMarks(
  marks: readonly Mark[],
  pose: CameraPose,
  viewport: Viewport,
  edges: { readonly top?: number; readonly foot?: number } = {},
): PlacedMark[] {
  const { width, height } = viewport;
  const focal = height / 2 / Math.tan(pose.fovY / 2);
  const placed: PlacedMark[] = [];
  for (const mark of marks) {
    const shown = projectPoint(pose, viewport, mark.at);
    const held = mark.edge ? edgeHold(shown, width, height, MARK.edgeMarginPx, edges.top, edges.foot) : null;
    const onPicture = shown.front && shown.x >= 0 && shown.x <= width && shown.y >= 0 && shown.y <= height;
    if (!held && !onPicture) continue;
    const worldM = MARK.worldM * markGrow(pose.eye[2] - mark.at[2]);
    const sizePx = held ? MARK.heldPx : Math.max(MARK.minPx, Math.min(MARK.maxPx, (worldM * focal) / shown.depth));
    placed.push({
      id: mark.id,
      kind: mark.kind,
      name: mark.name,
      x: held ? held.x : shown.x,
      y: held ? held.y : shown.y,
      distance: Math.hypot(mark.at[0] - pose.eye[0], mark.at[1] - pose.eye[1], mark.at[2] - pose.eye[2]),
      worldM,
      sizePx,
      held: held !== null,
      arrowDegrees: held ? held.angle : null,
    });
  }
  return placed.sort((a, b) => b.distance - a.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The id of the mark under a pointer: the topmost (nearest) whose square holds it, or null. */
export function pickMark(placed: readonly PlacedMark[], x: number, y: number): string | null {
  for (let i = placed.length - 1; i >= 0; i--) {
    const mark = placed[i];
    const half = mark.sizePx / 2;
    if (Math.abs(x - mark.x) <= half && Math.abs(y - mark.y) <= half) return mark.id;
  }
  return null;
}
