import { type Cast, GRASS, LOW, low, ROCK, ROCKS, SHRUB, SMALL_TREE, tall, TREE, TREE_FERN, TREES } from './kinds.ts';

/** The casts of the warmer biomes, by their keys in the layout. Their forms are baked by tools/flora (species.py
 *  names the same kinds in the same order, with the same number of forms). */
export const WARM_CASTS: Readonly<Record<string, () => Cast>> = {
  desert: () => ({
    keepAtReach: 0.9,
    kinds: [
      tall(
        'cactus',
        SMALL_TREE,
        { chance: 0.014, grove: 0.6, byWater: { reachM: 300, boost: 3 }, ...TREES, slopes: [0, 0.45] },
        2,
        [0.6, 1.3],
        0.4,
      ),
      tall(
        'date palm',
        TREE,
        { chance: 0.3, grove: 0.3, byWater: { reachM: 90, boost: 1, only: true }, ...TREES, lowestM: 0.8 },
        2,
        [0.8, 1.2],
        0.35,
      ),
      tall('red rock', ROCK, { chance: 0.1, ...ROCKS, slopes: [0.16, 4] }, 2, [0.8, 2.2], 1.2),
      low(
        'dry shrub',
        SHRUB,
        { chance: 0.014, grove: 0, byWater: { reachM: 250, boost: 4 }, ...LOW },
        1,
        [0.6, 1.3],
        0.5,
      ),
    ],
  }),
  savanna: () => ({
    keepAtReach: 0.8,
    kinds: [
      tall(
        'acacia',
        TREE,
        { chance: 0.025, grove: 0.9, byWater: { reachM: 300, boost: 3 }, ...TREES },
        2,
        [0.8, 1.3],
        0.35,
      ),
      tall('baobab', TREE, { chance: 0.005, grove: 0.5, ...TREES }, 1, [0.8, 1.15], 2.2),
      tall('boulder', ROCK, { chance: 0.06, ...ROCKS }, 2, [0.8, 1.8], 1.2),
      low('tall grass', GRASS, { chance: 0.26, grove: 0.5, ...LOW }, 1, [0.7, 1.3], 0.25),
      low(
        'thorn bush',
        SHRUB,
        { chance: 0.015, grove: 0.3, byWater: { reachM: 300, boost: 2 }, ...LOW },
        1,
        [0.7, 1.3],
        0.8,
      ),
    ],
  }),
  rainforest: () => ({
    keepAtReach: 0.15,
    kinds: [
      tall('giant', TREE, { chance: 0.08, grove: 0.5, ...TREES }, 2, [0.85, 1.2], 1.4),
      // Three canopy trees of their own heights, spreads and greens, their flat crowns overlapping: never one even
      // carpet, never caps on poles.
      tall('canopy tree', TREE, { chance: 0.5, grove: 0.5, ...TREES }, 3, [0.75, 1.3], 0.6),
      tall(
        'palm',
        TREE,
        { chance: 0.08, grove: 0.5, byWater: { reachM: 400, boost: 2 }, ...TREES, lowestM: 0.8 },
        2,
        [0.75, 1.25],
        0.35,
      ),
      low('tree fern', TREE_FERN, { chance: 0.14, grove: 0.4, ...LOW }, 2, [0.7, 1.3], 0.4),
      low('understory', SHRUB, { chance: 0.3, grove: 0.2, ...LOW }, 1, [0.7, 1.4], 0.9),
    ],
  }),
  swamp: () => ({
    keepAtReach: 0.25,
    kinds: [
      tall(
        'cypress',
        TREE,
        { chance: 0.18, grove: 0.9, byWater: { reachM: 200, boost: 2 }, ...TREES, lowestM: 0.6 },
        2,
        [0.75, 1.2],
        1.0,
      ),
      tall(
        'mangrove',
        SMALL_TREE,
        { chance: 0.5, grove: 0.6, byWater: { reachM: 80, boost: 1, only: true }, ...TREES, lowestM: 0.3 },
        2,
        [0.8, 1.3],
        1.6,
      ),
      low(
        'reeds',
        GRASS,
        { chance: 0.6, grove: 0.2, byWater: { reachM: 30, boost: 1, only: true }, ...LOW, lowestM: 0.2 },
        1,
        [0.7, 1.2],
        0.3,
      ),
      low('marsh fern', GRASS, { chance: 0.1, grove: 0.4, ...LOW }, 1, [0.8, 1.3], 0.3),
    ],
  }),
};
