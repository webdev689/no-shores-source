// Where a module gives light, read from its own surfaces: its crystal, its fire (the `glow` material: candles, a
// hearth, a lantern) and its stained glass, each gathered into a lamp a few metres across, at the middle of what of it
// lies there. A Breach's run is lit by these (eventProps.ts `propLamps`), so a module rebuilt lights where it now
// burns, with no list of lamps kept beside it.
import { moduleMesh, moduleParts, moduleShape } from './modules.ts';

type Point = readonly [number, number, number];

/** What a module's light is: a crystal's red, a fire's warmth, or the light through stained glass. */
export type LightKind = 'crystal' | 'fire' | 'glass';
/** A lamp of a module's own frame: where, its kind, and (a crystal's) how bright it glows, 0 to 1. */
export interface ModuleLight {
  readonly at: Point;
  readonly kind: LightKind;
  readonly glow: number;
}

/** The materials that give light, by their kind. */
const KINDS: Readonly<Record<string, LightKind>> = { crystal: 'crystal', glow: 'fire', glass: 'glass' };
/** How wide a cell of the module's frame is gathered into one lamp, metres: a row of candles is one light. */
export const LIGHT_CELL_M = 3;

/** The lamps of a module's groups, each a material and its mesh: one for every cell its lit vertices fall in, at
 *  their middle, a crystal's glowing as its vertices do on the whole. */
export function lightsOf(
  groups: readonly { readonly material: string; readonly positions: Float32Array; readonly glows: Uint8Array }[],
  parts: readonly (readonly number[])[] = [],
): ModuleLight[] {
  type Gathered = { kind: LightKind; sum: [number, number, number]; glow: number; count: number };
  const cells = new Map<string, Gathered>();
  for (const { material, positions, glows } of groups) {
    const kind = KINDS[material];
    if (!kind) continue;
    for (let vertex = 0; vertex < positions.length / 3; vertex++) {
      const [x, y, z] = [positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0];
      const key = `${kind}:${Math.floor(x / LIGHT_CELL_M)}:${Math.floor(y / LIGHT_CELL_M)}:${Math.floor(z / LIGHT_CELL_M)}`;
      const cell = cells.get(key) ?? { kind, sum: [0, 0, 0], glow: 0, count: 0 };
      cells.set(key, cell);
      [cell.sum[0], cell.sum[1], cell.sum[2]] = [cell.sum[0] + x, cell.sum[1] + y, cell.sum[2] + z];
      cell.glow += (glows[vertex] ?? 0) / 127;
      cell.count += 1;
    }
  }
  const middle = ({ sum, count }: Gathered): Point => [sum[0] / count, sum[1] / count, sum[2] / count];
  // A light lying across a cell's edge is cut in two by the grid: cells of one kind whose middles stand within a cell
  // of each other are one lamp.
  const merged: Gathered[] = [];
  for (const cell of cells.values()) {
    const spot = middle(cell);
    const near = merged.find(
      (one) =>
        one.kind === cell.kind &&
        Math.hypot(...middle(one).map((part, axis) => part - (spot[axis] ?? 0))) < LIGHT_CELL_M,
    );
    if (!near) merged.push({ ...cell, sum: [...cell.sum] });
    else {
      [near.sum[0], near.sum[1], near.sum[2]] = [
        near.sum[0] + cell.sum[0],
        near.sum[1] + cell.sum[1],
        near.sum[2] + cell.sum[2],
      ];
      [near.glow, near.count] = [near.glow + cell.glow, near.count + cell.count];
    }
  }
  return merged.map((light) => ({ at: outOf(parts, middle(light)), kind: light.kind, glow: light.glow / light.count }));
}

/** How far out of a solid's face a lamp moved out of it stands, metres. */
const OUT_M = 0.1;

/** A point moved out of the module's solid parts (boxes: west, north, bottom, east, south, top), each through its
 *  nearest face: crystal grown on a wall's faces gathers to a middle inside the wall, which would light the wall's
 *  every side from within. */
function outOf(parts: readonly (readonly number[])[], from: Point): Point {
  const point: [number, number, number] = [...from];
  for (const part of parts) {
    const inside = [0, 1, 2].every((axis) => point[axis]! > part[axis]! && point[axis]! < part[axis + 3]!);
    if (!inside) continue;
    const ways = [0, 1, 2].flatMap((axis) => [
      { axis, to: part[axis]! - OUT_M, by: point[axis]! - part[axis]! },
      { axis, to: part[axis + 3]! + OUT_M, by: part[axis + 3]! - point[axis]! },
    ]);
    const nearest = ways.reduce((best, way) => (way.by < best.by ? way : best));
    point[nearest.axis] = nearest.to;
  }
  return point;
}

const known = new Map<number, readonly ModuleLight[]>();

/** A module's lamps, worked out once its meshes have come; null before (asked again the next frame). */
export function moduleLights(module: number): readonly ModuleLight[] | null {
  const kept = known.get(module);
  if (kept) return kept;
  const groups = [];
  for (const [group, material] of moduleShape(module).materials.entries()) {
    if (!KINDS[material]) continue;
    const mesh = moduleMesh(module, group);
    if (!mesh) return null;
    groups.push({ material, positions: mesh.positions, glows: mesh.glows });
  }
  const lights = lightsOf(groups, moduleParts(module));
  known.set(module, lights);
  return lights;
}
