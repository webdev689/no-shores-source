import { LOD_BAND, THIN_FROM_M } from './field.ts';
import type { Cast } from './kinds.ts';
import { type Mesh, VERTEX_FLOATS } from './shapes.ts';

/** A vertex on the GPU: its position (three floats), normal and leaf (four signed bytes), colour and sway (four
 *  bytes). */
export const VERTEX_BYTES = 20;
/** Each form's detail has its own block of drawing terms, read at a dynamic offset this far apart. */
export const FORM_BLOCK_BYTES = 256;
/** A near mesh with no far one is drawn to its reach: its range is past anything drawn. */
const NO_FAR_M = 1e9;

/** Where one mesh lies in the vertex buffer, whether it is drawn two-sided, and its block of terms. */
export interface Part {
  readonly firstVertex: number;
  readonly vertexCount: number;
  readonly twoSided: boolean;
  readonly block: number;
}

/** A cast's meshes for the GPU: every form's near and far mesh in one vertex buffer, each part's place in it (by
 *  form, near then far), and the blocks of terms the shader reads for each. */
export interface FormBuffers {
  readonly vertices: ArrayBuffer;
  readonly parts: readonly (readonly [Part, Part | null])[];
  readonly blocks: Float32Array;
}

function packMesh(mesh: Mesh, bytes: DataView, firstVertex: number): void {
  const { vertices } = mesh;
  const count = vertices.length / VERTEX_FLOATS;
  for (let vertex = 0; vertex < count; vertex++) {
    const [from, to] = [vertex * VERTEX_FLOATS, (firstVertex + vertex) * VERTEX_BYTES];
    for (let axis = 0; axis < 3; axis++) bytes.setFloat32(to + axis * 4, vertices[from + axis] ?? 0, true);
    const signed = (value: number) => Math.max(-127, Math.min(127, Math.round(value * 127)));
    const unsigned = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
    for (let axis = 0; axis < 3; axis++) bytes.setInt8(to + 12 + axis, signed(vertices[from + 3 + axis] ?? 0));
    bytes.setInt8(to + 15, signed(vertices[from + 9] ?? 0));
    for (let channel = 0; channel < 3; channel++)
      bytes.setUint8(to + 16 + channel, unsigned(vertices[from + 6 + channel] ?? 0));
    bytes.setUint8(to + 19, unsigned(vertices[from + 10] ?? 0));
  }
}

/** Packs a cast's meshes and the terms each is drawn by: its ranges, crossfade band and detail, its thinning and its
 *  sway. */
export function formBuffers(cast: Cast): FormBuffers {
  const meshes = cast.kinds.flatMap((kind) => kind.plants.map((plant) => ({ kind, plant })));
  const total = meshes.reduce(
    (sum, { plant }) => sum + (plant.near.vertices.length + (plant.far?.vertices.length ?? 0)) / VERTEX_FLOATS,
    0,
  );
  const vertices = new ArrayBuffer(total * VERTEX_BYTES);
  const bytes = new DataView(vertices);
  const floatsPerBlock = FORM_BLOCK_BYTES / 4;
  const blocks = new Float32Array(meshes.length * 2 * floatsPerBlock);
  let next = 0;
  const parts = meshes.map(({ kind, plant }, form) => {
    const place = (mesh: Mesh, far: boolean): Part => {
      const vertexCount = mesh.vertices.length / VERTEX_FLOATS;
      packMesh(mesh, bytes, next);
      const block = form * 2 + (far ? 1 : 0);
      const thins = kind.reachM > THIN_FROM_M;
      const nearM = plant.far ? kind.nearM : NO_FAR_M;
      blocks.set(
        [
          nearM,
          kind.reachM,
          nearM * LOD_BAND,
          far ? 1 : 0,
          thins ? THIN_FROM_M : kind.reachM - 1,
          thins ? cast.keepAtReach : 1,
          kind.swayM,
          0,
        ],
        block * floatsPerBlock,
      );
      const part = { firstVertex: next, vertexCount, twoSided: !mesh.closed, block };
      next += vertexCount;
      return part;
    };
    return [place(plant.near, false), plant.far ? place(plant.far, true) : null] as const;
  });
  return { vertices, parts, blocks };
}
