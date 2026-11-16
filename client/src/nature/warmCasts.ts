import {
  boulders,
  type Cast,
  GRASS,
  LOW,
  low,
  meadow,
  ROCK,
  ROCKS,
  SHRUB,
  SMALL_TREE,
  tall,
  TREE,
  TREE_FERN,
  TREES,
  twice,
} from './kinds.ts';
import { broadleaf, cypress, mangrove } from './trees.ts';
import { fern, shrub } from './undergrowth.ts';
import { acacia, baobab, cactus, palm } from './warmTrees.ts';

/** The casts of the warmer biomes, by their keys in the layout. */
export const WARM_CASTS: Readonly<Record<string, () => Cast>> = {
  desert: () => ({
    keepAtReach: 0.9,
    kinds: [
      tall(
        'cactus',
        SMALL_TREE,
        { chance: 0.014, grove: 0.3, byWater: { reachM: 300, boost: 3 }, ...TREES, slopes: [0, 0.45] },
        twice((seed) => cactus(seed, 6.5, [0.32, 0.48, 0.26]), 14),
        [0.6, 1.3],
        0.4,
      ),
      tall(
        'date palm',
        TREE,
        { chance: 0.3, grove: 0.3, byWater: { reachM: 90, boost: 1, only: true }, ...TREES, lowestM: 0.8 },
        twice(
          (seed) =>
            palm({
              seed,
              height: 12,
              bow: 1.2,
              fronds: 11,
              frondLength: 4.2,
              bark: [0.48, 0.38, 0.27],
              leaves: [0.33, 0.48, 0.2],
            }),
          24,
        ),
        [0.8, 1.2],
        0.35,
      ),
      tall(
        'red rock',
        ROCK,
        { chance: 0.1, ...ROCKS, slopes: [0.16, 4] },
        boulders(34, [0.7, 0.38, 0.24]),
        [0.8, 2.2],
        1.2,
      ),
      low(
        'dry shrub',
        SHRUB,
        { chance: 0.014, grove: 0, byWater: { reachM: 250, boost: 4 }, ...LOW },
        [
          shrub({
            seed: 44,
            width: 1.2,
            height: 0.8,
            lumps: 3,
            leaves: [0.5, 0.48, 0.32],
            fleck: { colour: [0.42, 0.33, 0.24], share: 0.3 },
          }),
        ],
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
        { chance: 0.025, grove: 0.6, byWater: { reachM: 300, boost: 3 }, ...TREES },
        twice((seed) => acacia(seed, [0.28, 0.23, 0.18], [0.34, 0.42, 0.15]), 15),
        [0.8, 1.3],
        0.35,
      ),
      tall(
        'baobab',
        TREE,
        { chance: 0.005, grove: 0, ...TREES },
        [baobab(25, [0.56, 0.49, 0.42], [0.4, 0.48, 0.19])],
        [0.8, 1.15],
        2.2,
      ),
      tall('boulder', ROCK, { chance: 0.06, ...ROCKS }, boulders(35, [0.66, 0.5, 0.36]), [0.8, 1.8], 1.2),
      low(
        'tall grass',
        GRASS,
        { chance: 0.26, grove: 0.5, ...LOW },
        meadow(55, 1.3, [0.62, 0.55, 0.28], [0.88, 0.78, 0.45], 10),
        [0.7, 1.3],
        0.25,
      ),
      low(
        'thorn bush',
        SHRUB,
        { chance: 0.015, grove: 0.3, byWater: { reachM: 300, boost: 2 }, ...LOW },
        [shrub({ seed: 45, width: 2.0, height: 1.2, lumps: 5, leaves: [0.42, 0.44, 0.22] })],
        [0.7, 1.3],
        0.8,
      ),
    ],
  }),
  rainforest: () => ({
    keepAtReach: 0.15,
    kinds: [
      tall(
        'giant',
        TREE,
        { chance: 0.08, grove: 0.2, ...TREES },
        twice(
          (seed) =>
            broadleaf({
              seed,
              height: 32,
              trunkRadius: 0.85,
              crownAt: 25,
              crown: [6.5, 6.5, 3.6],
              lobes: 6,
              lobe: 3.4,
              bark: [0.52, 0.48, 0.4],
              leaves: [0.2, 0.38, 0.12],
              fins: 3,
            }),
          16,
        ),
        [0.8, 1.2],
        1.4,
      ),
      tall(
        'canopy tree',
        TREE,
        { chance: 0.5, grove: 0.3, ...TREES },
        twice(
          (seed) =>
            broadleaf({
              seed,
              height: 17,
              trunkRadius: 0.45,
              crownAt: 12.5,
              crown: [5.2, 5.2, 3.0],
              lobes: 6,
              lobe: 2.5,
              bark: [0.4, 0.36, 0.28],
              leaves: [0.13, 0.34, 0.1],
            }),
          36,
        ),
        [0.7, 1.35],
        0.6,
      ),
      tall(
        'palm',
        TREE,
        { chance: 0.08, grove: 0.2, byWater: { reachM: 400, boost: 3 }, ...TREES, lowestM: 0.8 },
        twice(
          (seed) =>
            palm({
              seed,
              height: 15,
              bow: 2.2,
              fronds: 10,
              frondLength: 4.8,
              bark: [0.42, 0.36, 0.28],
              leaves: [0.24, 0.48, 0.14],
            }),
          26,
        ),
        [0.75, 1.25],
        0.35,
      ),
      low(
        'tree fern',
        TREE_FERN,
        { chance: 0.1, grove: 0.4, ...LOW },
        twice((seed) => fern(seed, 2.4, [0.2, 0.46, 0.13], 3), 56),
        [0.7, 1.3],
        0.4,
      ),
      low(
        'understory',
        SHRUB,
        { chance: 0.2, grove: 0.2, ...LOW },
        [
          shrub({
            seed: 46,
            width: 2.2,
            height: 1.6,
            lumps: 4,
            leaves: [0.16, 0.4, 0.12],
          }),
        ],
        [0.7, 1.4],
        0.9,
      ),
    ],
  }),
  swamp: () => ({
    keepAtReach: 0.25,
    kinds: [
      tall(
        'cypress',
        TREE,
        { chance: 0.18, grove: 0.6, byWater: { reachM: 200, boost: 2 }, ...TREES, lowestM: 0.6 },
        twice((seed) => cypress(seed, 20, [0.4, 0.32, 0.25], [0.24, 0.33, 0.15]), 18),
        [0.75, 1.2],
        1.0,
      ),
      tall(
        'mangrove',
        SMALL_TREE,
        { chance: 0.5, grove: 0.3, byWater: { reachM: 80, boost: 1, only: true }, ...TREES, lowestM: 0.3 },
        twice((seed) => mangrove(seed, [0.35, 0.28, 0.22], [0.16, 0.33, 0.13]), 28),
        [0.8, 1.3],
        1.6,
      ),
      low(
        'reeds',
        GRASS,
        { chance: 0.6, grove: 0.2, byWater: { reachM: 30, boost: 1, only: true }, ...LOW, lowestM: 0.2 },
        meadow(58, 2.0, [0.25, 0.4, 0.15], [0.62, 0.55, 0.3], 12),
        [0.7, 1.2],
        0.3,
      ),
      low(
        'marsh fern',
        GRASS,
        { chance: 0.1, grove: 0.4, ...LOW },
        [fern(59, 0.8, [0.22, 0.42, 0.16])],
        [0.8, 1.3],
        0.3,
      ),
    ],
  }),
};
