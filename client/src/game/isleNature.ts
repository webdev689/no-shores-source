// The sea's islands' trees, shrubs and grass, drawn by the land's own plants (the nature layer, Flora's baked forms)
// in place of the islands' growing modules: each placement the island's dressing grew stands as a plant of its
// climate's cast, where the island stands its solid, on its own foot, turned and scaled as placed. Only those stand:
// the sea grows nothing round them.
import type { IslePlacement, IsleShown } from '../islands/islePlan.ts';
import { roleOf } from '../islands/isleModules.ts';
import { GROWTH_ROLES } from '../islands/isleView.ts';
import { castOf } from '../nature/cast.ts';
import type { GroundAt } from '../nature/ground.ts';
import type { Cast, Kind } from '../nature/kinds.ts';
import { NatureView } from '../nature/natureView.ts';
import { hashOf, type Planted, TILE_M } from '../nature/scatter.ts';
import type { Drawer } from './scene.ts';

/** The sea under an island's plants, as the plants' view reads it for how high its eye stands. */
const SEA: GroundAt = { height: 0, slope: 0, water: 'sea', mark: 0 };
/** Snow never settles on an island's plants: no island stands near a snow line. */
const NO_SNOW_M = 1e5;

/** The kinds of a cast an island's module of a role may stand as: a tree any tree (a kind of the tall layer that
 *  sways: rocks do not), a shrub or grass any of the low layer's. */
function kindsFor(cast: Cast, role: string): readonly Kind[] {
  if (role === 'tree') return cast.kinds.filter((kind) => kind.layer === 'tall' && kind.swayM > 0);
  return cast.kinds.filter((kind) => kind.layer === 'low');
}

/** The kind a placement stands as: drawn from its place, each kind as often as its chance of growing says. */
function kindOf(kinds: readonly Kind[], [, x, y]: IslePlacement): Kind | null {
  const total = kinds.reduce((sum, kind) => sum + kind.growth.chance, 0);
  let pick = (hashOf(Math.round(x * 100), Math.round(y * 100), 17) / 4294967296) * total;
  for (const kind of kinds) {
    pick -= kind.growth.chance;
    if (pick < 0) return kind;
  }
  return kinds[kinds.length - 1] ?? null;
}

/** Every island's growing placements as plants, by climate and then by the plants' 64 m tile ("x,y"), in the world's
 *  metres. */
export function islePlantings(isles: readonly IsleShown[]): Map<string, Map<string, Planted[]>> {
  const climates = new Map<string, Map<string, Planted[]>>();
  for (const isle of isles) {
    const cast = castOf(isle.climate);
    const tiles = climates.get(isle.climate) ?? new Map<string, Planted[]>();
    climates.set(isle.climate, tiles);
    for (const placement of isle.plan.placements) {
      const role = roleOf(placement[0]) ?? '';
      if (!GROWTH_ROLES.has(role)) continue;
      const kind = kindOf(kindsFor(cast, role), placement);
      if (!kind) continue;
      const [, x, y, z, turn, scale] = placement;
      const world = [x + isle.at[0], y + isle.at[1]] as const;
      const key = `${Math.floor(world[0] / TILE_M)},${Math.floor(world[1] / TILE_M)}`;
      const tile = tiles.get(key) ?? [];
      tile.push({ kind: kind.name, at: world, z, turn, scale });
      tiles.set(key, tile);
    }
  }
  return climates;
}

/** The islands' plants: one view of the land's plants for each climate shown, fed the islands' own plantings. */
export class IslesNature implements Drawer {
  private readonly gpu: ConstructorParameters<typeof NatureView>[0];
  private readonly views = new Map<string, NatureView>();
  private plantings = new Map<string, Map<string, Planted[]>>();
  private shown: readonly IsleShown[] = [];
  private version = 0;
  /** The frame the views were last kept for, so a frame's shadow pass and its own keep them once. */
  private keptFor: Float32Array | null = null;

  constructor(gpu: ConstructorParameters<typeof NatureView>[0]) {
    this.gpu = gpu;
  }

  /** The islands shown now: their plants are worked out again only when they change. */
  show(isles: readonly IsleShown[]): void {
    const same =
      isles.length === this.shown.length && isles.every((isle, index) => isle.plan === this.shown[index]?.plan);
    if (same) return;
    this.shown = isles;
    this.plantings = islePlantings(isles);
    this.version += 1;
    for (const climate of this.plantings.keys())
      if (!this.views.has(climate)) this.views.set(climate, new NatureView(this.gpu));
  }

  private keep(
    fromEye: Float32Array,
    eye: readonly [number, number, number],
    time: number,
    shadow: Parameters<NatureView['update']>[2],
  ): void {
    if (this.keptFor === fromEye) return;
    this.keptFor = fromEye;
    for (const [climate, view] of this.views) {
      const tiles = this.plantings.get(climate);
      view.update(
        { fromEye, eye, exaggeration: 1, time },
        {
          biome: climate,
          version: this.version,
          snowM: NO_SNOW_M,
          sample: () => SEA,
          cleared: () => false,
          grows: false,
          planted: (tileX, tileY) => tiles?.get(`${tileX},${tileY}`) ?? [],
        },
        shadow,
      );
    }
  }

  castInto: NonNullable<Drawer['castInto']> = (pass, fromEye, shot, time, shadow) => {
    this.keep(fromEye, shot.eye, time, shadow);
    for (const climate of this.plantings.keys()) this.views.get(climate)?.castInto(pass, shadow);
  };

  drawInto: Drawer['drawInto'] = (pass, fromEye, shot, time, shadow) => {
    this.keep(fromEye, shot.eye, time, shadow);
    for (const climate of this.plantings.keys()) this.views.get(climate)?.drawInto(pass, shadow);
  };
}
