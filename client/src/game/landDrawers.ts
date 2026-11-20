import type { Gpu } from '../gpu.ts';
import { blockFiles, parseBlockFile, type RmbBlock } from '../city/blocks.ts';
import type { CityTables } from '../city/cityBuild.ts';
import { CityView } from '../city/cityView.ts';
import { cityClimate } from '../city/plan.ts';
import { landSampler } from '../nature/ground.ts';
import { NatureView } from '../nature/natureView.ts';
import type { Landmass } from './landmass.ts';
import type { ShadowMap } from '../shadow.ts';
import type { Shot } from './camera.ts';
import type { Drawer, GameScene } from './scene.ts';
import { withWrecks } from './wrecks.ts';

/** The forged models' tables and the RMB blocks read so far, shared by every landmass's city. */
export interface CityAssets {
  readonly tables: CityTables;
  readonly indexText: string;
  readonly blocks: Map<string, RmbBlock>;
}

/** The drawers that stand on a landmass besides the land: its city and its nature, and how to let them go. */
export interface LandDrawers {
  readonly city: Drawer | null;
  readonly nature: Drawer | null;
  release(): void;
}

/** Reads the forged models' tables and the RMB index once, or null where the pages do not serve them. */
export async function loadCityAssets(base: string): Promise<CityAssets | null> {
  const read = async (path: string) => {
    const answer = await fetch(`${base}world/${path}`);
    if (!answer.ok) throw new Error(`world/${path}: ${answer.status}`);
    return answer.text();
  };
  try {
    const [buildings, props, indexText] = await Promise.all([
      read('forged/buildings.json'),
      read('forged/props.json'),
      read('rmb/index.json'),
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
      const answer = await fetch(`${base}world/rmb/${file}`);
      if (!answer.ok) throw new Error(`world/rmb/${file}: ${answer.status}`);
      for (const block of parseBlockFile(await answer.text())) assets.blocks.set(block.name, block);
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
  let [version, patch, sample] = [0, scene.closePatch(), landSampler(landmass.view, scene.closePatch())];
  const city = plan ? new CityView(gpu) : null;
  let released = false;
  if (plan && city) {
    const names = plan.cells.flatMap((cell) => (cell.use === 'block' && cell.block ? [cell.block] : []));
    assets
      .then(async (loaded) => {
        if (!loaded) return;
        const blocks = await blocksOf(base, loaded, names);
        // A landmass let go while its blocks came is drawn no more: its city is never built.
        if (released) return;
        city.setCity(plan, cityClimate(biome ?? undefined), blocks, loaded.tables);
        // The nature already scattered knew only the pads; it is scattered again round the city's solids too.
        version += 1;
      })
      .catch((error: unknown) => console.error(`${landmass.id}'s city could not be drawn:`, error));
  }
  // The pads are kept clear from the first frame; the city's solids too once it is built.
  const cleared = (x: number, y: number) => landmass.cleared(x, y) || (city?.cleared(x, y) ?? false);
  const nature = biome ? new NatureView(gpu) : null;
  // Nature is updated once a frame, for its shadow's pass and its own alike.
  let updatedFor: Float32Array | null = null;
  const keepNature = (view: NatureView, fromEye: Float32Array, shot: Shot, time: number, shadow: ShadowMap) => {
    if (updatedFor === fromEye) return;
    updatedFor = fromEye;
    const now = scene.closePatch();
    if (now !== patch) [patch, sample, version] = [now, landSampler(landmass.view, now), version + 1];
    const land = landmass.view;
    const ground = {
      biome: biome ?? '',
      snowM: land.snowM ?? 2300,
      version,
      sample,
      cleared,
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
    nature: natureDrawer,
    release: () => {
      released = true;
      city?.clear();
      nature?.destroy();
    },
  };
}
