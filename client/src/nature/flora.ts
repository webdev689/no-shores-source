// The baked flora (tools/flora): each form's near mesh and its biome's pictures on R2, named in
// content/nature/flora.json. A biome's plants are drawn only once its meshes and pictures have loaded.
import manifest from '../../../content/nature/flora.json' with { type: 'json' };
import type { Cast } from './kinds.ts';

/** A near mesh's vertex: position (3 floats), normal and leaf share (4 signed bytes), tangent and its bitangent's
 *  sign (4 signed bytes), uv (2 floats), tint halved and ambient occlusion (4 bytes), wind weight and whether the
 *  uv wraps in the form's bark picture (4 bytes). */
export const MESH_VERTEX_BYTES = 36;

/** Where a form's far sprites lie: their layer, the sheet's top (0..1 down the layer), and the bounding sphere the
 *  frames show, its middle from the foot (game frame) and radius, metres at size 1. */
export interface Impostor {
  readonly layer: number;
  readonly top: number;
  readonly centre: readonly [number, number, number];
  readonly radius: number;
}

/** One baked form: its mesh's key, the layer its cards and bark lie in, its bark picture's place there (u, v,
 *  width, height), its height and reach and contact shade at size 1, and its sprites when it is drawn far. */
export interface FloraForm {
  readonly mesh: string;
  readonly triangles: number;
  readonly layer: number;
  readonly bark: readonly [number, number, number, number];
  readonly top: number;
  readonly spread: number;
  /** The contact shade's radius and its leaves' mean height. */
  readonly shade: readonly [number, number];
  readonly leafy: boolean;
  /** Its crown's breadth east to west, metres, and its leaves' colour from above; none when leafless. */
  readonly crown: number;
  readonly canopy?: readonly [number, number, number] | null;
  readonly impostor?: Impostor;
}

export interface FloraBiome {
  readonly layers: readonly { readonly albedo: string; readonly normal: string }[];
  readonly kinds: Readonly<Record<string, readonly FloraForm[]>>;
}

export interface Flora {
  readonly base: string;
  /** A layer's side, pixels, and how many mip levels each picture holds beside it. */
  readonly layer: number;
  readonly mips: number;
  /** The impostor sheet: azimuths across, elevations (degrees) down, a frame `cell` of the layer square. */
  readonly frames: { readonly azimuths: number; readonly elevations: readonly number[]; readonly cell: number };
  readonly biomes: Readonly<Record<string, FloraBiome>>;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const numbers = (value: unknown, count: number) =>
  Array.isArray(value) && value.length === count && value.every(isNumber);

function formProblem(form: unknown): string | null {
  if (typeof form !== 'object' || form === null) return 'not an object';
  const each = form as Record<string, unknown>;
  if (typeof each.mesh !== 'string') return 'no mesh';
  if (!isNumber(each.layer) || !numbers(each.bark, 4) || !numbers(each.shade, 2)) return 'no layer, bark or shade';
  if (!isNumber(each.top) || !isNumber(each.spread)) return 'no size';
  const sprites = each.impostor as Record<string, unknown> | undefined;
  if (sprites && (!isNumber(sprites.layer) || !isNumber(sprites.radius) || !numbers(sprites.centre, 3)))
    return 'a broken impostor';
  return null;
}

/** The manifest, checked: a malformed one is refused whole, so nothing half-read is drawn. */
export function readFlora(json: unknown): Flora {
  const flora = json as Flora;
  if (typeof flora?.base !== 'string' || !isNumber(flora.layer) || !isNumber(flora.mips))
    throw new Error('flora.json: no base, layer or mips');
  if (!isNumber(flora.frames?.azimuths) || !Array.isArray(flora.frames.elevations))
    throw new Error('flora.json: no frames');
  for (const [biome, entry] of Object.entries(flora.biomes ?? {})) {
    if (!Array.isArray(entry.layers) || entry.layers.length === 0) throw new Error(`flora.json: ${biome} no layers`);
    for (const [kind, forms] of Object.entries(entry.kinds ?? {})) {
      for (const form of forms) {
        const problem = formProblem(form);
        if (problem) throw new Error(`flora.json: ${biome} ${kind}: ${problem}`);
      }
    }
  }
  return flora;
}

export const FLORA: Flora = readFlora(manifest);

/** A cast's forms in its order (kind by kind), as baked; empty when the biome or any of its kinds is unbaked. */
export function formsOf(cast: Cast, biome: string, flora: Flora = FLORA): readonly FloraForm[] {
  const entry = flora.biomes[biome];
  if (!entry) return [];
  const forms: FloraForm[] = [];
  for (const kind of cast.kinds) {
    const baked = entry.kinds[kind.name];
    if (!baked || baked.length !== kind.forms) return [];
    forms.push(...baked);
  }
  return forms;
}

/** A near mesh's vertices from its bytes: a little-endian count, then that many vertices. */
export function decodeMesh(bytes: ArrayBuffer): { readonly vertices: ArrayBuffer; readonly count: number } {
  if (bytes.byteLength < 4) throw new Error('a flora mesh with no header');
  const count = new DataView(bytes).getUint32(0, true);
  if (bytes.byteLength !== 4 + count * MESH_VERTEX_BYTES || count % 3 !== 0)
    throw new Error(`a flora mesh of ${bytes.byteLength} bytes cannot hold ${count} vertices`);
  return { vertices: bytes.slice(4), count };
}

/** A biome's meshes (in its cast's order) and pictures, fetched; null if any is missing. */
export interface LoadedFlora {
  readonly forms: readonly FloraForm[];
  readonly meshes: readonly { readonly vertices: ArrayBuffer; readonly count: number }[];
  readonly layers: readonly { readonly albedo: ImageBitmap; readonly normal: ImageBitmap }[];
}

export async function loadFlora(cast: Cast, biome: string, flora: Flora = FLORA): Promise<LoadedFlora | null> {
  const forms = formsOf(cast, biome, flora);
  const entry = flora.biomes[biome];
  if (!entry || forms.length === 0) return null;
  const bytes = async (key: string) => {
    const answer = await fetch(flora.base + key);
    if (!answer.ok) throw new Error(`${key}: ${answer.status}`);
    return answer;
  };
  const picture = async (key: string) =>
    createImageBitmap(await (await bytes(key)).blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const meshes = await Promise.all(forms.map(async (form) => decodeMesh(await (await bytes(form.mesh)).arrayBuffer())));
  const layers = await Promise.all(
    entry.layers.map(async (layer) => ({ albedo: await picture(layer.albedo), normal: await picture(layer.normal) })),
  );
  return { forms, meshes, layers };
}
