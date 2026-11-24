// Handcrafted modules' surfaces (tools/modules), read from R2 as content/modules/modules.json names them, once for
// every city built after: a module's solid is drawn from its group's mesh in its material's picture. A city built
// before they come draws no module; the loaders that build cities wait for them. A Breach's run's are read only for
// the run, and let go after it.
import manifest from '../../../content/modules/modules.json' with { type: 'json' };
import { contentBytes } from '../contentCache.ts';

/** One surface group: positions in the module's frame (x east, y south, z up), normals in 127ths, each vertex's glow
 *  in 127ths (only crystal's is ever more than none), triangles. */
export type ModuleMesh = {
  readonly positions: Float32Array;
  readonly normals: Int8Array;
  readonly glows: Uint8Array;
  readonly triangles: Uint32Array;
};

type Point = readonly [number, number, number];

type Listed = {
  readonly modules: readonly {
    readonly name: string;
    readonly size: readonly number[];
    readonly sockets: readonly { readonly name: string; readonly at: Point; readonly facing?: readonly number[] }[];
    readonly groups: readonly { readonly mesh: string; readonly material: string }[];
    /** Where it opens the land under its foot: its two lips, each a line of points (x, y) along it at the ground. */
    readonly mouth?: readonly (readonly (readonly [number, number])[])[];
    /** Its solid parts, each a box in its own frame: west, north, bottom, east, south, top. */
    readonly parts?: readonly (readonly number[])[];
  }[];
};

const listed = manifest as unknown as Listed;

const meshes = new Map<string, ModuleMesh>();
let loading: Promise<void> | null = null;

/** A module's own height, metres: a solid of it stands stretched up to its own size's. */
export function moduleHeight(module: number): number {
  return listed.modules[module]?.size[2] ?? 1;
}

/** A module's place in the manifest by its name, or -1. */
export function moduleNumber(name: string): number {
  return listed.modules.findIndex((module) => module.name === name);
}

/** A module's size (across x and y, and its height) and the materials of its surface groups, in order. */
export function moduleShape(module: number): { size: readonly number[]; materials: readonly string[] } {
  const found = listed.modules[module];
  return { size: found?.size ?? [1, 1, 1], materials: found?.groups.map((group) => group.material) ?? [] };
}

/** A socket of a module (a chest's hinge) in its own frame, or the middle of its foot where it has none so named. */
export function moduleSocket(module: number, name: string): Point {
  return listed.modules[module]?.sockets.find((socket) => socket.name === name)?.at ?? [0, 0, 0];
}

/** The way a socket of a module faces out in its own frame (x east, y south), or south where it says none. */
export function moduleSocketFacing(module: number, name: string): readonly [number, number] {
  const facing = listed.modules[module]?.sockets.find((socket) => socket.name === name)?.facing;
  return [facing?.[0] ?? 0, facing?.[1] ?? 1];
}

/** A module's solid parts, each a box in its own frame (x east, y south, z up): west, north, bottom, east, south,
 *  top. */
export function moduleParts(module: number): readonly (readonly number[])[] {
  return listed.modules[module]?.parts ?? [];
}

/** The two lips of a module's mouth, where it opens the land, or none. */
export function moduleMouth(module: number): readonly (readonly (readonly [number, number])[])[] | undefined {
  return listed.modules[module]?.mouth;
}

/** A group's mesh, once loaded. */
export function moduleMesh(module: number, group: number): ModuleMesh | undefined {
  return meshes.get(`${module}:${group}`);
}

/** A mesh file's surface: a vertex and a triangle count, 16 bytes a vertex (3 floats, 3 signed bytes and a glow),
 *  then three u32 a triangle, all little-endian. */
export function readModuleMesh(bytes: ArrayBuffer): ModuleMesh {
  const view = new DataView(bytes);
  const [vertices, count] = [view.getUint32(0, true), view.getUint32(4, true)];
  if (bytes.byteLength !== 8 + vertices * 16 + count * 12) throw new Error('a module mesh of the wrong length');
  const positions = new Float32Array(vertices * 3);
  const normals = new Int8Array(vertices * 3);
  const glows = new Uint8Array(vertices);
  for (let vertex = 0; vertex < vertices; vertex++) {
    const start = 8 + vertex * 16;
    for (let axis = 0; axis < 3; axis++) {
      positions[vertex * 3 + axis] = view.getFloat32(start + axis * 4, true);
      normals[vertex * 3 + axis] = view.getInt8(start + 12 + axis);
    }
    glows[vertex] = Math.max(0, view.getInt8(start + 15));
  }
  const triangles = new Uint32Array(count * 3);
  for (let corner = 0; corner < count * 3; corner++) {
    triangles[corner] = view.getUint32(8 + vertices * 16 + corner * 4, true);
  }
  return { positions, normals, glows, triangles };
}

/** Whether a module is a Breach's run's own (`breach-*`, but the gate and the seal its doorway stands sealed by, which
 *  stand in its patrol zone): its meshes are fetched only for the run, so the open world never carries the raid's. */
export const ofRun = (name: string): boolean =>
  name.startsWith('breach-') && name !== 'breach-gate' && name !== 'breach-seal';

/** Fetches the meshes of each module `wanted` names; a group that cannot be read is left undrawn, and said so. */
function fetchMeshes(wanted: (name: string) => boolean): Promise<void> {
  return Promise.all(
    listed.modules.flatMap((module, number) =>
      wanted(module.name)
        ? module.groups.map(async (group, index) => {
            try {
              const bytes = (await contentBytes(`${manifest.base}${group.mesh}`)).bytes;
              meshes.set(`${number}:${index}`, readModuleMesh(bytes));
            } catch (error) {
              console.error(`module ${number}'s ${group.mesh} cannot be drawn:`, error);
            }
          })
        : [],
    ),
  ).then(() => undefined);
}

/** The crystal a Breach's doorways stand sealed by: drawn only at its gate's zone and in its run, so fetched there. */
const SEAL = 'breach-seal';

/** Whether a module's meshes are fetched with the open world: every one but a Breach's run's and its seal. */
export const inOpenWorld = (name: string): boolean => !ofRun(name) && name !== SEAL;

/** Fetches every module's meshes the open world draws, once. */
export function loadModules(): Promise<void> {
  loading ??= fetchMeshes(inOpenWorld);
  return loading;
}

let sealLoading: Promise<void> | null = null;

/** Fetches a Breach's seal's meshes once, as its gate's zone or its run is opened; kept once fetched. */
export function loadSealModule(): Promise<void> {
  sealLoading ??= fetchMeshes((name) => name === SEAL);
  return sealLoading;
}

let runLoading: Promise<void> | null = null;

/** Fetches a Breach's run's modules' meshes, as the player goes into it, once until they are let go. */
export function loadRunModules(): Promise<void> {
  runLoading ??= fetchMeshes(ofRun);
  return runLoading;
}

/** Lets go of a Breach's run's modules' meshes, once the player is out of it. */
export function releaseRunModules(): void {
  if (!runLoading) return;
  runLoading = null;
  listed.modules.forEach((module, number) => {
    if (ofRun(module.name)) module.groups.forEach((_group, index) => meshes.delete(`${number}:${index}`));
  });
}
