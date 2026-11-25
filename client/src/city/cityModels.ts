// The forged models a city's blocks stand, each built once and laid into one buffer the near cells instance from:
// a vertex is its position, normal and UV in the model's frame and its picture's layer in the city's array.
import { buildingModel, type WindowFrameOf } from '../models/buildings.ts';
import type { ForgedModel } from '../models/model.ts';
import { propModel } from '../models/props.ts';
import type { BuildingTable, PropTable } from '../models/tables.ts';
import type { MeshData } from './mesh.ts';
import { CLEAR_GLASS } from './pictures.ts';
import { finished } from './steps.ts';

/** Numbers a model vertex takes: position, normal, UV, and its layer as a whole number. */
export const MODEL_FLOATS = 9;

/** Which forge stands a placed id: a building's (`open:` with its doorways open, walked into), or the Prop Forge for
 *  a prop or a building row that names one. */
export type ModelKey = `building:${number}` | `open:${number}` | `prop:${number}`;

export function modelKeyOf(
  tables: { readonly buildings: BuildingTable },
  id: number,
  placedAs: 'building' | 'prop',
  open = false,
): ModelKey {
  if (placedAs !== 'building' || !tables.buildings[id]) return `prop:${id}`;
  return open ? `open:${id}` : `building:${id}`;
}

export function forgedModel(
  tables: { readonly buildings: BuildingTable; readonly props: PropTable },
  key: ModelKey,
  frameOf?: WindowFrameOf,
): ForgedModel | null {
  const [kind, id] = key.split(':');
  if (kind === 'prop') return propModel(tables.props, Number(id));
  return buildingModel(tables.buildings, Number(id), { open: kind === 'open', frameOf });
}

/** Where each model sits in the shared buffers, and whether any of it is an open building's clear window, whose
 *  shadow lets the sun through its panes as the eye sees through them. */
export type ModelEntry = {
  readonly firstIndex: number;
  readonly indexCount: number;
  readonly baseVertex: number;
  readonly clear?: boolean;
};

export type ModelBuffers = {
  readonly vertices: ArrayBuffer;
  readonly indices: Uint32Array;
  readonly entries: readonly ModelEntry[];
  readonly triangles: readonly number[];
};

/** Lays every model into one vertex and one index buffer, each vertex wearing its part's layer, then `meshes` (each in
 *  a model's frame, every vertex with its own layer) after them, as models too. */
export function modelBuffers(
  models: readonly (ForgedModel | null)[],
  layerOf: (archive: number, record: number) => number,
  meshes: readonly MeshData[] = [],
): ModelBuffers {
  return finished(modelBufferSteps(models, layerOf, meshes));
}

/** The buffers as `modelBuffers` lays them, a model or a mesh a step (`steps.ts`). */
export function* modelBufferSteps(
  models: readonly (ForgedModel | null)[],
  layerOf: (archive: number, record: number) => number,
  meshes: readonly MeshData[] = [],
): Generator<void, ModelBuffers> {
  const vertexCount =
    models.reduce((sum, model) => sum + (model ? model.positions.length / 3 : 0), 0) +
    meshes.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0);
  const indexCount =
    models.reduce((sum, model) => sum + (model ? model.indices.length : 0), 0) +
    meshes.reduce((sum, mesh) => sum + mesh.indices.length, 0);
  const vertices = new ArrayBuffer(vertexCount * MODEL_FLOATS * 4);
  const [floats, whole] = [new Float32Array(vertices), new Uint32Array(vertices)];
  const indices = new Uint32Array(indexCount);
  const entries: ModelEntry[] = [];
  const triangles: number[] = [];
  let [vertexAt, indexAt] = [0, 0];
  for (const model of models) {
    if (!model) {
      entries.push({ firstIndex: indexAt, indexCount: 0, baseVertex: vertexAt });
      triangles.push(0);
      continue;
    }
    const count = model.positions.length / 3;
    for (let k = 0; k < count; k++) {
      const slot = (vertexAt + k) * MODEL_FLOATS;
      floats.set(model.positions.subarray(k * 3, k * 3 + 3), slot);
      floats.set(model.normals.subarray(k * 3, k * 3 + 3), slot + 3);
      floats.set(model.uvs.subarray(k * 2, k * 2 + 2), slot + 6);
    }
    for (const part of model.parts) {
      const layer = layerOf(part.archive, part.record) | (part.clear ? CLEAR_GLASS : 0);
      for (let k = part.start; k < part.start + part.count; k++)
        whole[(vertexAt + model.indices[k]) * MODEL_FLOATS + 8] = layer;
    }
    indices.set(model.indices, indexAt);
    const clear = model.parts.some((part) => part.clear);
    entries.push({ firstIndex: indexAt, indexCount: model.indices.length, baseVertex: vertexAt, clear });
    triangles.push(model.indices.length / 3);
    vertexAt += count;
    indexAt += model.indices.length;
    yield;
  }
  for (const mesh of meshes) {
    const count = mesh.positions.length / 3;
    for (let k = 0; k < count; k++) {
      const slot = (vertexAt + k) * MODEL_FLOATS;
      floats.set(mesh.positions.slice(k * 3, k * 3 + 3), slot);
      floats.set(mesh.normals.slice(k * 3, k * 3 + 3), slot + 3);
      floats.set(mesh.uvs.slice(k * 2, k * 2 + 2), slot + 6);
      whole[slot + 8] = mesh.layers[k] ?? 0;
    }
    indices.set(mesh.indices, indexAt);
    entries.push({ firstIndex: indexAt, indexCount: mesh.indices.length, baseVertex: vertexAt });
    triangles.push(mesh.indices.length / 3);
    vertexAt += count;
    indexAt += mesh.indices.length;
    yield;
  }
  return { vertices, indices, entries, triangles };
}
