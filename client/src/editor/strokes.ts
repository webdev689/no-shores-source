// What the editor draws over its views as lines, fills and dots (the overlays' shapes), cut into the pieces its mark
// pass draws: each line a run of segments, each segment drawn as a capsule (a round joint) or cut square at a run's
// end, each fill a fan of triangles, each dot a disc or a ring. Lengths are CSS pixels of the view, as the overlays
// laid them; `inkVertices` turns them into the pass's vertices in device pixels.

/** A point on the view, CSS pixels. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Points joined by straight lines. */
export type Run = readonly ScreenPoint[];

/** One shape drawn over a view, painted once where its pieces overlap: a line through `runs` (`closed` back to its
 *  first point, `round` at its ends, dashed by `dash`'s lengths on and off), a filled ring, a disc, or a ring's edge
 *  `width` wide round a middle. */
export type Ink =
  | {
      readonly kind: 'stroke';
      readonly runs: readonly Run[];
      readonly colour: string;
      readonly width: number;
      readonly closed?: boolean;
      readonly round?: boolean;
      readonly dash?: readonly number[];
    }
  | { readonly kind: 'fill'; readonly ring: Run; readonly colour: string }
  | { readonly kind: 'disc'; readonly x: number; readonly y: number; readonly radius: number; readonly colour: string }
  | {
      readonly kind: 'ring';
      readonly x: number;
      readonly y: number;
      readonly radius: number;
      readonly width: number;
      readonly colour: string;
    };

/** A piece of an ink: a segment `half` wide either side, cut square at an end that is a run's end and not round; or a
 *  triangle of a fill. */
export type Piece =
  | {
      readonly kind: 'segment';
      readonly a: ScreenPoint;
      readonly b: ScreenPoint;
      readonly half: number;
      readonly startButt: boolean;
      readonly endButt: boolean;
    }
  | { readonly kind: 'triangle'; readonly corners: readonly [ScreenPoint, ScreenPoint, ScreenPoint] };

/** A colour's four channels, 0 to 1, not premultiplied. */
export type Rgba = readonly [number, number, number, number];

/** A colour as the overlays write them: `#rgb`, `#rrggbb` or `#rrggbbaa`. */
export function inkColour(css: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(css)?.[1];
  if (!hex) throw new Error(`not a colour the overlays write: ${css}`);
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  const channel = (from: number) => Number.parseInt(full.slice(from, from + 2), 16) / 255;
  return [channel(0), channel(2), channel(4), full.length === 8 ? channel(6) : 1];
}

const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const towards = (a: ScreenPoint, b: ScreenPoint, share: number) => ({
  x: a.x + (b.x - a.x) * share,
  y: a.y + (b.y - a.y) * share,
});

/** A run cut into the dashes of `pattern` (lengths on, off, on...), each dash the points it passes through. */
function dashed(run: Run, pattern: readonly number[]): ScreenPoint[][] {
  const total = pattern.reduce((sum, length) => sum + length, 0);
  if (total <= 0) return [[...run]];
  const dashes: ScreenPoint[][] = [];
  let index = 0;
  let left = pattern[0] ?? 0;
  let current: ScreenPoint[] | null = run[0] ? [run[0]] : null;
  const next = () => {
    index = (index + 1) % pattern.length;
    left = pattern[index] ?? 0;
  };
  for (let step = 1; step < run.length; step++) {
    let from = run[step - 1] ?? { x: 0, y: 0 };
    const to = run[step] ?? from;
    let length = distance(from, to);
    while (length > left) {
      const cut = towards(from, to, left / length);
      if (current) {
        current.push(cut);
        dashes.push(current);
        current = null;
      } else current = [cut];
      length -= left;
      from = cut;
      next();
    }
    left -= length;
    current?.push(to);
  }
  if (current && current.length > 1) dashes.push(current);
  return dashes;
}

/** The segments of an open run of points, its two ends cut square unless `round`. */
function segmentsOf(points: Run, half: number, round: boolean, loop: boolean): Piece[] {
  const pieces: Piece[] = [];
  const last = points.length - 2;
  for (let index = 0; index <= last; index++) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;
    pieces.push({
      kind: 'segment',
      a,
      b,
      half,
      startButt: index === 0 && !round && !loop,
      endButt: index === last && !round && !loop,
    });
  }
  return pieces;
}

/** A ring of points cut into triangles by its ears, which fill it whether it bulges or is notched; a ring that crosses
 *  itself fills only as far as its ears go. */
