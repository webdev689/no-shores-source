import { type Cast, GRASS, LOW, low, ROCK, ROCKS, SHRUB, SMALL_TREE, tall, TREE, TREES } from './kinds.ts';

/** The casts of the cooler biomes, by their keys in the layout. Their forms are baked by tools/flora (species.py
 *  names the same kinds in the same order, with the same number of forms). */
export const COOL_CASTS: Readonly<Record<string, () => Cast>> = {
  'temperate-coast': () => ({
    keepAtReach: 0.35,
    kinds: [
      tall('oak', TREE, { chance: 0.11, grove: 0.95, ...TREES }, 2, [0.8, 1.25], 0.6),
      tall('pine', TREE, { chance: 0.07, grove: 0.85, ...TREES }, 2, [0.85, 1.2], 0.45),
      tall('boulder', ROCK, { chance: 0.07, ...ROCKS }, 2, [0.7, 1.6], 1.2),
      low(
        'gorse',
        SHRUB,
        { chance: 0.035, grove: -0.5, byWater: { reachM: 500, boost: 4 }, ...LOW, lowestM: 1 },
        1,
        [0.7, 1.3],
        0.8,
      ),
      low('grass', GRASS, { chance: 0.12, grove: -0.6, ...LOW }, 1, [0.7, 1.3], 0.2),
    ],
  }),
  highland: () => ({
    keepAtReach: 0.35,
    kinds: [
      tall('fir', TREE, { chance: 0.13, grove: 0.95, ...TREES }, 2, [0.75, 1.25], 0.45),
      tall(
        'birch',
        TREE,
        { chance: 0.05, grove: 0.7, byWater: { reachM: 300, boost: 2.5 }, ...TREES },
        2,
        [0.8, 1.2],
        0.25,
      ),
      tall('granite', ROCK, { chance: 0.09, ...ROCKS }, 2, [0.8, 1.9], 1.2),
      low('heather', SHRUB, { chance: 0.1, grove: -0.7, ...LOW }, 1, [0.7, 1.4], 0.6),
      low('upland grass', GRASS, { chance: 0.08, grove: -0.4, ...LOW }, 1, [0.7, 1.3], 0.2),
    ],
  }),
  woodland: () => ({
    keepAtReach: 0.2,
    kinds: [
      tall('oak', TREE, { chance: 0.24, grove: 0.9, ...TREES }, 2, [0.8, 1.25], 0.6),
      tall('beech', TREE, { chance: 0.22, grove: 0.9, ...TREES }, 2, [0.8, 1.2], 0.55),
      tall('fir', TREE, { chance: 0.09, grove: 0.8, ...TREES }, 2, [0.8, 1.25], 0.45),
      tall('mossy boulder', ROCK, { chance: 0.06, ...ROCKS }, 2, [0.7, 1.5], 1.2),
      low('fern', GRASS, { chance: 0.16, grove: 0.3, ...LOW }, 1, [0.8, 1.4], 0.3),
      low('hazel', SHRUB, { chance: 0.05, grove: 0.4, ...LOW }, 1, [0.7, 1.3], 1.0),
    ],
  }),
  steppe: () => ({
    keepAtReach: 0.9,
    kinds: [
      tall(
        'birch',
        TREE,
        { chance: 0.25, grove: 0.7, byWater: { reachM: 140, boost: 1, only: true }, ...TREES },
        2,
        [0.8, 1.2],
        0.25,
      ),
      tall('rock', ROCK, { chance: 0.07, ...ROCKS }, 2, [0.7, 1.7], 1.2),
      low('sagebrush', SHRUB, { chance: 0.025, grove: 0.4, ...LOW }, 1, [0.7, 1.3], 0.5),
      low('dry grass', GRASS, { chance: 0.07, grove: 0.3, ...LOW }, 1, [0.7, 1.3], 0.2),
    ],
  }),
  tundra: () => ({
    keepAtReach: 0.8,
    kinds: [
      tall('spruce', SMALL_TREE, { chance: 0.04, grove: 0.95, ...TREES, snowLineM: -250 }, 2, [0.7, 1.3], 0.2),
      tall('dead tree', SMALL_TREE, { chance: 0.012, grove: 0.5, ...TREES, snowLineM: -100 }, 2, [0.7, 1.3], 0.3),
      tall('snowy rock', ROCK, { chance: 0.08, ...ROCKS }, 2, [0.8, 1.8], 1.2),
      low('dwarf shrub', SHRUB, { chance: 0.12, grove: -0.3, ...LOW, snowLineM: -60 }, 1, [0.7, 1.4], 0.4),
    ],
  }),
};
