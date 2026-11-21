import type { ForgeStore } from '../forge/store.ts';
import type { Gpu } from '../gpu.ts';
import { coastField } from '../heldmap/coastField.ts';
import { type Difficulty, HeldMap } from '../heldmap/heldMap.ts';
import { CHART_CELL_M, CHART_COLUMNS, CHART_ROWS } from '../overworld/discovery.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Viewport } from '../overworld/overworldCamera.ts';
import type { Discovered } from './discovered.ts';
import type { Sea } from './sea.ts';

/** What the map at the helm draws over the finished picture. */
export type MapDraw = (encoder: GPUCommandEncoder, view: GPUTextureView) => void;

/** What the map is made with: the GPU, every continent's coast, the forge's art, the page it lays its marks on, and
 *  the ship at sea, if one is; what a destination set does (sails for it, in the sea room of the difficulty the map
 *  set); and what is handed to the map once it is made (the waters' tint). */
export interface HelmMapContext {
  readonly gpu: Gpu;
  readonly outlines: readonly (readonly Point2[])[];
  readonly store: ForgeStore;
  readonly root: HTMLElement;
  readonly sea: () => Sea | null;
  readonly sail: (to: Point2, seas: Difficulty) => void;
  readonly made: (map: HeldMap) => void;
}

/**
 * The held map at the ship's helm: made when first asked for, since its coasts are worked out then; wanted, it is
 * raised once the view stands at the helm. Lowered, the view goes back up, and with a destination set it sets sail.
 */
export class HelmMap {
  private map: HeldMap | null = null;
  /** The map is wanted: it is raised once the view stands at the helm. */
  private wanted = false;

  private readonly context: HelmMapContext;

  constructor(context: HelmMapContext) {
    this.context = context;
  }

  private sea(): Sea | null {
    return this.context.sea();
  }

  /** The map, its coasts worked out now if they are not yet. */
  get made(): HeldMap {
    if (this.map) return this.map;
    const { gpu, outlines, store, root } = this.context;
    const field = coastField(outlines, CHART_COLUMNS, CHART_ROWS, CHART_CELL_M);
    const made = new HeldMap(gpu, field, store, (to) => this.sea()?.planTo(to) ?? { ok: false, why: 'No ship.' }, root);
    made.onLowered((sail) => {
      this.sea()?.view.fromHelm();
      if (sail) this.context.sail(sail, made.difficulty);
    });
    this.context.made(made);
    this.map = made;
    return made;
  }

  /** The map once it has been made, for the pointer while it is up. */
  get held(): HeldMap | null {
    return this.map;
  }

  /** Whether the map is up, rising or lowering. */
  get shown(): boolean {
    return this.map?.shown ?? false;
  }

  /** Whether the map is up or the view on its way down to raise it. */
  get busy(): boolean {
    return this.shown || this.wanted;
  }

  /** The difficulty the last voyage set out at, once a map has set one. */
  get difficulty(): Difficulty | undefined {
    return this.map?.difficulty;
  }

  /** Takes the view down to `sea`'s helm, where the map is raised. */
  open(sea: Sea): void {
    if (!this.shown) this.wanted = sea.toHelm();
  }

  /** A key pressed: the map's own while it is up, and Escape turns back on the way down before it is raised; answers
   *  whether the key was taken. */
  key(key: string): boolean {
    if (this.map?.shown) {
      if (key === 'escape') this.map.escape();
      else if (key === 'enter') this.map.setSail();
      return true;
    }
    const sea = this.sea();
    if (key !== 'escape' || !this.wanted || !sea?.view.helmView) return false;
    this.wanted = false;
    sea.view.fromHelm();
    return true;
  }

  /** One frame at `here`, `seconds` on: the map raised in `hands` once the view stands at the helm, while nothing else
   *  is up (`free`), and while it is up, what it draws over the picture (`dpr` device pixels a CSS pixel). */
  frame(
    here: Sea,
    seconds: number,
    helm: { readonly free: boolean; readonly viewport: Viewport; readonly dpr: number; readonly hands: string | null },
    discovered: Discovered,
  ): MapDraw | undefined {
    if (this.wanted && here.view.atHelm && helm.free) {
      this.wanted = false;
      this.made.open(helm.viewport, here.position, helm.hands, discovered.discovery.charted);
    }
    // The map's scene is gathered only while the map is up.
    const map = this.map;
    const drawn = map?.shown
      ? map.frame(seconds, helm.viewport, helm.dpr, {
          ship: here.position,
          heading: here.heading,
          places: discovered.places,
          knownIslands: discovered.knownIslands,
          course: here.course,
        })
      : null;
    return map && drawn ? (encoder, view) => map.draw(encoder, view, drawn) : undefined;
  }
}
