// The ground's tiles the terrain wears (groundColour.ts TILE_LAYERS), painted by the city's painter in the landmass's
// climate: its terrain set's grass, dirt, stone and paving, its winter set's grass for snow, and the desert's sand for
// beaches.
import { CityPainter } from '../city/painter.ts';
import { LAYER_SIZE, terrainArchive } from '../city/pictures.ts';
import { cityClimate } from '../city/plan.ts';
import type { Gpu } from '../gpu.ts';
import type { TILE_LAYERS } from '../terrain/groundColour.ts';

/** The ground records of a terrain set (textures' recipes/ground.ts): its plain dirt, grass and stone, and a town's
 *  paving. */
const DIRT = 1;
const GRASS = 2;
const STONE = 3;
const PAVING = 46;

/** Paints a landmass's ground tiles into one array, white (no grain) until each is painted. */
export function groundTiles(gpu: Gpu, biome: string | null): CityPainter {
  const climate = cityClimate(biome ?? undefined);
  const plain = terrainArchive(climate);
  const winter = terrainArchive({ climate: climate.climate, season: 'winter' });
  const desert = terrainArchive({ climate: 'desert', season: 'summer' });
  const tiles: Record<(typeof TILE_LAYERS)[number], readonly [number, number]> = {
    grass: [plain, GRASS],
    dirt: [plain, DIRT],
    stone: [plain, STONE],
    snow: [winter, GRASS],
    sand: [desert, DIRT],
    paving: [plain, PAVING],
  };
  const pictures = Object.values(tiles).map(([archive, record]) => ({
    archive,
    record,
    width: LAYER_SIZE,
    height: LAYER_SIZE,
    uses: [],
    tint: null,
    guess: [1, 1, 1] as const,
  }));
  return new CityPainter(gpu, { pictures }, () => {});
}
