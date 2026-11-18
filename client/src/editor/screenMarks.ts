// What the views draw over the land as lines, dots and names, in screen pixels: the port city, the nodes and their
// layouts share these, so their names are placed in one pass and never cover one another.

/** A world point on the screen, or null where it cannot be drawn (behind the 3D camera). `height` stands it at that
 *  height in 3D instead of on the ground as drawn; the 2D map ignores it. */
export type Project = (x: number, y: number, height?: number) => { readonly x: number; readonly y: number } | null;

/** One thing drawn over a view, in screen pixels. */
export type SiteMark =
  | { readonly shape: 'wall'; readonly path: string }
  | { readonly shape: 'section'; readonly path: string; readonly colour: string; readonly whole: boolean }
  | {
      readonly shape: 'line';
      readonly path: string;
      readonly colour: string;
      readonly width: number;
      readonly fill?: string;
      readonly dash?: string;
      /** A dark edge under it, so a pale line reads on pale ground. */
      readonly casing?: boolean;
    }
  | {
      readonly shape: 'dot';
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly fill: string;
      readonly stroke: string;
    }
  | { readonly shape: 'label'; readonly x: number; readonly y: number; readonly text: string; readonly colour: string };

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A label's box: about 6.6 pixels a character of the 12 px font, and its height. */
const CHARACTER_PX = 6.6;
const LABEL_PX = 14;

export const span = (box: Box) => Math.max(box.right - box.left, box.bottom - box.top);

/** An SVG path through projected points, broken where one cannot be drawn, with the box round those that can;
 *  `whole` when every point was drawn. A ring (`closed`) is closed when whole. */
export function pathThrough(
  points: readonly ReturnType<Project>[],
  closed = true,
): { path: string; whole: boolean; box: Box | null } {
  const gapAt = points.findIndex((point) => point === null);
  const whole = gapAt < 0;
  // A ring started at a gap draws its edge from its last point back to its first with the rest.
  const ordered = whole || !closed ? points : [...points.slice(gapAt), ...points.slice(0, gapAt)];
  let path = '';
  let gap = true;
  let box: Box | null = null;
  for (const point of ordered) {
    if (!point) {
      gap = true;
      continue;
    }
    path += `${gap ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    gap = false;
    box = box
      ? {
          left: Math.min(box.left, point.x),
          top: Math.min(box.top, point.y),
          right: Math.max(box.right, point.x),
          bottom: Math.max(box.bottom, point.y),
        }
      : { left: point.x, top: point.y, right: point.x, bottom: point.y };
  }
  return { path: whole && closed ? `${path}Z` : path, whole, box };
}

/** Names laid in the order asked, each left out where it would cover one laid before or a box kept clear. */
export class Labels {
  readonly marks: SiteMark[] = [];
  private readonly taken: Box[] = [];

  /** Lays a name centred on (x, y), its baseline there. */
  place(x: number, y: number, text: string, colour: string): void {
    const half = (text.length * CHARACTER_PX) / 2 + 2;
    const box = { left: x - half, top: y - LABEL_PX + 3, right: x + half, bottom: y + 3 };
    const covers = (other: Box) =>
      box.left < other.right && other.left < box.right && box.top < other.bottom && other.top < box.bottom;
    if (this.taken.some(covers)) return;
    this.taken.push(box);
    this.marks.push({ shape: 'label', x, y, text, colour });
  }

  /** Keeps a box clear of every later name. */
  keepClear(box: Box): void {
    this.taken.push(box);
  }
}
