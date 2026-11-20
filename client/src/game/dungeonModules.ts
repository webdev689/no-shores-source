// A style's dungeon pieces, built in Blender (tools/dungeon), read from its pack and laid into a dungeon's mesh. Every
// piece is in the dungeon's own frame: x east, y south, z up, metres. A placement turns it by whole quarter turns,
// moves it, and may stretch a unit shaft between two heights. Each triangle wears its part's picture, mapped by its
// world position and face normal as the dungeon's own faces are, so a turned or stretched piece never smears.
import kits from '../../../content/dungeon/kits.json' with { type: 'json' };
import manifest from '../../../content/dungeon/modules.json' with { type: 'json' };
import { MATERIALS } from '../city/pictures.ts';
import type { MeshBuilder, Point } from '../models/model.ts';
import { cross, dot, minus } from '../models/vector.ts';
import { type Climate, DRESSING_ARCHIVE } from '../textures/climate.ts';
import type { StyleKey } from './dungeonLayout.ts';
import { COLOUR, IRON, ROLE } from './dungeonMesh.ts';
import { TILE_M } from './dungeonUv.ts';

/** The parts a piece wears, by their number in its pack. */
export const PARTS: readonly string[] = kits.parts;

/** Metres one picture spans on a part: the dungeon's 3.2 m but where the thing is small, so a rope's strands, a
 *  cloth's weave, a skull, a rune and hammered brass come out their own size. */
const FINER_M: Readonly<Record<string, number>> = { bone: 1.6, relief: 1.6, cloth: 1.6, rope: 0.4, brass: 1.6 };
export const PART_TILE_M: readonly number[] = PARTS.map((name) => FINER_M[name] ?? TILE_M);

/** Bytes a vertex: its position (3 × float32, metres), normal (4 × snorm8), UV (2 × float32, metres) and part (4 ×
 *  uint8, the first its number in `PARTS`). */
const VERTEX_BYTES = 28;

export type Turns = 0 | 1 | 2 | 3;
export type Bounds = readonly [number, number, number, number, number, number];

/** One piece: its vertices' positions, normals and parts, and its triangles' corners, counted from its own first
 *  vertex; `bounds` its least and greatest x, y and z. */
export type ModuleMesh = {
  readonly name: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  /** Each vertex's UV in metres as the piece was unwrapped: u along its surface, v up it. */
  readonly uvs: Float32Array;
  readonly parts: Uint8Array;
  readonly indices: Uint32Array;
  readonly bounds: Bounds;
};

/** A style's pieces by name: `<style>.<piece>` for its kit, and each of its landmarks by its `module`. */
export type ModulePack = { readonly style: StyleKey; readonly modules: ReadonlyMap<string, ModuleMesh> };

/** Where a piece is laid. A landmark gives its footprint, W × D metres, and is turned within it, `origin` the turned
 *  footprint's north-west corner; a kit piece is turned about its own origin. `stretch` lays the piece's z 0 to 1
 *  from `from` to `to`, and a point past either end as far past it. */
export type Place = {
  readonly origin: Point;
  readonly turns: Turns;
  readonly footprint?: readonly [number, number];
  readonly stretch?: { readonly from: number; readonly to: number };
};

/** The set and the wall record a cell wears, as `lookOf` gives them. */
type Look = { readonly set: number; readonly wall: number };
type Picture = readonly [number, number];

interface Entry {
  readonly name: string;
  readonly vertexStart: number;
  readonly vertexCount: number;
  readonly indexStart: number;
  readonly indexCount: number;
  readonly bounds: Bounds;
}

const whole = (count: unknown): count is number => Number.isInteger(count) && (count as number) >= 0;

/** A module's entry in a pack's header, checked: whole counts, three corners a triangle, and six bounds. */
function entryOf(raw: unknown): Entry {
  const entry = (raw ?? {}) as Partial<Record<keyof Entry, unknown>>;
  const name = typeof entry.name === 'string' && entry.name ? entry.name : null;
  if (!name) throw new Error('a module in the pack has no name');
  const { vertexStart, vertexCount, indexStart, indexCount, bounds } = entry;
  if (!whole(vertexStart) || !whole(vertexCount) || !whole(indexStart) || !whole(indexCount) || indexCount % 3 !== 0)
    throw new Error(`${name} does not count its vertices and corners in whole numbers, three corners a triangle`);
  if (!Array.isArray(bounds) || bounds.length !== 6 || !bounds.every(Number.isFinite))
    throw new Error(`${name}'s bounds are not six numbers`);
  return { name, vertexStart, vertexCount, indexStart, indexCount, bounds: bounds as unknown as Bounds };
}

