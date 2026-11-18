import { LOD_BAND, THIN_FROM_M, THIN_TO_M } from './field.ts';
import { FLORA, type FloraForm, type LoadedFlora, MESH_VERTEX_BYTES } from './flora.ts';
import type { Cast } from './kinds.ts';

/** Each form's detail has its own block of drawing terms, read at a dynamic offset this far apart. */
export const FORM_BLOCK_BYTES = 256;
/** The floats of a block the shader reads (natureShader.ts Form). */
export const FORM_FLOATS = 28;
/** A near mesh with no far one is drawn to its reach: its range is past anything drawn. */
const NO_FAR_M = 1e9;
/** A far plant is one quad, two triangles. */
export const QUAD_VERTICES = 6;

/** Where one detail lies in the vertex buffer (none for a far quad, made in the shader), its block of terms, and
 *  whether a contact shade is drawn under each instance. */
export interface Part {
  readonly firstVertex: number;
  readonly vertexCount: number;
  readonly far: boolean;
  readonly block: number;
  readonly shaded: boolean;
}

/** A biome's forms for the GPU: every near mesh in one vertex buffer, each form's near and far part (by form), and
 *  the blocks of terms the shader reads for each. */
export interface FormBuffers {
  readonly vertices: ArrayBuffer;
  readonly parts: readonly (readonly [Part, Part | null])[];
  readonly blocks: Float32Array;
}

/** A form's terms for one detail: its ranges, crossfade band and detail; its thinning and sway; its contact shade;
 *  its pictures' layer and bark; its sprites' sheet, bounding sphere and the box of the frame they fill. */
function blockOf(
  form: FloraForm,
  kind: Cast['kinds'][number],
  keepAtReach: number,
  far: boolean,
  tall: boolean,
): number[] {
  const thins = kind.reachM > THIN_FROM_M;
  const nearM = form.impostor ? kind.nearM : NO_FAR_M;
  const darkness = !form.leafy ? 0.26 : tall ? 0.34 : 0.24;
  // A far block keeps the crown's height (a widened far tree sinks by it) but draws no contact shade of its own.
  const shade = form.impostor ? [...form.shade, far ? 0 : darkness] : [0, 0, 0];
  const sprites = form.impostor;
  return [
    nearM,
    kind.reachM,
    nearM * LOD_BAND,
    far ? 1 : 0,
    thins ? THIN_FROM_M : kind.reachM - 1,
    thins ? keepAtReach : 1,
    kind.swayM,
    thins ? Math.min(kind.reachM, THIN_TO_M) : kind.reachM,
    ...shade,
    0,
    form.layer,
    ...form.bark.slice(0, 3),
    sprites?.layer ?? 0,
    sprites?.top ?? 0,
    sprites?.radius ?? 0,
    FLORA.frames.cell,
    ...(sprites?.centre ?? [0, 0, 0]),
    0,
    ...(sprites?.box ?? [0, 0, 1, 1]),
  ];
}

/** Packs a biome's loaded meshes and the terms each detail is drawn by. Only plants drawn far cast a contact shade;
 *  grass, ferns and reeds are too low. */
export function formBuffers(cast: Cast, loaded: LoadedFlora): FormBuffers {
  const kinds = cast.kinds.flatMap((kind) => Array.from({ length: kind.forms }, () => kind));
  const total = loaded.meshes.reduce((sum, mesh) => sum + mesh.count, 0);
  const bytes = new Uint8Array(total * MESH_VERTEX_BYTES);
  const floatsPerBlock = FORM_BLOCK_BYTES / 4;
  const blocks = new Float32Array(loaded.forms.length * 2 * floatsPerBlock);
  let next = 0;
  const parts = loaded.forms.map((form, index) => {
    const kind = kinds[index];
    const mesh = loaded.meshes[index];
    if (!kind || !mesh) throw new Error(`flora form ${index} has no kind or mesh`);
    bytes.set(new Uint8Array(mesh.vertices), next * MESH_VERTEX_BYTES);
    const place = (far: boolean): Part => {
      const block = index * 2 + (far ? 1 : 0);
      blocks.set(blockOf(form, kind, cast.keepAtReach, far, kind.layer === 'tall'), block * floatsPerBlock);
      const shaded = !!form.impostor && !far;
      return far
        ? { firstVertex: 0, vertexCount: QUAD_VERTICES, far, block, shaded }
        : { firstVertex: next, vertexCount: mesh.count, far, block, shaded };
    };
    const near = place(false);
    next += mesh.count;
    return [near, form.impostor ? place(true) : null] as const;
  });
  return { vertices: bytes.buffer, parts, blocks };
}
