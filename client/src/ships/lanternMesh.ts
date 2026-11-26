// The lanterns a hull carries, as vertices laid out as its mesh's are, drawn with it: each a six-sided glass between
// an iron foot and a peaked iron cap, on a pole from the rail or an arm out from a wall. A lantern the mesh already
// carries (`ship_details.py`'s at the taffrail) is only sleeved in glass. The glass is tagged GLASS_SHELL in its
// vertices' shell byte, which the ship shader draws as glass that burns as its ship's lanterns are lit.
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import type { Lantern } from './lanterns.ts';
import { VERTEX_BYTES } from './shipMesh.ts';

type Point = readonly [number, number, number];

/** The shell byte a lantern's glass carries: past the shell's 1 and the rest's 0. */
export const GLASS_SHELL = 2;
/** A lantern of ours: its glass's radius and half height; its foot's and cap's radius, the cap's height; a pole's
 *  radius; the sleeve's radius and half height round a mesh's own lantern's glass (iron of 0.17 m across 0.4 m). */
const GLASS = { radiusM: 0.15, halfM: 0.17 } as const;
const FOOT = { radiusM: 0.17, heightM: 0.05 } as const;
const CAP = { radiusM: 0.18, heightM: 0.14 } as const;
const POLE_M = 0.04;
const SLEEVE = { radiusM: 0.2, halfM: 0.2 } as const;
/** An arm's half thickness and how far over the cap it runs. */
const ARM_M = 0.025;
const ARM_OVER_M = 0.12;
const SIDES = 6;

/** A lantern's vertices and their triangles' corners, numbered from 0. */
export interface LanternMesh {
  readonly vertices: ArrayBuffer;
  readonly indices: Uint32Array<ArrayBuffer>;
}

/** Faces laid flat-shaded, each its own corners, so a lantern's edges stay crisp as the hull's. */
class Faces {
  readonly points: number[] = [];
  readonly corners: number[] = [];

  /** A face of `corners` (a fan) turned toward `out`, in `part`, its glass or not. Its front is laid as the ship's
   *  mesh lays it, where (third - first) × (second - first) points. */
  face(corners: readonly Point[], out: Point, part: number, shell = 0): void {
    const [first, second, third] = corners as [Point, Point, Point];
    const along = second.map((value, axis) => value - (first[axis] ?? 0));
    const across = third.map((value, axis) => value - (first[axis] ?? 0));
    const cross = [
      (across[1] ?? 0) * (along[2] ?? 0) - (across[2] ?? 0) * (along[1] ?? 0),
      (across[2] ?? 0) * (along[0] ?? 0) - (across[0] ?? 0) * (along[2] ?? 0),
      (across[0] ?? 0) * (along[1] ?? 0) - (across[1] ?? 0) * (along[0] ?? 0),
    ];
    const facing = cross[0] * out[0] + cross[1] * out[1] + cross[2] * out[2];
    const laid = facing >= 0 ? corners : [...corners].reverse();
    const start = this.points.length / 8;
    for (const corner of laid) this.points.push(...corner, ...out, part, shell);
    for (let nth = 1; nth < laid.length - 1; nth++) this.corners.push(start, start + nth, start + nth + 1);
  }

