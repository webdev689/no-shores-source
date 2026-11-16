import type { Gpu } from '../gpu.ts';
import { blockFiles, parseBlockFile, type RmbBlock } from '../city/blocks.ts';
import type { CityTables } from '../city/cityBuild.ts';
import { CityView } from '../city/cityView.ts';
import { cityClimate } from '../city/plan.ts';
import { landSampler } from '../nature/ground.ts';
import { NatureView } from '../nature/natureView.ts';
import type { Landmass } from './landmass.ts';
import type { Drawer, GameScene } from './scene.ts';

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
 * it close by. `biome` is the continent's `climate` in the layout.
 */
export function landDrawers(
  gpu: Gpu,
  landmass: Landmass,
  scene: GameScene,
  biome: string | null,
  base: string,
  assets: Promise<CityAssets | null>,
): LandDrawers {
  const plan = landmass.drawnPlan;
  const city = plan ? new CityView(gpu) : null;
  if (plan && city) {
    const names = plan.cells.flatMap((cell) => (cell.use === 'block' && cell.block ? [cell.block] : []));
    assets
      .then(async (loaded) => {
        if (!loaded) return;
        city.setCity(plan, cityClimate(biome ?? undefined), await blocksOf(base, loaded, names), loaded.tables);
      })
      .catch((error: unknown) => console.error(`${landmass.id}'s city could not be drawn:`, error));
  }
  const cleared = (x: number, y: number) => (city ? city.cleared(x, y) : landmass.cleared(x, y));
  const nature = biome ? new NatureView(gpu) : null;
  let [version, patch, sample] = [0, scene.closePatch(), landSampler(landmass.view, scene.closePatch())];
  const natureDrawer: Drawer | null = nature && {
    drawInto: (pass, fromEye, shot, time) => {
      const now = scene.closePatch();
      if (now !== patch) [patch, sample, version] = [now, landSampler(landmass.view, now), version + 1];
      const { view } = landmass;
      const ground = {
        biome: biome ?? '',
        snowM: view.snowM ?? 2300,
        version,
        sample,
        cleared,
        groundColour: view.ground,
      };
      nature.update({ fromEye, eye: shot.eye, exaggeration: 1, time }, ground);
      nature.drawInto(pass);
    },
  };
  return {
    city,
    nature: natureDrawer,
    release: () => {
      city?.clear();
      nature?.destroy();
    },
  };
}
