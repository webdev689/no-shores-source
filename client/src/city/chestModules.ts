// Every chest a public event or a patrol stands, as the props draw a module: the owner's chest (models/chest.ts) built
// in code rather than baked in Blender, a plain one and a heroic one, each its body and its lid. A lid is a module of
// its own with the hinge's line at its origin, so the props swing it open about their own x; the body's `hinge` socket
// says where that line lies on it. A plain chest is banded in iron with a gold latch, a heroic one larger and all its
// metal gold.
import { CHEST_PARTS, type ChestPart, chestFaces, chestHinge, chestScale } from '../models/chest.ts';
import type { ModuleMesh } from './modules.ts';

type Point = readonly [number, number, number];

/** A module as the manifest lists one, with its surfaces already made. */
export type BuiltModule = {
  readonly name: string;
  readonly size: readonly number[];
  readonly sockets: readonly { readonly name: string; readonly at: Point }[];
  readonly groups: readonly { readonly mesh: string; readonly material: string }[];
  readonly meshes: readonly ModuleMesh[];
};

/** Each chest's name, the box it is fitted to (across, back to front, metres: the Blender chests' it took the place
 *  of) and its hinge's metal. */
const CHESTS = [
  { name: 'chest', wide: 0.95, deep: 0.58, hinge: 'iron' },
  { name: 'chest-heroic', wide: 1.1, deep: 0.66, hinge: 'gold' },
] as const;

/** The modules for every chest: for each, its body and its lid. */
export function chestModules(): BuiltModule[] {
  return CHESTS.flatMap((chest) => {
    const scale = chestScale(chest.wide, chest.deep);
    const hinge = chestHinge(scale);
    const material = (part: ChestPart): string =>
      part === 'hinge' ? chest.hinge : part === 'latch' ? 'gold' : 'timber';
    const body = built(chest.name, scale, ['base'], [0, 0, 0], material);
    const lid = built(`${chest.name}-lid`, scale, ['lid', 'hinge', 'latch'], hinge, material);
    return [{ ...body, sockets: [{ name: 'hinge', at: hinge }] }, lid];
  });
}

/** A module of the chest's `parts` shut, laid from `origin`, each material a surface group of its own. */
function built(
  name: string,
  scale: number,
  parts: readonly ChestPart[],
  origin: Point,
  material: (part: ChestPart) => string,
): BuiltModule {
  const faces = chestFaces(scale).filter((face) => parts.includes(face.part));
  const materials = [...new Set(CHEST_PARTS.filter((part) => parts.includes(part)).map(material))];
  const meshes = materials.map((wears) => {
    const worn = faces.filter((face) => material(face.part) === wears);
    const positions = new Float32Array(worn.length * 9);
    const normals = new Int8Array(worn.length * 9);
    worn.forEach((face, nth) =>
      face.corners.forEach((corner, k) => {
        for (let axis = 0; axis < 3; axis++) {
          positions[nth * 9 + k * 3 + axis] = (corner[axis] ?? 0) - (origin[axis] ?? 0);
          normals[nth * 9 + k * 3 + axis] = Math.round((face.normal[axis] ?? 0) * 127);
        }
      }),
    );
    const triangles = Uint32Array.from({ length: worn.length * 3 }, (unused, index) => index);
    return { positions, normals, glows: new Uint8Array(worn.length * 3), triangles };
  });
  const points = faces.flatMap((face) => face.corners);
  const span = (axis: number) => {
    const along = points.map((point) => point[axis] ?? 0);
    return Math.max(...along) - Math.min(...along);
  };
  const groups = materials.map((wears) => ({ mesh: '', material: wears }));
  return { name, size: [span(0), span(1), span(2)], sockets: [], groups, meshes };
}
