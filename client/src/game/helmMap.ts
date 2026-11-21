import type { ForgeStore } from '../forge/store.ts';
import type { Gpu } from '../gpu.ts';
import { coastField } from '../heldmap/coastField.ts';
import { type Difficulty, HeldMap } from '../heldmap/heldMap.ts';
import type { LandSheet } from '../heldmap/landSheet.ts';
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
 * On foot it shows the land the player stands on, raised once the view is in their eyes, only to look at.
 */
export class HelmMap {
  private map: HeldMap | null = null;
  /** The map is wanted: it is raised once the view stands at the helm. */
  private wanted = false;
  /** The land wanted raised on foot once the view is in the player's eyes; and whether the map raised last is the
   *  land's. */
  private landWanted: LandSheet | null = null;
  private onLand = false;

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
      if (this.onLand) return;
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
    return this.shown || this.wanted || this.landWanted !== null;
  }

  /** Whether the land's map is up or wanted on foot: the view is the player's eyes, and they stand still to look. */
  get looking(): boolean {
    return this.onLand && (this.shown || this.landWanted !== null);
  }

  /** The difficulty the last voyage set out at, once a map has set one. */
  get difficulty(): Difficulty | undefined {
    return this.map?.difficulty;
  }

  /** Takes the view down to `sea`'s helm, where the map is raised. */
  open(sea: Sea): void {
    if (this.shown) return;
    this.wanted = sea.toHelm();
    this.onLand = false;
  }

  /** Raises the map of `sheet`, the land the player stands on, once the view is in their eyes. */
  openLand(sheet: LandSheet): void {
    if (this.shown) return;
    // The way down to a helm left behind at sea is let go.
    [this.landWanted, this.onLand, this.wanted] = [sheet, true, false];
  }

  /** A key pressed: the map's own while it is up (on land N lowers it as Escape does); Escape turns back on the way
   *  down to the helm before it is raised, and on land Escape or N before it rises, every other key held meanwhile;
   *  answers whether the key was taken. */
  key(key: string): boolean {
    if (this.map?.shown) {
      if (key === 'escape' || (key === 'n' && this.onLand)) this.map.escape();
      else if (key === 'enter') this.map.setSail();
      return true;
    }
    if (this.landWanted) {
      if (key === 'escape' || key === 'n') this.landWanted = null;
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

  /** One frame on foot, `seconds` on: the land's map raised once the view is in the player's eyes (`eyes`) while
   *  nothing else is up (`free`), and lowered if something comes up (a fall); while it is up, what it draws over the
   *  picture, the player's arrow where they stand (`at`, in the world) and look (`heading`, clockwise from north). */
  footFrame(
    seconds: number,
    foot: {
      readonly free: boolean;
      readonly viewport: Viewport;
      readonly dpr: number;
      readonly hands: string | null;
      readonly eyes: boolean;
      readonly at: Point2;
      readonly heading: number;
    },
  ): MapDraw | undefined {
    // A map raised at sea and carried ashore (washed up with it up) is put away at once.
    if (this.map?.shown && !this.onLand) this.map.drop();
    if (!foot.free) {
      this.landWanted = null;
      if (this.onLand) this.map?.close();
    } else if (this.landWanted && foot.eyes) {
      const { origin } = this.landWanted;
      this.made.openLand(foot.viewport, this.landWanted, foot.hands, [foot.at[0] - origin[0], foot.at[1] - origin[1]]);
      this.landWanted = null;
    }
    const map = this.map;
    const scene = { ship: foot.at, heading: foot.heading, places: [], knownIslands: 0, course: [] };
    const drawn = map?.shown && this.onLand ? map.frame(seconds, foot.viewport, foot.dpr, scene) : null;
    return map && drawn ? (encoder, view) => map.draw(encoder, view, drawn) : undefined;
  }
}
