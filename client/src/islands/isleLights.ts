// The light the islands' modules give where their ember glows, as the land's fires and lamps (../sky/lamps.ts): a camp
// fire's coals burn a fire that casts its own light; a lantern's glass (a mine adit's, a passage's lamp and a dead lamp
// lit, in their hollows) holds a small flame, its light at the lantern. An ember stood cold (a lamp unlit) gives none.
import { coalsFire, type FirePlace, type LampPlace, lanternLights } from '../sky/lamps.ts';
import { type KitPack, MODULE_NAMES, PARTS, VERTEX_BYTES } from './isleModules.ts';
import type { IslePlacement, IsleShown } from './islePlan.ts';
import { placedPoint } from './isleView.ts';

/** The box round a module's ember in its own frame: its low corner, then its high. */
export type EmberBox = readonly [number, number, number, number, number, number];

/** How wide an ember stands at the least to be coals a fire burns on (a camp fire's); narrower, it is a lantern's
 *  glass. */
const COALS_LEAST_M = 0.5;
/** The modules whose ember is no flame: an open mouth's way on, daylight beyond it. */
const NOT_FLAMES: ReadonlySet<string> = new Set(['passage.mouth.open']);
const EMBER = PARTS.indexOf('ember');

const boxes = new WeakMap<KitPack, Map<string, EmberBox | null>>();

/** The box round `module`'s ember in `pack` (every vertex wearing it), or null for a module with none. Kept a pack.
 *  shortcut: a module's embers are one box; a module with two flames apart would want them clustered. */
export function emberBox(pack: KitPack, module: string): EmberBox | null {
  const known = boxes.get(pack) ?? new Map<string, EmberBox | null>();
  boxes.set(pack, known);
  if (known.has(module)) return known.get(module) ?? null;
  const entry = pack.modules.get(module);
  const floats = new Float32Array(pack.vertices.buffer, pack.vertices.byteOffset, pack.vertices.byteLength / 4);
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let vertex = entry?.vertexStart ?? 0; vertex < (entry ? entry.vertexStart + entry.vertexCount : 0); vertex++) {
    if (pack.vertices[vertex * VERTEX_BYTES + 24] !== EMBER) continue;
    for (let axis = 0; axis < 3; axis++) {
      const along = floats[(vertex * VERTEX_BYTES) / 4 + axis] ?? 0;
      [box[axis], box[axis + 3]] = [Math.min(box[axis] ?? 0, along), Math.max(box[axis + 3] ?? 0, along)];
    }
  }
  const found = box[0] === Infinity ? null : (box as unknown as EmberBox);
  known.set(module, found);
  return found;
}

/** What the islands' embers light and burn. */
export interface IsleLights {
  readonly lamps: LampPlace[];
  readonly fires: FirePlace[];
}

/** The fires and lamps of `isles`' modules whose ember glows, each module's ember box found by `boxOf` (null for one
 *  with none, or whose pack has not come). */
export function isleLights(isles: readonly IsleShown[], boxOf: (module: string) => EmberBox | null): IsleLights {
  const lights: IsleLights = { lamps: [], fires: [] };
  for (const isle of isles)
    for (const placement of isle.plan.placements) {
      const name = MODULE_NAMES[placement[0]] ?? '';
      const box = placement[7] === 1 || NOT_FLAMES.has(name) ? null : boxOf(name);
      if (box) emberLight(isle, placement, box, lights);
    }
  return lights;
}

/** One placed ember's fire, or lantern, into `into`, in world metres. */
function emberLight(isle: IsleShown, placement: IslePlacement, box: EmberBox, into: IsleLights): void {
  const [, , , , , scale, lift] = placement;
  const world = (local: readonly [number, number, number]): [number, number, number] => {
    const placed = placedPoint(local, placement);
    return [isle.at[0] + placed[0], isle.at[1] + placed[1], placed[2]];
  };
  const [across, deep, tall] = [(box[3] - box[0]) * scale, (box[4] - box[1]) * scale, (box[5] - box[2]) * scale * lift];
  const [middleX, middleY] = [(box[0] + box[3]) / 2, (box[1] + box[4]) / 2];
  const wide = Math.max(across, deep);
  if (wide >= COALS_LEAST_M) {
    into.fires.push(coalsFire(world([middleX, middleY, box[5]]), wide, tall));
    return;
  }
  const { fire, lamp } = lanternLights(world([middleX, middleY, (box[2] + box[5]) / 2]), Math.min(across, deep), wide);
  into.fires.push(fire);
  into.lamps.push(lamp);
}
