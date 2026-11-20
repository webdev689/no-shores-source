// Packs written as the exporter writes them, for the tests: any modules a test gives, and a style's whole kit and
// its landmarks as boxes of the sizes the kits' envelopes allow, each box wearing every part in turn.
import kits from '../../../content/dungeon/kits.json' with { type: 'json' };
import table from '../../../content/dungeon/landmarks.json' with { type: 'json' };
import type { StyleKey } from './dungeonLayout.ts';
import { type ModulePack, PARTS, readModulePack } from './dungeonModules.ts';

/** A vertex as a test writes it: position, normal and part. */
export type Vertex = readonly [x: number, y: number, z: number, nx: number, ny: number, nz: number, part: number];
export type Written = {
  readonly name: string;
  readonly vertices: readonly Vertex[];
  readonly indices: readonly number[];
};
type Bounds = readonly [number, number, number, number, number, number];

/** A pack in the format the exporter writes: the header's length, the header, 28-byte vertices, then the corners,
 *  each module's counted from its own first vertex. `header` overrides the header's fields; `extra` bytes trail. */
export function packOf(modules: readonly Written[], header: Record<string, unknown> = {}, extra = 0): ArrayBuffer {
  let vertexStart = 0;
  let indexStart = 0;
  const entries = modules.map(({ name, vertices, indices }) => {
    const axis = (index: number) => vertices.map((vertex) => vertex[index]);
    const bounds = [0, 1, 2].map((index) => Math.min(...axis(index)));
    bounds.push(...[0, 1, 2].map((index) => Math.max(...axis(index))));
    const entry = { name, vertexStart, vertexCount: vertices.length, indexStart, indexCount: indices.length, bounds };
    vertexStart += vertices.length;
    indexStart += indices.length;
    return entry;
  });
  const json = new TextEncoder().encode(
    JSON.stringify({ format: 1, style: 'crypt', parts: PARTS, modules: entries, ...header }),
  );
  const bytes = new ArrayBuffer(4 + json.length + vertexStart * 28 + indexStart * 4 + extra);
  const data = new DataView(bytes);
  data.setUint32(0, json.length, true);
  new Uint8Array(bytes, 4).set(json);
  let offset = 4 + json.length;
  for (const [x, y, z, east, south, up, part] of modules.flatMap((module) => module.vertices)) {
    [x, y, z].forEach((value, axis) => data.setFloat32(offset + axis * 4, value, true));
    [east, south, up].forEach((value, axis) => data.setInt8(offset + 12 + axis, Math.round(value * 127)));
    data.setFloat32(offset + 16, x, true);
    data.setFloat32(offset + 20, z, true);
    data.setUint8(offset + 24, part);
    offset += 28;
  }
  for (const index of modules.flatMap((module) => module.indices)) {
    data.setUint32(offset, index, true);
    offset += 4;
  }
  return bytes;
}

/** A box filling `bounds`, its six faces wearing the parts from `part` on, each face's own normal at its corners. */
export function boxModule(name: string, [west, north, low, east, south, high]: Bounds, part = 0): Written {
  const faces: readonly (readonly [readonly number[], readonly (readonly number[])[]])[] = [
    [
      [0, 0, 1],
      [
        [west, north, high],
        [east, north, high],
        [east, south, high],
        [west, south, high],
      ],
    ],
    [
      [0, 0, -1],
      [
        [west, north, low],
        [east, north, low],
        [east, south, low],
        [west, south, low],
      ],
    ],
    [
      [0, -1, 0],
      [
        [west, north, low],
        [east, north, low],
        [east, north, high],
        [west, north, high],
      ],
    ],
    [
      [0, 1, 0],
      [
        [west, south, low],
        [east, south, low],
        [east, south, high],
        [west, south, high],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [west, north, low],
        [west, south, low],
        [west, south, high],
        [west, north, high],
      ],
    ],
    [
      [1, 0, 0],
      [
        [east, north, low],
        [east, south, low],
        [east, south, high],
        [east, north, high],
      ],
    ],
  ];
  const vertices = faces.flatMap(([normal, corners], face) =>
    corners.map((corner): Vertex => {
      const [x = 0, y = 0, z = 0] = corner;
      const [east = 0, south = 0, up = 0] = normal;
      return [x, y, z, east, south, up, (part + face) % PARTS.length];
    }),
  );
  const indices = faces.flatMap((_face, face) => [0, 1, 2, 0, 2, 3].map((corner) => face * 4 + corner));
  return { name, vertices, indices };
}

