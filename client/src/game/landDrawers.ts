import type { Gpu } from '../gpu.ts';
import { blockFiles, parseBlockFile, type RmbBlock } from '../city/blocks.ts';
import type { CityTables } from '../city/cityBuild.ts';
import { standIn } from '../standIns.ts';
import { CityView } from '../city/cityView.ts';
import { loadModules } from '../city/modules.ts';
import { cityClimate } from '../city/plan.ts';
import { layoutFollower, type NodeLayout } from '../layout/layouts.ts';
import { planOfLayouts, plantedOf } from '../layout/layoutPlan.ts';
import { paintOfLayouts } from './groundPaint.ts';
import { landSampler, patchArea } from '../nature/ground.ts';
import { GroundChanges } from '../nature/groundChanges.ts';
import { NatureView } from '../nature/natureView.ts';
import { worldText } from '../terrain/landTexts.ts';
import { type Planted, TILE_M } from '../nature/scatter.ts';
import type { Landmass } from './landmass.ts';
import type { ShadowMap } from '../shadow.ts';
import type { Shot } from './camera.ts';
import type { Drawer, GameScene } from './scene.ts';
import { withWrecks } from './wrecks.ts';
import { cityPlantings } from './cityPlants.ts';

/** The forged models' tables and the RMB blocks read so far, shared by every landmass's city. */
export interface CityAssets {
  readonly tables: CityTables;
  readonly indexText: string;
  readonly blocks: Map<string, RmbBlock>;
}

/** The drawers that stand on a landmass besides the land: its city, its nodes' layouts near the eye and its nature,
 *  and how to let them go. */
export interface LandDrawers {
  readonly city: Drawer | null;
  readonly layouts: Drawer | null;
  readonly nature: Drawer | null;
  /** Whether the landmass's city stands whole, or it has none, or none could be built: the veil waits on it. */
  ready(): boolean;
  release(): void;
}

/** How far round the eye layouts are drawn, metres, and how far the eye moves before they are gathered again. */
const LAYOUT_REACH_M = 4000;
const LAYOUT_REGATHER_M = 1500;
/** How far round the eye the layouts' paths and streets are painted on the land, metres: past it they are too thin
 *  to see. */
const PAINT_REACH_M = 2500;

/** Draws the layouts near the eye with the city layer, followed before each frame: the ground under them is painted
 *  again each time the eye has moved on (`painted`), and the city built again, a few steps a frame, when the layouts
 *  near the eye change and its tables have come; once it is whole (`rebuilt`), what they planted is handed to nature
 *  (`planted`) too, the old layouts drawn and planted until then. */
function layoutDrawer(
  gpu: Gpu,
  layouts: readonly NodeLayout[],
  biome: string | null,
  assets: Promise<CityAssets | null>,
  painted: (near: readonly NodeLayout[], eye: readonly [number, number]) => void,
  rebuilt: () => void,
): {
  drawer: Drawer;
  view: CityView;
  planted: (tileX: number, tileY: number) => readonly Planted[];
  release(): void;
} {
  const view = new CityView(gpu);
  let [tables, coming] = [null as CityTables | null, true];
  let planted = plantedOf([], TILE_M);
  void assets.then((loaded) => (tables = loaded?.tables ?? null)).finally(() => (coming = false));
  const follow = layoutFollower(layouts, LAYOUT_REACH_M, LAYOUT_REGATHER_M, painted, (near) => {
    const plan = planOfLayouts(near);
    const whole = () => {
      planted = plantedOf(near, TILE_M);
      rebuilt();
    };
    if (plan && tables) view.beginCity(plan, cityClimate(biome ?? undefined), new Map(), tables, whole);
    else {
      view.clear();
      whole();
    }
  });
  return {
    view,
    planted: (tileX, tileY) => planted(tileX, tileY),
    drawer: {
      prepare: (shot) => {
        follow([shot.eye[0], shot.eye[1]], tables !== null);
        view.prepare();
        // Its tables still coming, or the city of the layouts near the eye still being built: not drawn yet.
        if (coming || view.underWay) standIn('city');
      },
      castInto: (pass, fromEye, shot, time, shadow) => view.castInto(pass, fromEye, shot, time, shadow),
      drawInto: (pass, fromEye, shot, time, shadow) => view.drawInto(pass, fromEye, shot, time, shadow),
    },
    release: () => view.clear(),
  };
}

/** Reads the forged models' tables and the RMB index once, and the modules' meshes, or null where the pages do not
 *  serve them. */
export async function loadCityAssets(base: string): Promise<CityAssets | null> {
  const read = (path: string) => worldText(base, path);
  try {
    const [buildings, props, indexText] = await Promise.all([
      read('forged/buildings.json'),
      read('forged/props.json'),
      read('rmb/index.json'),
      loadModules(),
    ]);
    return {
      tables: { buildings: JSON.parse(buildings), props: JSON.parse(props) } as CityTables,
      indexText,
      blocks: new Map(),
    };
  } catch (error) {
    console.error('the city cannot be drawn:', error);
    return null;
  }
}

