// Handcrafted modules' surfaces (tools/modules), read from R2 as content/modules/modules.json names them, once for
// every city built after: a module's solid is drawn from its group's mesh in its material's picture. A city built
// before they come draws no module; the loaders that build cities wait for them. The chests are built in code
// (chestModules.ts) and listed after the manifest's.
import manifest from '../../../content/modules/modules.json' with { type: 'json' };
import { contentBytes } from '../contentCache.ts';
import { chestModules } from './chestModules.ts';

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
    readonly sockets: readonly { readonly name: string; readonly at: Point }[];
    readonly groups: readonly { readonly mesh: string; readonly material: string }[];
    /** Where it opens the land under its foot: its two lips, each a line of points (x, y) along it at the ground. */
    readonly mouth?: readonly (readonly (readonly [number, number])[])[];
    /** Its solid parts, each a box in its own frame: west, north, bottom, east, south, top. */
    readonly parts?: readonly (readonly number[])[];
  }[];
};

const listed = manifest as unknown as Listed;
const built = chestModules();
const modules: Listed['modules'] = [...listed.modules, ...built];

const meshes = new Map<string, ModuleMesh>();
built.forEach((module, nth) =>
  module.meshes.forEach((mesh, group) => meshes.set(`${listed.modules.length + nth}:${group}`, mesh)),
);
/** How many groups' meshes are fetched at once: R2's public address limits how fast it is asked, and a burst of every
 *  group at once can lose its last, the public events'. */
const FETCHES_AT_ONCE = 8;
/** A call this long after an asking that left groups unread asks for them again (ms); sooner, it has that asking's. */
const ASK_AGAIN_MS = 20_000;
/** The last asking for the meshes: when it began (ms), whether it left any unread once over, and its end. */
let asking: { readonly at: number; missed: boolean; done: Promise<void> } | null = null;

/** A module's own height, metres: a solid of it stands stretched up to its own size's. */
export function moduleHeight(module: number): number {
  return modules[module]?.size[2] ?? 1;
}

/** A module's place in the manifest by its name, or -1. */
export function moduleNumber(name: string): number {
  return modules.findIndex((module) => module.name === name);
}

/** A module's size (across x and y, and its height) and the materials of its surface groups, in order. */
export function moduleShape(module: number): { size: readonly number[]; materials: readonly string[] } {
  const found = modules[module];
  return { size: found?.size ?? [1, 1, 1], materials: found?.groups.map((group) => group.material) ?? [] };
}

/** A socket of a module (a chest's hinge) in its own frame, or the middle of its foot where it has none so named. */
export function moduleSocket(module: number, name: string): Point {
  return modules[module]?.sockets.find((socket) => socket.name === name)?.at ?? [0, 0, 0];
}

/** A module's solid parts, each a box in its own frame (x east, y south, z up): west, north, bottom, east, south,
 *  top. */
export function moduleParts(module: number): readonly (readonly number[])[] {
  return modules[module]?.parts ?? [];
}

/** The two lips of a module's mouth, where it opens the land, or none. */
export function moduleMouth(module: number): readonly (readonly (readonly [number, number])[])[] | undefined {
  return modules[module]?.mouth;
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

/** Fetches every module's meshes not yet read, FETCHES_AT_ONCE at a time in the manifest's order, as of `now`
 *  (ms): a group that cannot be read is left undrawn, said so, and asked for again by a call ASK_AGAIN_MS after. */
export function loadModules(now = performance.now()): Promise<void> {
  if (asking && !(asking.missed && now - asking.at >= ASK_AGAIN_MS)) return asking.done;
  const unread = listed.modules.flatMap((module, number) =>
    module.groups.flatMap(({ mesh }, index) => (meshes.has(`${number}:${index}`) ? [] : [{ number, index, mesh }])),
  );
  const begun = { at: now, missed: false, done: Promise.resolve() };
  begun.done = inTurn(unread, FETCHES_AT_ONCE, async ({ number, index, mesh }) => {
    try {
      meshes.set(`${number}:${index}`, readModuleMesh((await contentBytes(`${manifest.base}${mesh}`)).bytes));
    } catch (error) {
      console.error(`module ${number}'s ${mesh} cannot be drawn:`, error);
    }
  }).then(() => {
    begun.missed = unread.some(({ number, index }) => !meshes.has(`${number}:${index}`));
  });
  asking = begun;
  return begun.done;
}

/** `work` done on each of `items` in their order, at most `most` at once. */
async function inTurn<Item>(items: readonly Item[], most: number, work: (item: Item) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await work(items[next++] as Item);
  };
  await Promise.all(Array.from({ length: Math.min(most, items.length) }, worker));
}