/** Each kit piece's box at the most its envelope allows (kits.json's `pieces`), a hanging one as deep as the style's
 *  least ceiling lets it; `hang` overrides how deep its ceiling pieces hang. */
function kitBounds(style: StyleKey, hang?: number): Readonly<Record<string, Bounds>> {
  const deepest = hang ?? kits.styles[style].leastCeiling - 2.4;
  const ceiling: Bounds = ['cells', 'mines'].includes(style)
    ? [-1.6, -0.15, -Math.min(deepest, 0.4), 1.6, 0.15, 0]
    : [-0.4, -0.4, -deepest, 0.4, 0.4, 0];
  const floor: Bounds = ['halls', 'mines'].includes(style)
    ? [-1.6, -0.7, 0, 1.6, 0.7, 0.03]
    : [-1.6, -1.6, 0, 1.6, 1.6, 0.05];
  return {
    'door.a': [-1.6, -0.12, 0, 1.6, 0.42, 3.4],
    'door.b': [-1.6, -0.12, 0, 1.6, 0.42, 3.2],
    'pillar.base': [-0.55, -0.55, 0, 0.55, 0.55, 0.5],
    'pillar.shaft': [-0.35, -0.35, 0, 0.35, 0.35, 1],
    'pillar.capital': [-0.7, -0.7, 0, 0.7, 0.7, 0.6],
    'wall.base': [-0.8, 0, 0, 0.8, 0.3, 0.5],
    'wall.shaft': [-0.6, 0, 0, 0.6, 0.25, 1],
    'wall.cap': [-0.8, 0, 0, 0.8, 0.6, 0.7],
    'feature.a': [-0.8, 0, 0, 0.8, 0.3, 3],
    'feature.b': [-0.6, 0, 0, 0.6, 0.2, 2],
    'ceiling.a': ceiling,
    'ceiling.b': [ceiling[0], ceiling[1], ceiling[2] / 2, ceiling[3], ceiling[4], 0],
    'ceiling.c': [ceiling[0], ceiling[1], ceiling[2] / 4, ceiling[3], ceiling[4], 0],
    'floor.a': floor,
    'floor.b': floor,
    sconce: [-0.2, 0, -0.3, 0.2, 0.42, 0.1],
    portal: [-1.3, 0, 0, 1.3, 0.3, 3.1],
    exit: [-1.3, 0, 0, 1.3, 0.3, 3.1],
  };
}

/** A style's whole pack: every kit piece and every one of its landmarks, each a box, the landmark's over its whole
 *  footprint and as high as its tallest solid. */
export function fullPack(style: StyleKey, hang?: number): ModulePack {
  const bounds = kitBounds(style, hang);
  const pieces = kits.pieces.map((piece, index) =>
    boxModule(`${style}.${piece}`, bounds[piece] ?? [0, 0, 0, 1, 1, 1], index),
  );
  const landmarks = table.landmarks
    .filter((landmark) => landmark.style === style)
    .map((landmark, index) => {
      const top = Math.max(...landmark.solids.map((solid) => solid[4] ?? 0));
      const [width = 1, depth = 1] = landmark.cells.map((cells) => cells * 3.2);
      return boxModule(landmark.module, [0, 0, -0.2, width, depth, top], index);
    });
  return readModulePack(packOf([...pieces, ...landmarks], { style }));
}

/** Every style's whole pack. */
export const FULL_PACKS: ReadonlyMap<StyleKey, ModulePack> = new Map(
  (Object.keys(kits.styles) as StyleKey[]).map((style) => [style, fullPack(style)]),
);
