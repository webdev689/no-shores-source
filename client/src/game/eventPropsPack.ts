// A module's surfaces packed as the props' drawer (eventPropsDraw.ts) takes them: one vertex list, each vertex its
// material, one triangle list with the crystal's last, and the lips of a module that opens the land.
import { moduleMesh, moduleMouth, moduleShape } from '../city/modules.ts';

/** The materials a module's surface may wear, numbered as the shader knows them: tools/modules/kit.py MATERIALS, in
 *  its order (a test reads it). */
export const MATERIALS = [
  'stone',
  'trim',
  'rubble',
  'chalk',
  'turf',
  'timber',
  'canvas',
  'iron',
  'plaster',
  'roof',
  'gold',
  'crystal',
  'bone',
  'glow',
  'linen',
  'crimson',
  'verdant',
  'black',
  'straw',
  'stormcaller_blue',
  'lamplighter_gold',
  'veiled_dusk',
  'paving',
  'lawn',
  'water',
  'glass',
] as const;
export type Material = (typeof MATERIALS)[number];

/** A vertex: its position (3 floats), its normal and glow (4 signed bytes) and its material (4 bytes, the first). */
export const STRIDE = 20;

/** A module's groups packed into one vertex list (each vertex its material) and one triangle list, the crystal's
 *  triangles last, from `crystalFrom`, so the light pass draws them alone. */
export function packModule(
  module: number,
): { vertices: ArrayBuffer; indices: Uint32Array; crystalFrom: number } | null {
  const { materials } = moduleShape(module);
  const meshes = materials.map((_material, group) => moduleMesh(module, group));
  if (meshes.length === 0 || meshes.some((mesh) => !mesh)) return null;
  const total = meshes.reduce((sum, mesh) => sum + (mesh?.positions.length ?? 0) / 3, 0);
  const vertices = new ArrayBuffer(total * STRIDE);
  const view = new DataView(vertices);
  const [plain, crystal]: number[][] = [[], []];
  let base = 0;
  meshes.forEach((mesh, group) => {
    if (!mesh) return;
    const material = Math.max(0, MATERIALS.indexOf(materials[group] as Material));
    const count = mesh.positions.length / 3;
    for (let vertex = 0; vertex < count; vertex++) {
      const start = (base + vertex) * STRIDE;
      for (let axis = 0; axis < 3; axis++) {
        view.setFloat32(start + axis * 4, mesh.positions[vertex * 3 + axis] ?? 0, true);
        view.setInt8(start + 12 + axis, mesh.normals[vertex * 3 + axis] ?? 0);
      }
      view.setInt8(start + 15, mesh.glows[vertex] ?? 0);
      view.setUint8(start + 16, material);
    }
    const into = materials[group] === 'crystal' ? crystal : plain;
    for (const index of mesh.triangles) into.push(index + base);
    base += count;
  });
  return { vertices, indices: Uint32Array.from([...plain, ...crystal]), crystalFrom: plain.length };
}

/** A module's lips as the shader reads them, station by station along its x: (x, the lower lip's y, the higher's, 0). */
export function packLips(module: number): Float32Array | null {
  const [north, south] = moduleMouth(module) ?? [];
  if (!north || !south || north.length !== south.length || north.length < 2) return null;
  const stations = north
    .map((point, k) => {
      const [x, a] = point;
      const b = south[k]?.[1] ?? a;
      return [x, Math.min(a, b), Math.max(a, b), 0];
    })
    .sort((one, other) => (one[0] ?? 0) - (other[0] ?? 0));
  return Float32Array.from(stations.flat());
}
