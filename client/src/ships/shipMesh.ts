import ships from '../../../content/ships/ships.json' with { type: 'json' };
import { contentBytes } from '../contentCache.ts';
import type { SailCorners } from './sails.ts';

/** Bytes a vertex: its position (3 × float32, metres), normal (4 × snorm8), UV (2 × float32, metres) and part (4 ×
 *  uint8, the first its place in `SHIP_PARTS`, the second `GLASS_SHELL` on a stern window's pane, else 0). */
export const VERTEX_BYTES = 28;

/** Its waterline as the export measured it: its length and beam, and its draught below it, metres. */
export interface Waterline {
  readonly lengthM: number;
  readonly beamM: number;
  readonly draughtM: number;
}

/** A ship's mesh in its own frame (x to its bow, y to starboard, z up, the origin amidships on its waterline). */
export interface ShipMesh {
  readonly name: string;
  readonly vertexCount: number;
  readonly vertices: ArrayBuffer;
  readonly indices: Uint32Array<ArrayBuffer>;
  readonly waterline: Waterline;
}

interface MeshHeader {
  readonly name?: string;
  readonly vertices?: number;
  readonly indices?: number;
  readonly waterline?: { readonly length_m: number; readonly beam_m: number; readonly draught_m: number };
}

/** Reads a mesh file (tools/ships/export_ship.py): its header's length, the header, then vertices and indices,
 *  three a face, in the model's own corner order (front faces counter-clockwise on screen). */
export function readShipMesh(bytes: ArrayBuffer): ShipMesh {
  if (bytes.byteLength < 4) throw new Error('a ship mesh is too few bytes to hold its header');
  const headerLength = new DataView(bytes).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 4, headerLength))) as MeshHeader;
  const vertexCount = header.vertices ?? 0;
  const indexCount = header.indices ?? 0;
  if (!Number.isInteger(vertexCount) || !Number.isInteger(indexCount) || vertexCount < 0 || indexCount < 0) {
    throw new Error('a ship mesh counts its vertices and corners in whole numbers');
  }
  const waterline = header.waterline;
  // Its footprint on the water divides by its waterline's size: a mesh without one would spoil every water pixel.
  if (!waterline || !(waterline.length_m > 0) || !(waterline.beam_m > 0) || !(waterline.draught_m >= 0)) {
    throw new Error("a ship mesh's header needs its waterline: its length, beam and draught");
  }
  const start = 4 + headerLength;
  const end = start + vertexCount * VERTEX_BYTES;
  if (bytes.byteLength !== end + indexCount * 4) {
    throw new Error(
      `a ship mesh of ${vertexCount} vertices and ${indexCount} corners is not ${bytes.byteLength} bytes`,
    );
  }
  const indices = new Uint32Array(bytes.slice(end));
  if (indices.some((index) => index >= vertexCount)) throw new Error('a corner of the ship mesh names no vertex');
  return {
    name: header.name ?? '',
    vertexCount,
    vertices: bytes.slice(start, end),
    indices,
    waterline: { lengthM: waterline.length_m, beamM: waterline.beam_m, draughtM: waterline.draught_m },
  };
}

/** A published ship's sails' corners, as its export measured them; none for a ship without sails. */
export function shipSails(name: string): SailCorners[] {
  // The manifest is the export's own, in the repository: its sails are as `SailCorners` says.
  const entry = (ships.ships as unknown as Readonly<Record<string, { readonly sails?: readonly SailCorners[] }>>)[name];
  return [...(entry?.sails ?? [])];
}

/** Where a published ship's lanterns stand in its own frame, metres, as its export found them; none for a ship
 *  without a lantern. */
export function shipLanterns(name: string): [number, number, number][] {
  type Lit = { readonly lanterns?: readonly (readonly [number, number, number])[] };
  const entry = (ships.ships as unknown as Readonly<Record<string, Lit>>)[name];
  return (entry?.lanterns ?? []).map(([x, y, z]) => [x, y, z]);
}

/** A published ship's waterline as its export measured it, known before its mesh comes. */
export function shipWaterline(name: string): Waterline {
  type Measured = {
    readonly waterline?: { readonly length_m: number; readonly beam_m: number; readonly draught_m: number };
  };
  const measured = (ships.ships as unknown as Readonly<Record<string, Measured>>)[name]?.waterline;
  if (!measured) throw new Error(`no ship is published as "${name}"`);
  return { lengthM: measured.length_m, beamM: measured.beam_m, draughtM: measured.draught_m };
}

/** A published ship's mesh, fetched from R2 by the key the manifest names. */
export async function loadShip(name: string): Promise<ShipMesh> {
  const entry = (ships.ships as Readonly<Record<string, { readonly mesh: string }>>)[name];
  if (!entry) throw new Error(`no ship is published as "${name}"`);
  return readShipMesh((await contentBytes(ships.base + entry.mesh)).bytes);
}