  /** An upright of SIDES faces round (x, y) from `low` to `high`, its radius `bottom` there and `top` at its top,
   *  capped at both ends. */
  upright(
    x: number,
    y: number,
    [low, high]: readonly [number, number],
    [bottom, top]: readonly [number, number],
    part: number,
    shell = 0,
  ) {
    const ring = (z: number, radius: number): Point[] =>
      Array.from({ length: SIDES }, (unused, side) => {
        const angle = (side / SIDES) * Math.PI * 2;
        return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z];
      });
    const [under, over] = [ring(low, bottom), ring(high, top)];
    for (let side = 0; side < SIDES; side++) {
      const next = (side + 1) % SIDES;
      const angle = ((side + 0.5) / SIDES) * Math.PI * 2;
      const slope = (bottom - top) / Math.max(1e-6, high - low);
      const length = Math.hypot(1, slope);
      const out: Point = [Math.cos(angle) / length, Math.sin(angle) / length, slope / length];
      this.face([under[side], under[next], over[next], over[side]] as Point[], out, part, shell);
    }
    this.face(under, [0, 0, -1], part, shell);
    if (top > 1e-3) this.face(over, [0, 0, 1], part, shell);
  }

  /** A box from `low` to `high`, its six faces. */
  box(low: Point, high: Point, part: number): void {
    const corner = (bits: number): Point =>
      [0, 1, 2].map((axis) => ((bits >> axis) & 1 ? high : low)[axis] ?? 0) as unknown as Point;
    for (let axis = 0; axis < 3; axis++)
      for (const side of [0, 1]) {
        const out = [0, 0, 0].map((unused, each) => (each === axis ? side * 2 - 1 : 0)) as unknown as Point;
        const [first, second] = [0, 1, 2].filter((each) => each !== axis) as [number, number];
        const cornerOf = (along: number, across: number) =>
          corner((side << axis) | (along << first) | (across << second));
        this.face([cornerOf(0, 0), cornerOf(1, 0), cornerOf(1, 1), cornerOf(0, 1)], out, part);
      }
  }
}

/** The vertices and corners of `lanterns`, in a hull's frame. */
export function lanternMesh(lanterns: readonly Lantern[]): LanternMesh {
  const iron = SHIP_PARTS.indexOf('iron');
  const spar = SHIP_PARTS.indexOf('spar');
  const faces = new Faces();
  for (const { at, hung } of lanterns) {
    const [x, y, z] = at;
    if (hung === 'built') {
      faces.upright(x, y, [z - SLEEVE.halfM, z + SLEEVE.halfM], [SLEEVE.radiusM, SLEEVE.radiusM], iron, GLASS_SHELL);
      continue;
    }
    const [low, high] = [z - GLASS.halfM, z + GLASS.halfM];
    faces.upright(x, y, [low, high], [GLASS.radiusM, GLASS.radiusM], iron, GLASS_SHELL);
    faces.upright(x, y, [low - FOOT.heightM, low], [FOOT.radiusM, FOOT.radiusM], iron);
    faces.upright(x, y, [high, high + CAP.heightM], [CAP.radiusM, 0.03], iron);
    if ('pole' in hung) faces.upright(x, y, [hung.pole, low - FOOT.heightM], [POLE_M, POLE_M], spar);
    else {
      // Out from the wall over its cap, then a hook down to the cap's peak.
      const top = high + CAP.heightM + ARM_OVER_M;
      const [near, far] = [Math.min(hung.arm, x), Math.max(hung.arm, x)];
      faces.box([near, y - ARM_M, top - ARM_M], [far + ARM_M, y + ARM_M, top + ARM_M], iron);
      faces.box([x - ARM_M / 2, y - ARM_M / 2, high + CAP.heightM - 0.02], [x + ARM_M / 2, y + ARM_M / 2, top], iron);
    }
  }
  const count = faces.points.length / 8;
  const vertices = new ArrayBuffer(count * VERTEX_BYTES);
  const view = new DataView(vertices);
  for (let vertex = 0; vertex < count; vertex++) {
    const read = (offset: number) => faces.points[vertex * 8 + offset] ?? 0;
    const byte = vertex * VERTEX_BYTES;
    [0, 1, 2].forEach((axis) => view.setFloat32(byte + axis * 4, read(axis), true));
    [0, 1, 2].forEach((axis) => view.setInt8(byte + 12 + axis, Math.round(read(3 + axis) * 127)));
    // Its UVs are metres along it and up, as a part's picture is laid.
    view.setFloat32(byte + 16, read(0) + read(1), true);
    view.setFloat32(byte + 20, read(2), true);
    view.setUint8(byte + 24, read(6));
    view.setUint8(byte + 25, read(7));
  }
  return { vertices, indices: new Uint32Array(faces.corners) };
}