/** One module's vertices and corners, from where the pack's vertices and its corners start. */
function moduleOf(data: DataView, entry: Entry, vertices: number, corners: number): ModuleMesh {
  const positions = new Float32Array(entry.vertexCount * 3);
  const normals = new Float32Array(entry.vertexCount * 3);
  const uvs = new Float32Array(entry.vertexCount * 2);
  const parts = new Uint8Array(entry.vertexCount);
  for (let vertex = 0; vertex < entry.vertexCount; vertex++) {
    const offset = vertices + (entry.vertexStart + vertex) * VERTEX_BYTES;
    for (let axis = 0; axis < 3; axis++) {
      positions[vertex * 3 + axis] = data.getFloat32(offset + axis * 4, true);
      normals[vertex * 3 + axis] = Math.max(-1, data.getInt8(offset + 12 + axis) / 127);
    }
    uvs[vertex * 2] = data.getFloat32(offset + 16, true);
    uvs[vertex * 2 + 1] = data.getFloat32(offset + 20, true);
    parts[vertex] = data.getUint8(offset + 24);
    if (parts[vertex] >= PARTS.length) throw new Error(`a vertex of ${entry.name} wears part ${parts[vertex]}`);
  }
  const indices = new Uint32Array(entry.indexCount);
  for (let corner = 0; corner < entry.indexCount; corner++) {
    indices[corner] = data.getUint32(corners + (entry.indexStart + corner) * 4, true);
    if (indices[corner] >= entry.vertexCount) throw new Error(`a corner of ${entry.name} names no vertex of its own`);
  }
  return { name: entry.name, positions, normals, uvs, parts, indices, bounds: entry.bounds };
}

/** Reads a style's pack: its header's length, the header as JSON, then every vertex and every corner. It throws on
 *  a pack this cannot trust whole: another format, other parts, a count that is not whole, a corner outside its
 *  module, a part past `PARTS`, or a length that is not exactly what the header counts. */
export function readModulePack(bytes: ArrayBuffer): ModulePack {
  if (bytes.byteLength < 4) throw new Error('a module pack is too few bytes to hold its header');
  const data = new DataView(bytes);
  const headerLength = data.getUint32(0, true);
  const vertices = 4 + headerLength;
  if (vertices > bytes.byteLength) throw new Error(`a module pack's header of ${headerLength} bytes runs past it`);
  const text = new TextDecoder().decode(new Uint8Array(bytes, 4, headerLength));
  const header = (JSON.parse(text) ?? {}) as Record<string, unknown>;
  if (header.format !== 1) throw new Error(`a module pack of format ${String(header.format)} is not one this reads`);
  const { parts, style } = header;
  if (!Array.isArray(parts) || parts.length !== PARTS.length || parts.some((part, index) => part !== PARTS[index]))
    throw new Error("a module pack's parts are not the kits' parts, in their order");
  if (typeof style !== 'string' || !Object.hasOwn(kits.styles, style))
    throw new Error(`a module pack is for ${String(style)}, a style the kits do not know`);
  if (!Array.isArray(header.modules)) throw new Error('a module pack lists no modules');
  const entries = header.modules.map(entryOf);
  const vertexCount = Math.max(0, ...entries.map((entry) => entry.vertexStart + entry.vertexCount));
  const indexCount = Math.max(0, ...entries.map((entry) => entry.indexStart + entry.indexCount));
  const corners = vertices + vertexCount * VERTEX_BYTES;
  if (bytes.byteLength !== corners + indexCount * 4)
    throw new Error(
      `a module pack of ${vertexCount} vertices and ${indexCount} corners is not ${bytes.byteLength} bytes`,
    );
  const modules = new Map<string, ModuleMesh>();
  for (const entry of entries) {
    if (modules.has(entry.name)) throw new Error(`a module pack holds ${entry.name} twice`);
    modules.set(entry.name, moduleOf(data, entry, vertices, corners));
  }
  return { style: style as StyleKey, modules };
}

/** Where each style's pack is published: `base` and the key under it. */
type Manifest = { readonly base: string; readonly styles: Readonly<Partial<Record<StyleKey, string>>> };

const packs = new Map<string, Promise<ModulePack | null>>();
/** How long a pack may take to come before it is given up, so a stalled fetch never holds the veil up for good. */
const PACK_TIMEOUT_MS = 15000;

async function fetchPack(url: string, style: StyleKey): Promise<ModulePack> {
  const answer = await fetch(url, { signal: AbortSignal.timeout(PACK_TIMEOUT_MS) });
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
  const pack = readModulePack(await answer.arrayBuffer());
  if (pack.style !== style) throw new Error(`${url} holds the ${pack.style} pieces`);
  return pack;
}

/** A style's pack, fetched from where `published` says (the repository's manifest unless a test gives another) and
 *  kept once it comes: none while no pack is published for it, and none, with one warning, if it fails to come in
 *  time or to read, so its dungeons are drawn as they are without one. A failure is not kept: the next ask, the next
 *  dungeon entered, tries again. */
