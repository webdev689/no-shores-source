// The ground's tiles the terrain wears (groundGrain.ts TILE_LAYERS), painted by the city's painter in the landmass's
// climate: its terrain set's grass, dirt, stone and paving, its winter set's grass for snow, the desert's sand for
// beaches, and its caverns' layered rock wall for the islands' rock.
import { CityPainter } from '../city/painter.ts';
import { LAYER_SIZE, terrainArchive } from '../city/pictures.ts';
import { cityClimate } from '../city/plan.ts';
import { climateArchive } from '../textures/climate.ts';
import type { Gpu } from '../gpu.ts';
import type { TILE_LAYERS } from '../groundGrain.ts';

/** The ground records of a terrain set (textures' recipes/ground.ts): its plain dirt, grass and stone, and a town's
 *  paving. */
const DIRT = 1;
const GRASS = 2;
const STONE = 3;
const PAVING = 46;
/** The caverns' set (textures' recipes/dungeonRock.ts) and its wall of layered beds. */
const CAVERNS = 320;
const BEDDED_WALL = 0;

/** Paints a landmass's (or an island's, by its climate) ground tiles into one array, white (no grain) until each is
 *  painted; `onPainted` is told as each comes. */
export function groundTiles(gpu: Gpu, biome: string | null, onPainted: () => void = () => {}): CityPainter {
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
    rock: [climateArchive(CAVERNS, BEDDED_WALL, climate.climate, 'summer'), BEDDED_WALL],
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
  return new CityPainter(gpu, { pictures }, onPainted);
}
