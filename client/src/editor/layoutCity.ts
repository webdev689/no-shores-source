// The layouts' buildings, props and solids in the 3D view, drawn by the city layer as the game draws them. The page
// holds only the layouts near the camera: the land worker hands them over whole, by name, when the camera has moved
// on or the layouts were planned again, and everything is gathered once a frame before any pass is recorded, since
// building a city frees the buffers a pass already being recorded would draw from.
import type { Gpu } from '../gpu.ts';
import type { CityTables } from '../city/cityBuild.ts';
import { CityView } from '../city/cityView.ts';
import { loadModules } from '../city/modules.ts';
import { cityClimate } from '../city/plan.ts';
import { layoutsNear, type NodeLayout } from '../layout/layouts.ts';
import { planOfLayouts } from '../layout/layoutPlan.ts';
import type { LayoutMarks } from '../terrain/layoutMarks.ts';

/** Where the whole layouts come from: the open landmass's, by name (null when another is open), and its climate. */
export interface LayoutSource {
  layoutsNamed(id: string, ids: readonly string[]): Promise<string | null>;
  climateOf(id: string): string | null;
}

/** How far round the camera layouts are drawn, metres, and how far it moves before they are gathered again: the
 *  game's own reach. */
const LAYOUT_REACH_M = 4000;
const LAYOUT_REGATHER_M = 1500;

/** What was last gathered: for which landmass and plans, where, and the names of the layouts it holds. */
interface Gathered {
  readonly id: string;
  readonly marks: readonly LayoutMarks[];
  at: readonly [number, number];
  readonly names: string;
}

/** Which layouts the camera at `eye` wants, by name, or null when what was gathered still serves: the same
 *  landmass and plans, and the camera no further than the regather distance from where they were gathered, or
 *  further but with the same layouts near. */
export function layoutsWanted(
  gathered: Gathered | null,
  id: string,
  marks: readonly LayoutMarks[],
  eye: readonly [number, number],
): string[] | null {
  const same = gathered?.id === id && gathered.marks === marks;
  if (same && Math.hypot(eye[0] - gathered.at[0], eye[1] - gathered.at[1]) < LAYOUT_REGATHER_M) return null;
  const ids = layoutsNear(marks, eye, LAYOUT_REACH_M).map((layout) => layout.id);
  return same && ids.join(',') === gathered.names ? null : ids;
}

/** Reads the forged models' tables once, and the modules' meshes, or null where the pages do not serve them. */
async function loadTables(base: string): Promise<CityTables | null> {
  const read = async (name: string) => {
    const answer = await fetch(`${base}world/forged/${name}.json`);
    if (!answer.ok) throw new Error(`world/forged/${name}.json: ${answer.status}`);
    return answer.json() as Promise<unknown>;
  };
  try {
    const [buildings, props] = await Promise.all([read('buildings'), read('props'), loadModules()]);
    return { buildings, props } as CityTables;
  } catch (error) {
    console.error("the layouts' buildings cannot be drawn:", error);
    return null;
  }
}

/** The layouts near the 3D view's camera, drawn by one city view. */
export class LayoutCity {
  private readonly view: CityView;
  private readonly base: string;
  private tablesAsked = false;
  private loaded: CityTables | null = null;
  private gathered: Gathered | null = null;
  /** Layouts come from the worker and waiting to be built, with the climate they are painted in. */
  private ready: {
    readonly asked: Gathered;
    readonly layouts: readonly NodeLayout[];
    readonly climate: string | null;
  } | null = null;
  private drawing = false;

  /** `base` is the pages' address, which serves the forged models' tables under `world/forged/`. */
  constructor(gpu: Gpu, base: string) {
    this.view = new CityView(gpu);
    this.base = base;
  }

  /** Once a frame, before any pass: asks for the layouts the camera now wants, and builds those that have come.
   *  `marks` is null while the buildings are not drawn; `eye` is the camera in world metres. */
  prepare(
    id: string,
    marks: readonly LayoutMarks[] | null,
    eye: readonly [number, number],
    source: LayoutSource | null,
  ) {
    if (!marks || !source) {
      if (this.drawing) this.view.clear();
      [this.gathered, this.ready, this.drawing] = [null, null, false];
      return;
    }
    if (!this.tablesAsked) void loadTables(this.base).then((tables) => (this.loaded = tables));
    this.tablesAsked = true;
    const { gathered } = this;
    const ids = layoutsWanted(gathered, id, marks, eye);
    // The gathering point moves only in regather-sized steps, so a camera panned smoothly still gathers again.
    if (!ids && gathered && Math.hypot(eye[0] - gathered.at[0], eye[1] - gathered.at[1]) >= LAYOUT_REGATHER_M)
      gathered.at = eye;
    if (ids) {
      const asked: Gathered = { id, marks, at: eye, names: ids.join(',') };
      this.gathered = asked;
      const named = ids.length ? source.layoutsNamed(id, ids) : Promise.resolve('[]');
      named
        .then((text) => {
          if (this.gathered !== asked || text === null) return;
          this.ready = { asked, layouts: JSON.parse(text) as NodeLayout[], climate: source.climateOf(id) };
        })
        .catch((error: unknown) => console.error("the layouts' buildings could not be gathered:", error));
    }
    const { ready, loaded } = this;
    if (!ready || !loaded) return;
    this.ready = null;
    // The camera moved on or the layouts were planned again since this was asked for: it is stale.
    if (ready.asked !== this.gathered) return;
    try {
      const plan = planOfLayouts(ready.layouts);
      if (plan) this.view.setCity(plan, cityClimate(ready.climate ?? undefined), new Map(), loaded);
      else this.view.clear();
      this.drawing = plan !== null;
    } catch (error) {
      // Layouts the city cannot build leave the rest of the view drawing.
      this.view.clear();
      this.drawing = false;
      console.error("the layouts' buildings could not be built:", error);
    }
  }

  /** Draws the layouts gathered into the 3D view's pass. The view measures from its camera with heights shown
   *  `shown` times over, in its window's frame (world metres less its corner); the city in world metres. */
  drawInto(
    pass: GPURenderPassEncoder,
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    corner: { readonly leftM: number; readonly topM: number },
    shown: number,
    time: number,
  ): void {
    if (!this.drawing) return;
    const cityFromEye = fromEye.slice();
    for (let row = 0; row < 4; row++) cityFromEye[8 + row] = fromEye[8 + row] * shown;
    const worldEye = [eye[0] + corner.leftM, eye[1] + corner.topM, eye[2] / shown] as const;
    // The city reads only the eye off its shot; the look is all in the matrix.
    const shot = { eye: worldEye, yaw: 0, pitch: 0, fov: 0, near: 0, far: 0 };
    this.view.drawInto(pass, cityFromEye, shot, time);
  }
}