/** The blocks a plan names, fetched from their files once and kept for every later city. */
async function blocksOf(
  base: string,
  assets: CityAssets,
  names: readonly string[],
): Promise<ReadonlyMap<string, RmbBlock>> {
  const missing = names.filter((name) => !assets.blocks.has(name));
  const files = blockFiles(assets.indexText, missing);
  await Promise.all(
    files.map(async (file) => {
      for (const block of parseBlockFile(await worldText(base, `rmb/${file}`))) assets.blocks.set(block.name, block);
    }),
  );
  return assets.blocks;
}

/**
 * A landmass's city, drawn by the city layer once its tables and blocks have come (nothing until then), and its
 * nature, which grows round the eye where the city has not set the ground, from the land as the scene last sampled
 * it close by. `biome` is the continent's `climate` in the layout. A ruin's wrecks are drawn with the city, at the
 * size ships are drawn at now (`shipScale`).
 */
export function landDrawers(
  gpu: Gpu,
  landmass: Landmass,
  scene: GameScene,
  biome: string | null,
  base: string,
  assets: Promise<CityAssets | null>,
  shipScale: () => number,
): LandDrawers {
  const plan = landmass.drawnPlan;
  let [patch, sample] = [scene.closePatch(), landSampler(landmass.view, scene.closePatch())];
  const changes = new GroundChanges();
  const city = plan ? new CityView(gpu, shipScale) : null;
  let released = false;
  let cityStands = !plan;
  if (plan && city) {
    const names = plan.cells.flatMap((cell) => (cell.use === 'block' && cell.block ? [cell.block] : []));
    assets
      .then(async (loaded) => {
        if (!loaded) return void (cityStands = true);
        const blocks = await blocksOf(base, loaded, names);
        // A landmass let go while its blocks came is drawn no more: its city is never built.
        if (released) return;
        // The nature already scattered knew only the pads; once the city stands, it is scattered again round the
        // city's solids too.
        city.beginCity(plan, cityClimate(biome ?? undefined), blocks, loaded.tables, () => {
          cityStands = true;
          changes.change(null);
        });
      })
      .catch((error: unknown) => {
        cityStands = true;
        console.error(`${landmass.id}'s city could not be drawn:`, error);
      });
  }
  const laid = landmass.layouts.length
    ? layoutDrawer(
        gpu,
        landmass.layouts,
        biome,
        assets,
        (near, eye) =>
          scene.paintGround(paintOfLayouts(near, eye, PAINT_REACH_M, [landmass.view.leftM, landmass.view.topM])),
        () => changes.change(null),
      )
    : null;
  // The pads are kept clear from the first frame; the city's and the layouts' solids and yards too once built.
  const cleared = (x: number, y: number) =>
    landmass.cleared(x, y) || (city?.cleared(x, y) ?? false) || (laid?.view.cleared(x, y) ?? false);
  const nature = biome ? new NatureView(gpu) : null;
  const cityPlanted = cityPlantings(plan?.social.plants ?? [], biome ?? '');
  // Nature is updated once a frame, for its shadow's pass and its own alike.
  let updatedFor: Float32Array | null = null;
  const keepNature = (view: NatureView, fromEye: Float32Array, shot: Shot, time: number, shadow: ShadowMap) => {
    if (updatedFor === fromEye) return;
    updatedFor = fromEye;
    const now = scene.closePatch();
    if (now !== patch) {
      // The ground read changes only where the old patch or the new one reaches: past both, the 1 km land alone.
      changes.change([patch, now].flatMap((each) => (each ? [patchArea(each)] : [])));
      [patch, sample] = [now, landSampler(landmass.view, now)];
    }
    const land = landmass.view;
    const ground = {
      biome: biome ?? '',
      snowM: land.snowM ?? 2300,
      version: changes.version,
      unchanged: changes.unchanged,
      sample,
      cleared,
      planted: (tileX: number, tileY: number) => [...(laid?.planted(tileX, tileY) ?? []), ...cityPlanted(tileX, tileY)],
      groundColour: land.ground,
    };
    view.update({ fromEye, eye: shot.eye, exaggeration: 1, time }, ground, shadow);
  };
  const natureDrawer: Drawer | null = nature && {
    castInto: (pass, fromEye, shot, time, shadow) => {
      keepNature(nature, fromEye, shot, time, shadow);
      nature.castInto(pass, shadow);
    },
    drawInto: (pass, fromEye, shot, time, shadow) => {
      keepNature(nature, fromEye, shot, time, shadow);
      nature.drawInto(pass, shadow);
    },
  };
  return {
    city: plan && city && withWrecks(gpu, city, plan, shipScale),
    layouts: laid?.drawer ?? null,
    nature: natureDrawer,
    ready: () => cityStands,
    release: () => {
      released = true;
      city?.clear();
      laid?.release();
      nature?.destroy();
    },
  };
}