export function triangles(ring: Run): [ScreenPoint, ScreenPoint, ScreenPoint][] {
  const points = ring.filter((point, index) => {
    const before = ring[(index - 1 + ring.length) % ring.length];
    return !before || before.x !== point.x || before.y !== point.y;
  });
  const signedArea = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length] ?? point;
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  const left = signedArea >= 0 ? [...points] : [...points].reverse();
  const cross = (a: ScreenPoint, b: ScreenPoint, third: ScreenPoint) =>
    (b.x - a.x) * (third.y - a.y) - (b.y - a.y) * (third.x - a.x);
  const within = (point: ScreenPoint, a: ScreenPoint, b: ScreenPoint, third: ScreenPoint) =>
    cross(a, b, point) >= 0 && cross(b, third, point) >= 0 && cross(third, a, point) >= 0;
  const found: [ScreenPoint, ScreenPoint, ScreenPoint][] = [];
  while (left.length > 3) {
    let cut = -1;
    for (let index = 0; index < left.length && cut < 0; index++) {
      const a = left[(index - 1 + left.length) % left.length];
      const b = left[index];
      const third = left[(index + 1) % left.length];
      if (!a || !b || !third || cross(a, b, third) <= 0) continue;
      if (left.some((point) => point !== a && point !== b && point !== third && within(point, a, b, third))) continue;
      found.push([a, b, third]);
      cut = index;
    }
    if (cut < 0) return found;
    left.splice(cut, 1);
  }
  const [a, b, third] = left;
  if (a && b && third && cross(a, b, third) > 0) found.push([a, b, third]);
  return found;
}

/** The pieces an ink is drawn in. */
export function pieces(ink: Ink): Piece[] {
  if (ink.kind === 'fill') return triangles(ink.ring).map((corners) => ({ kind: 'triangle', corners }));
  if (ink.kind !== 'stroke') return [];
  const half = ink.width / 2;
  const round = Boolean(ink.round);
  return ink.runs.flatMap((run) => {
    const first = run[0];
    const loop = Boolean(ink.closed) && first !== undefined && run.length > 2;
    const whole = loop && first ? [...run, first] : run;
    if (!ink.dash?.length) return segmentsOf(whole, half, round, loop);
    return dashed(whole, ink.dash).flatMap((dash) => segmentsOf(dash, half, round, false));
  });
}

/** Floats a vertex takes: where it stands, the segment's two ends (a disc's or ring's middle twice), its half-width
 *  (negative for a fill's solid triangle) and its ends' cut, and its colour. */
export const VERTEX_FLOATS = 12;
/** The cut flags: the start cut square, the end cut square, a ring's edge rather than a disc. */
export const CUT = { start: 1, end: 2, ring: 4 } as const;

/** Every ink's vertices in device pixels, `scale` device pixels a CSS pixel, the view `left` CSS pixels in from the
 *  canvas's edge; each ink an item of its own, so the pass paints each once where its pieces overlap. */
export function inkVertices(
  inks: readonly Ink[],
  scale: number,
  left: number,
): { floats: Float32Array; items: { first: number; count: number }[] } {
  const out: number[] = [];
  const items: { first: number; count: number }[] = [];
  const device = (point: ScreenPoint) => [(point.x + left) * scale, point.y * scale] as const;
  const quad = (
    a: ScreenPoint,
    b: ScreenPoint,
    reach: number,
    shape: readonly [number, number, number, number, number, number],
    colour: Rgba,
  ) => {
    const [startX, startY] = device(a);
    const [endX, endY] = device(b);
    const length = Math.hypot(endX - startX, endY - startY);
    const [alongX, alongY] = length > 0 ? [(endX - startX) / length, (endY - startY) / length] : [1, 0];
    const [acrossX, acrossY] = [-alongY, alongX];
    const extent = reach * scale + 1;
    const corner = (end: 0 | 1, side: number) => {
      const [x, y] = end ? [endX, endY] : [startX, startY];
      const past = end ? extent : -extent;
      return [x + alongX * past + acrossX * side * extent, y + alongY * past + acrossY * side * extent] as const;
    };
    for (const [end, side] of [
      [0, -1],
      [1, -1],
      [1, 1],
      [0, -1],
      [1, 1],
      [0, 1],
    ] as const)
      out.push(...corner(end, side), ...shape, ...colour);
  };
  for (const ink of inks) {
    const first = out.length / VERTEX_FLOATS;
    const colour = inkColour(ink.colour);
    if (ink.kind === 'disc') {
      const [x, y] = device(ink);
      quad(ink, ink, ink.radius, [x, y, x, y, ink.radius * scale, 0], colour);
    } else if (ink.kind === 'ring') {
      const [x, y] = device(ink);
      quad(
        ink,
        ink,
        ink.radius + ink.width / 2,
        [x, y, ink.radius * scale, 0, (ink.width / 2) * scale, CUT.ring],
        colour,
      );
    } else
      for (const piece of pieces(ink)) {
        if (piece.kind === 'triangle')
          for (const corner of piece.corners) out.push(...device(corner), 0, 0, 0, 0, -1, 0, ...colour);
        else {
          const [startX, startY] = device(piece.a);
          const [endX, endY] = device(piece.b);
          const cut = (piece.startButt ? CUT.start : 0) | (piece.endButt ? CUT.end : 0);
          quad(piece.a, piece.b, piece.half, [startX, startY, endX, endY, piece.half * scale, cut], colour);
        }
      }
    const count = out.length / VERTEX_FLOATS - first;
    if (count > 0) items.push({ first, count });
  }
  return { floats: new Float32Array(out), items };
}
