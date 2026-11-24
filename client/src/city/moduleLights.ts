// Where a module gives light, read from its own surfaces: its crystal, its fire (the `glow` material: candles, a
// hearth, a lantern) and its stained glass, each gathered into a lamp a few metres across, at the middle of what of it
// lies there. A Breach's run is lit by these (eventProps.ts `propLamps`), so a module rebuilt lights where it now
// burns, with no list of lamps kept beside it.
import { moduleMesh, moduleShape } from './modules.ts';

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
): ModuleLight[] {
  const cells = new Map<string, { kind: LightKind; sum: [number, number, number]; glow: number; count: number }>();
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
  return [...cells.values()].map(({ kind, sum, glow, count }) => ({
    at: [sum[0] / count, sum[1] / count, sum[2] / count],
    kind,
    glow: glow / count,
  }));
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
  const lights = lightsOf(groups);
  known.set(module, lights);
  return lights;
}
