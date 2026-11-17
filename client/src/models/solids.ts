// The solids every forge builds from: boxes, prisms, gables, pyramids, wedges, logs, wheels and blocks, each laid
// through a face builder that may be turned. Nothing here knows a classic model.
import type { Face } from './parts.ts';
import { rockOf } from './rock.ts';
import { faceNormal, type Vector } from './vector.ts';

type Range = readonly number[];
type Corners = readonly (readonly number[])[];

/** The solids, each laid by `quad` and `tri`. */
export function solidsOf(quad: Face, tri: Face) {
  /** A box over the three ranges, but the faces `skip` names ('bottom', 'top', '-x', '+x', '-z', '+z'). */
  function box(
    picture: readonly number[],
    spanX: Range,
    spanY: Range,
    spanZ: Range,
    skip: readonly string[] = ['bottom'],
  ): void {
    const [fromX, toX] = spanX,
      [fromY, toY] = spanY,
      [fromZ, toZ] = spanZ;
    if (toX - fromX <= 1e-6 || toY - fromY <= 1e-6 || toZ - fromZ <= 1e-6) return;
    const off = new Set(skip);
    if (!off.has('+z'))
      quad(
        picture,
        [
          [fromX, fromY, toZ],
          [toX, fromY, toZ],
          [toX, toY, toZ],
          [fromX, toY, toZ],
        ],
        [0, 0, 1],
      );
    if (!off.has('-z'))
      quad(
        picture,
        [
          [toX, fromY, fromZ],
          [fromX, fromY, fromZ],
          [fromX, toY, fromZ],
          [toX, toY, fromZ],
        ],
        [0, 0, -1],
      );
    if (!off.has('-x'))
      quad(
        picture,
        [
          [fromX, fromY, fromZ],
          [fromX, fromY, toZ],
          [fromX, toY, toZ],
          [fromX, toY, fromZ],
        ],
        [-1, 0, 0],
      );
    if (!off.has('+x'))
      quad(
        picture,
        [
          [toX, fromY, toZ],
          [toX, fromY, fromZ],
          [toX, toY, fromZ],
          [toX, toY, toZ],
        ],
        [1, 0, 0],
      );
    if (!off.has('top'))
      quad(
        picture,
        [
          [fromX, toY, toZ],
          [toX, toY, toZ],
          [toX, toY, fromZ],
          [fromX, toY, fromZ],
        ],
        [0, 1, 0],
      );
    if (!off.has('bottom'))
      quad(
        picture,
        [
          [fromX, fromY, fromZ],
          [toX, fromY, fromZ],
          [toX, fromY, toZ],
          [fromX, fromY, toZ],
        ],
        [0, -1, 0],
      );
  }
  /**
   * An upright prism about (middleX, middleZ): `sides` corners on an ellipse of radii radiusX, radiusZ at `fromY`,
   * scaled by `taper` at `toY`, its top capped, turned `turn` radians; a point where `taper` is 0. With `fill` its
   * ring is stretched to touch the ellipse's box on all four sides, so a round piece fills the box it stands in.
   */
  function prism(
    picture: readonly number[],
    middleX: number,
    middleZ: number,
    radiusX: number,
    radiusZ: number,
    fromY: number,
    toY: number,
    sides: number,
    {
      taper = 1,
      top = true,
      turn = 0,
      fill = false,
    }: { taper?: number; top?: boolean; turn?: number; fill?: boolean } = {},
  ): void {
    const angles = Array.from({ length: sides }, (unused, k) => turn + (k / sides) * Math.PI * 2);
    const span = (trig: (angle: number) => number): number[] =>
      fill ? [Math.min(...angles.map(trig)), Math.max(...angles.map(trig))] : [-1, 1];
    const [cosLow, cosHigh] = span(Math.cos),
      [sinLow, sinHigh] = span(Math.sin);
    const ring = (y: number, scale: number): Vector[] =>
      angles.map((a) => [
        middleX + ((Math.cos(a) - (cosLow + cosHigh) / 2) / ((cosHigh - cosLow) / 2)) * radiusX * scale,
        y,
        middleZ + ((Math.sin(a) - (sinLow + sinHigh) / 2) / ((sinHigh - sinLow) / 2)) * radiusZ * scale,
      ]);
    const low = ring(fromY, 1),
      high = ring(toY, taper);
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides;
      if (taper <= 1e-6) tri(picture, [low[next], low[k], high[k]], faceNormal([low[next], low[k], high[k]]));
      else quad(picture, [low[next], low[k], high[k], high[next]], faceNormal([low[next], low[k], high[k]]));
    }
    if (top && taper > 1e-6)
      for (let k = 1; k < sides - 1; k++) tri(picture, [high[0], high[k + 1], high[k]], [0, 1, 0]);
  }
  /** A gable over the x and z ranges: its eaves at the low y, its ridge at the high y along x (`ridge` 'x') or z;
   *  its two slopes and its ends, the ends in `ends`. */
  function gable(
    picture: readonly number[],
    spanX: Range,
    spanY: Range,
    spanZ: Range,
    ridge = 'x',
    ends = picture,
  ): void {
    const [fromX, toX] = spanX,
      [fromY, toY] = spanY,
      [fromZ, toZ] = spanZ;
    if (ridge === 'x') {
      const midZ = (fromZ + toZ) / 2;
      quad(picture, [
        [fromX, fromY, toZ],
        [toX, fromY, toZ],
        [toX, toY, midZ],
        [fromX, toY, midZ],
      ]);
      quad(picture, [
        [toX, fromY, fromZ],
        [fromX, fromY, fromZ],
        [fromX, toY, midZ],
        [toX, toY, midZ],
      ]);
      tri(ends, [
        [fromX, fromY, fromZ],
        [fromX, fromY, toZ],
        [fromX, toY, midZ],
      ]);
      tri(ends, [
        [toX, fromY, toZ],
        [toX, fromY, fromZ],
        [toX, toY, midZ],
      ]);
    } else {
      const midX = (fromX + toX) / 2;
      quad(picture, [
        [toX, fromY, toZ],
        [toX, fromY, fromZ],
        [midX, toY, fromZ],
        [midX, toY, toZ],
      ]);
      quad(picture, [
        [fromX, fromY, fromZ],
        [fromX, fromY, toZ],
        [midX, toY, toZ],
        [midX, toY, fromZ],
      ]);
      tri(ends, [
        [fromX, fromY, toZ],
        [toX, fromY, toZ],
        [midX, toY, toZ],
      ]);
      tri(ends, [
        [toX, fromY, fromZ],
        [fromX, fromY, fromZ],
        [midX, toY, fromZ],
      ]);
    }
  }
  /** A four-sided pyramid over the x and z ranges from the low y to its point at the high y. */
  function pyramid(picture: readonly number[], spanX: Range, spanY: Range, spanZ: Range): void {
    const [fromX, toX] = spanX,
      [fromY, toY] = spanY,
      [fromZ, toZ] = spanZ;
    const apex = [(fromX + toX) / 2, toY, (fromZ + toZ) / 2];
    tri(picture, [[fromX, fromY, toZ], [toX, fromY, toZ], apex]);
    tri(picture, [[toX, fromY, toZ], [toX, fromY, fromZ], apex]);
    tri(picture, [[toX, fromY, fromZ], [fromX, fromY, fromZ], apex]);
    tri(picture, [[fromX, fromY, fromZ], [fromX, fromY, toZ], apex]);
  }
  /** A wedge over the x and z ranges: its high edge at the high y along the low z, its low edge on the low y along
   *  the high z (a ramp, a ledger's lid). */
  function wedge(picture: readonly number[], spanX: Range, spanY: Range, spanZ: Range): void {
    const [fromX, toX] = spanX,
      [fromY, toY] = spanY,
      [fromZ, toZ] = spanZ;
    quad(picture, [
      [fromX, fromY, toZ],
      [toX, fromY, toZ],
      [toX, toY, fromZ],
      [fromX, toY, fromZ],
    ]);
    quad(
      picture,
      [
        [toX, fromY, fromZ],
        [fromX, fromY, fromZ],
        [fromX, toY, fromZ],
        [toX, toY, fromZ],
      ],
      [0, 0, -1],
    );
    tri(
      picture,
      [
        [fromX, fromY, fromZ],
        [fromX, fromY, toZ],
        [fromX, toY, fromZ],
      ],
      [-1, 0, 0],
    );
    tri(
      picture,
      [
        [toX, fromY, toZ],
        [toX, fromY, fromZ],
        [toX, toY, fromZ],
      ],
      [1, 0, 0],
    );
  }
  /** A prism lying along x (`axis` 'x') from `from` to `to` about (middleY, middleAcross), middleAcross its z, or
   *  along z, middleAcross its x: `sides` corners on an ellipse of radii radiusY and radiusAcross, its two ends
   *  capped (a log, a fallen column, a wheel). */
  function lying(
    picture: readonly number[],
    from: number,
    to: number,
    middleY: number,
    middleAcross: number,
    radiusY: number,
    radiusAcross: number,
    sides: number,
    ends = true,
    axis = 'x',
  ): void {
    const pointAt = (along: number, y: number, crosswise: number): Vector =>
      axis === 'x' ? [along, y, crosswise] : [crosswise, y, along];
    const ring = (along: number): Vector[] =>
      Array.from({ length: sides }, (unused, k) => {
        const a = (k / sides) * Math.PI * 2;
        return pointAt(along, middleY + Math.cos(a) * radiusY, middleAcross + Math.sin(a) * radiusAcross);
      });
    const near = ring(from),
      far = ring(to);
    const inside = pointAt((from + to) / 2, middleY, middleAcross);
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides;
      facing(picture, [near[k], near[next], far[next], far[k]], inside);
    }
    if (ends)
      for (let k = 1; k < sides - 1; k++) {
        facing(picture, [near[0], near[k + 1], near[k]], inside);
        facing(picture, [far[0], far[k], far[k + 1]], inside);
      }
  }
  /** A wheel: a disc of radius `radius`, `thick` wide along its axle (`axis` 'x' or 'z'), about its centre. */
  const wheel = (
    picture: readonly number[],
    centreX: number,
    centreY: number,
    centreZ: number,
    radius: number,
    thick: number,
    axis = 'z',
  ): void =>
    axis === 'x'
      ? lying(picture, centreX - thick / 2, centreX + thick / 2, centreY, centreZ, radius, radius, 10)
      : lying(picture, centreZ - thick / 2, centreZ + thick / 2, centreY, centreX, radius, radius, 10, true, 'z');
  /** A face (three corners or four) turned away from `inside`, a point within its solid. */
  function facing(picture: readonly number[], corners: Corners, inside: readonly number[]): void {
    const n = faceNormal(corners);
    const middle = [0, 1, 2].map((axis) => corners.reduce((sum, corner) => sum + corner[axis], 0) / corners.length);
    const away = (middle[0] - inside[0]) * n[0] + (middle[1] - inside[1]) * n[1] + (middle[2] - inside[2]) * n[2];
    const out = away >= 0 ? n : [-n[0], -n[1], -n[2]];
    if (corners.length === 3) tri(picture, corners, out);
    else quad(picture, corners, out);
  }
  /** A box along any three edges `along`, `upward` and `w` from `origin` (a door's frame, a block square to a
   *  slanted door). */
  function block(
    picture: readonly number[],
    origin: readonly number[],
    along: readonly number[],
    upward: readonly number[],
    w: readonly number[],
  ): void {
    const pointAt = (i: number, j: number, k: number): Vector =>
      [0, 1, 2].map((axis) => origin[axis] + along[axis] * i + upward[axis] * j + w[axis] * k);
    const inside = pointAt(0.5, 0.5, 0.5);
    for (const [i, j] of [
      [0, 1],
      [1, 0],
      [1, 1],
    ])
      for (const side of [0, 1]) {
        const corner = (first: number, second: number): Vector =>
          i === 0
            ? pointAt(side, first, second)
            : j === 0
              ? pointAt(first, side, second)
              : pointAt(first, second, side);
        facing(picture, [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)], inside);
      }
  }
  return { box, prism, gable, pyramid, wedge, rock: rockOf(tri), lying, wheel, facing, block };
}

export type Solids = ReturnType<typeof solidsOf>;