export function loadStylePack(style: StyleKey, published: Manifest = manifest): Promise<ModulePack | null> {
  const key = published.styles[style];
  if (!key) return Promise.resolve(null);
  const url = published.base + key;
  const known = packs.get(url);
  if (known) return known;
  const pack = fetchPack(url, style).catch((error: unknown) => {
    console.warn(`the ${style} dungeon pieces could not be read, so its dungeons are drawn without them:`, error);
    packs.delete(url);
    return null;
  });
  packs.set(url, pack);
  return pack;
}

/** A point or a direction turned about the origin by whole quarter turns, clockwise seen from above: with x east and
 *  y south, a quarter turn takes north to east. */
export function turnAbout([x, y, z]: Point, turns: Turns): Point {
  if (turns === 1) return [-y, x, z];
  if (turns === 2) return [-x, -y, z];
  if (turns === 3) return [y, -x, z];
  return [x, y, z];
}

/** The turns that face a piece modelled with +y out of a north wall out of the wall on `side` of its cell, a side as
 *  `SIDE_STEPS` numbers them (0 east, 1 south, 2 west, 3 north). */
export const wallTurns = (side: number): Turns => ((side + 1) % 4) as Turns;

/** How far a turned footprint W × D moves so its north-west corner is its origin again. */
function footprintShift([width, depth]: readonly [number, number], turns: Turns): readonly [number, number] {
  return (
    [
      [0, 0],
      [depth, 0],
      [width, depth],
      [0, width],
    ] as const
  )[turns];
}

/** A height stretched: 0 to 1 laid from `from` to `to`, and past either end as far past it. */
function stretched(z: number, stretch: Place['stretch']): number {
  if (!stretch) return z;
  if (z < 0) return stretch.from + z;
  if (z > 1) return stretch.to + z - 1;
  return stretch.from + z * (stretch.to - stretch.from);
}

/** How far a triangle's UV (metres) runs for each metre up it, in its own plane: a stretch that lifts a corner moves
 *  its UV that far along the picture, so a stretched piece keeps its picture's scale whichever way it was unwrapped
 *  (grain up a post along u, stones up a shaft along v). A flat face gains nothing. */
export function uvPerZ(positions: Float32Array, uvs: Float32Array, corners: readonly number[]): [number, number] {
  const point = (corner: number, axis: number) => positions[(corners[corner] ?? 0) * 3 + axis] ?? 0;
  const mapped = (corner: number, axis: number) => uvs[(corners[corner] ?? 0) * 2 + axis] ?? 0;
  const first = [0, 1, 2].map((axis) => point(1, axis) - point(0, axis));
  const second = [0, 1, 2].map((axis) => point(2, axis) - point(0, axis));
  const [firstSquared, across, secondSquared] = [dot(first, first), dot(first, second), dot(second, second)];
  const determinant = firstSquared * secondSquared - across * across;
  if (!(Math.abs(determinant) > 1e-12)) return [0, 0];
  // The UV's gradient in the plane is a·first + b·second, its dot with each edge that edge's UV change.
  const along = (axis: number): number => {
    const [one, two] = [mapped(1, axis) - mapped(0, axis), mapped(2, axis) - mapped(0, axis)];
    const onFirst = (one * secondSquared - two * across) / determinant;
    const onSecond = (two * firstSquared - one * across) / determinant;
    return onFirst * (first[2] ?? 0) + onSecond * (second[2] ?? 0);
  };
  return [along(0), along(1)];
}

const vertexPerZ = new WeakMap<ModuleMesh, Float64Array>();

/** Each vertex's `uvPerZ` (u and v, two a vertex): the mean over the triangles that share it. A corner taking each
 *  triangle's own would part from itself, a tear between triangles unwrapped at different slopes. */
function perZOf(module: ModuleMesh): Float64Array {
  const known = vertexPerZ.get(module);
  if (known) return known;
  const sums = new Float64Array(module.uvs.length);
  const counts = new Uint32Array(module.parts.length);
  for (let first = 0; first + 2 < module.indices.length; first += 3) {
    const corners = [module.indices[first], module.indices[first + 1], module.indices[first + 2]];
    const [alongU, alongV] = uvPerZ(module.positions, module.uvs, corners);
    for (const vertex of corners) {
      sums[vertex * 2] += alongU;
      sums[vertex * 2 + 1] += alongV;
      counts[vertex]++;
    }
  }
  sums.forEach((sum, index) => (sums[index] = sum / Math.max(1, counts[index >> 1])));
  vertexPerZ.set(module, sums);
  return sums;
}

/** Lays a piece into `mesh` where `place` says, each triangle in the picture `pictureOf` gives its part, facing the
 *  way the piece's own normals face it, each corner keeping its own normal and its UV in pictures (v runs down a
 *  picture). A stretched corner's UV moves with its height along its triangles' mean `uvPerZ`, and its normal is
 *  turned as the stretch turns its surface. */
