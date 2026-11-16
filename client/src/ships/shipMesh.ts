import ships from '../../../content/ships/ships.json' with { type: 'json' };

/** Bytes a vertex: its position (3 × float32, metres), normal (4 × snorm8) and colour (4 × unorm8, sRGB). */
export const VERTEX_BYTES = 20;

/** Her waterline as the export measured it: its length and beam, and her draught below it, metres. */
export interface Waterline {
  readonly lengthM: number;
  readonly beamM: number;
  readonly draughtM: number;
}

/** A ship's mesh in her own frame (x to her bow, y to starboard, z up, the origin amidships on her waterline). */
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

/** Reads a mesh file (tools/ships/export_ship.py): its header's length, the header, then vertices and indices. */
export function readShipMesh(bytes: ArrayBuffer): ShipMesh {
  if (bytes.byteLength < 4) throw new Error('a ship mesh is too few bytes to hold its header');
  const headerLength = new DataView(bytes).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 4, headerLength))) as MeshHeader;
  const vertexCount = header.vertices ?? 0;
  const indexCount = header.indices ?? 0;
  const start = 4 + headerLength;
  const end = start + vertexCount * VERTEX_BYTES;
  if (bytes.byteLength !== end + indexCount * 4) {
    throw new Error(
      `a ship mesh of ${vertexCount} vertices and ${indexCount} corners is not ${bytes.byteLength} bytes`,
    );
  }
  const indices = new Uint32Array(bytes.slice(end));
  if (indices.some((index) => index >= vertexCount)) throw new Error('a corner of the ship mesh names no vertex');
  const waterline = header.waterline ?? { length_m: 0, beam_m: 0, draught_m: 0 };
  return {
    name: header.name ?? '',
    vertexCount,
    vertices: bytes.slice(start, end),
    indices,
    waterline: { lengthM: waterline.length_m, beamM: waterline.beam_m, draughtM: waterline.draught_m },
  };
}

/** A published ship's mesh, fetched from R2 by the key the manifest names. */
export async function loadShip(name: string): Promise<ShipMesh> {
  const entry = (ships.ships as Readonly<Record<string, { readonly mesh: string }>>)[name];
  if (!entry) throw new Error(`no ship is published as "${name}"`);
  const answer = await fetch(ships.base + entry.mesh);
  if (!answer.ok) throw new Error(`the ${name}'s mesh did not come (${answer.status})`);
  return readShipMesh(await answer.arrayBuffer());
}
