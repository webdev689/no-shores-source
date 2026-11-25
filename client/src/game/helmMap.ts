import type { ForgeStore } from '../forge/store.ts';
import type { Gpu } from '../gpu.ts';
import { coastField } from '../heldmap/coastField.ts';
import { type Difficulty, HeldMap } from '../heldmap/heldMap.ts';
import type { LandSheet } from '../heldmap/landSheet.ts';
import type { MapWater } from '../heldmap/watersWash.ts';
import { CHART_CELL_M, CHART_COLUMNS, CHART_ROWS } from '../overworld/worldFrame.ts';
import type { Point2 } from '../overworld/ground.ts';
import type { Viewport } from '../overworld/overworldCamera.ts';
import { BINDS } from '../player/input.ts';
import { boundWord } from './controls.ts';
import type { WorldShown } from './worldShown.ts';
import type { Sea } from './sea.ts';
import type { Stack } from '../ui/stack.ts';
import type { MapMarks } from '../heldmap/landSheet.ts';

/** What the map at the helm draws over the finished picture. */
export type MapDraw = (encoder: GPUCommandEncoder, view: GPUTextureView) => void;

/** What the map is made with: the GPU, every continent's coast, the forge's art, the interface it draws its marks on, and
 *  the ship at sea, if one is; what a destination set does (sails for it, in the sea room of the difficulty the map
 *  set, or travels there, the prompt answered yes); what is handed to the map once it is made (the waters' tint); and the nodes the quest walked names. */
export interface HelmMapContext {
  readonly gpu: Gpu;
  readonly outlines: readonly (readonly Point2[])[];
  readonly store: ForgeStore;
  readonly stack: Stack;
  readonly sea: () => Sea | null;
  /** Why each difficulty's seas are shut to the player by their level, by tier (null where open). */
  readonly shut: () => readonly (string | null)[];
  readonly sail: (to: Point2, seas: Difficulty, travel: MapWater | null) => void;
  readonly made: (map: HeldMap) => void;
  readonly quest?: () => readonly string[];
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
    const { gpu, outlines, store, stack } = this.context;
    const field = coastField(outlines, CHART_COLUMNS, CHART_ROWS, CHART_CELL_M);
    const made = new HeldMap(
      gpu,
      field,
      store,
      (to) => this.sea()?.planTo(to) ?? { ok: false, why: 'No ship.' },
      stack,
    );
    made.sailKey = () => boundWord('confirm');
    made.noKey = () => (BINDS.device === 'pad' ? 'B' : 'Escape');
    made.onLowered((sail, travel) => {
      if (this.onLand) return;
      this.sea()?.view.fromHelm();
      if (sail) this.context.sail(sail, made.difficulty, travel);
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
    shown: WorldShown,
  ): MapDraw | undefined {
    // The land's map up or wanted at sea (a room's gate shut on the player as they looked) is put away at once.
    if (this.onLand) {
      this.landWanted = null;
      if (this.map?.shown) this.map.drop();
    }
    if (this.wanted && here.view.atHelm && helm.free) {
      this.wanted = false;
      this.made.open(helm.viewport, here.position, helm.hands, this.context.shut());
    }
    // The map's scene is gathered only while the map is up.
    const map = this.map;
    const drawn = map?.shown
      ? map.frame(seconds, helm.viewport, helm.dpr, {
          ship: here.position,
          heading: here.heading,
          places: shown.places,
          knownIslands: shown.knownIslands,
          course: here.course,
          quest: this.context.quest?.() ?? [],
        })
      : null;
    return map && drawn ? (encoder, view) => map.draw(encoder, view, drawn) : undefined;
  }

  /** One frame on foot, `seconds` on: the land's map raised once the view is in the player's eyes (`eyes`) while
   *  nothing else is up (`free`), and lowered if something comes up (a fall); while it is up, what it draws over the
   *  picture, the player's arrow where they stand (`at`, in the world) and look (`heading`, clockwise from north), and
   *  each keeper's coin lit while `lit` says their keeper has something for the player. */
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
      readonly lit?: (glyph: string) => boolean;
      readonly map?: () => MapMarks;
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
    const up = !!map?.shown && this.onLand;
    const scene = { ship: foot.at, heading: foot.heading, places: [], knownIslands: 0, course: [], lit: foot.lit };
    const moving = up ? foot.map?.() : undefined;
    const drawn = up && map ? map.frame(seconds, foot.viewport, foot.dpr, { ...scene, moving }) : null;
    return map && drawn ? (encoder, view) => map.draw(encoder, view, drawn) : undefined;
  }
}