export function layModule(
  mesh: MeshBuilder,
  module: ModuleMesh,
  place: Place,
  pictureOf: (part: number) => readonly number[],
): void {
  const [shiftX, shiftY] = place.footprint ? footprintShift(place.footprint, place.turns) : [0, 0];
  const { positions, normals, uvs } = module;
  const perZ = place.stretch ? perZOf(module) : null;
  const scale = place.stretch ? place.stretch.to - place.stretch.from : 1;
  const corner = (vertex: number): Point => {
    const local: Point = [
      positions[vertex * 3],
      positions[vertex * 3 + 1],
      stretched(positions[vertex * 3 + 2], place.stretch),
    ];
    const [x, y, z] = turnAbout(local, place.turns);
    return [x + shiftX + place.origin[0], y + shiftY + place.origin[1], z + place.origin[2]];
  };
  const mapping = (vertex: number): readonly [number, number] => {
    const rise = stretched(positions[vertex * 3 + 2], place.stretch) - positions[vertex * 3 + 2];
    const tile = PART_TILE_M[module.parts[vertex]] ?? TILE_M;
    const [alongU, alongV] = perZ ? [perZ[vertex * 2], perZ[vertex * 2 + 1]] : [0, 0];
    return [(uvs[vertex * 2] + rise * alongU) / tile, -(uvs[vertex * 2 + 1] + rise * alongV) / tile];
  };
  // A height scaled by `scale` scales a normal by its inverse transpose: its z over `scale`. Past either end of the
  // unit the piece is only moved.
  const squashOf = (vertex: number) => {
    const z = positions[vertex * 3 + 2];
    return place.stretch && scale > 0 && z >= 0 && z <= 1 ? 1 / scale : 1;
  };
  for (let first = 0; first + 2 < module.indices.length; first += 3) {
    const vertices = [module.indices[first], module.indices[first + 1], module.indices[first + 2]];
    const corners = vertices.map(corner);
    const across = cross(minus(corners[1], corners[0]), minus(corners[2], corners[0]));
    const area = Math.hypot(across[0], across[1], across[2]);
    // A triangle with no area shows nothing and faces no way.
    if (!(area > 1e-12)) continue;
    const summed = (axis: number) => vertices.reduce((sum, vertex) => sum + normals[vertex * 3 + axis], 0);
    const outward = turnAbout([summed(0), summed(1), summed(2)], place.turns);
    const sign = dot(across, outward) < 0 ? -1 : 1;
    const normal: Point = [(sign * across[0]) / area, (sign * across[1]) / area, (sign * across[2]) / area];
    const kept = vertices.map((vertex): Point => {
      const up = normals[vertex * 3 + 2] * squashOf(vertex);
      const [x, y, z] = turnAbout([normals[vertex * 3], normals[vertex * 3 + 1], up], place.turns);
      const length = Math.hypot(x, y, z);
      return length > 1e-6 ? [x / length, y / length, z / length] : normal;
    });
    mesh.tri(pictureOf(module.parts[vertices[0]]), corners, normal, vertices.map(mapping), kept);
  }
}

// The book turns the dressing set to the island's climate, as it turns the dungeon's own sets.
const dressing = (record: number) => (): Picture => [DRESSING_ARCHIVE, record];

/** Each part's picture, by its name in `PARTS`. */
const PICTURES: Readonly<Record<string, (look: Look, climate: Climate) => Picture>> = {
  stone: (look) => [look.set, look.wall],
  stoneAlt: (look) => [look.set, ROLE.wallAlt],
  floor: (look) => [look.set, ROLE.floor],
  ceiling: (look) => [look.set, ROLE.ceiling],
  trim: (look) => [look.set, ROLE.trim],
  wood: (_look, climate) => [MATERIALS[climate].timber[0], MATERIALS[climate].timber[1]],
  iron: () => IRON,
  bone: dressing(0),
  relief: dressing(1),
  cloth: dressing(2),
  rope: dressing(3),
  ore: dressing(4),
  brass: dressing(5),
  water: () => [COLOUR.water, 0],
  glow: () => [COLOUR.glow, 0],
  ember: () => [COLOUR.ember, 0],
  crystal: () => [COLOUR.crystal, 0],
  fungus: () => [COLOUR.fungus, 0],
  wax: () => [COLOUR.wax, 0],
};

/** The picture a part wears in a cell of look `look` on an island of `climate`: the look's set for its stone, the
 *  climate's timber, the textures' iron, the dressing set in the climate, or a colour the shader draws. */
export function partPicture(part: number, look: Look, climate: Climate): Picture {
  const picture = PICTURES[PARTS[part] ?? ''];
  if (!picture) throw new Error(`part ${part} has no picture`);
  return picture(look, climate);
}
