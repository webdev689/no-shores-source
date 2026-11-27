// Solids gathered into one forged model's mesh, for what the city places by instance (its crystals, its lamp posts).
import { emptyMesh, type MeshData } from './mesh.ts';
import type { Solid } from './plan.ts';
import { meshSolid } from './solidMesh.ts';

/** Solids standing at the origin, each in its layer, as one forged model's mesh: its x right, y up and z forward
 *  (the solids' east, up and north), so it is placed by instance as a forged model is. */
export function solidModel(parts: readonly { readonly solid: Solid; readonly layer: number }[]): MeshData {
  const mesh = emptyMesh();
  for (const { solid, layer } of parts) meshSolid(solid, [0, 0], { layer, width: 64, height: 64 }, mesh);
  for (const values of [mesh.positions, mesh.normals])
    for (let first = 0; first < values.length; first += 3) {
      const [south, up] = [values[first + 1], values[first + 2]];
      values[first + 1] = up;
      values[first + 2] = -south;
    }
  return mesh;
}
