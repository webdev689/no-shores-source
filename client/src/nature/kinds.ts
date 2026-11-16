import type { Colour } from './shapes.ts';
import { conifer, type Plant } from './trees.ts';
import { rock, tuft } from './undergrowth.ts';

/** Trees, palms, cacti and boulders stand in the tall layer's 8 m slots; shrubs, grass, ferns and reeds in the low
 *  layer's 4 m slots, round the tall ones' feet. */
export type Layer = 'tall' | 'low';

/** Where a kind grows, and how thickly. */
export interface Growth {
  /** The chance a slot of its layer holds one where the ground suits it best. */
  readonly chance: number;
  /** The slopes it grows on (rise over run): from the first, fading out past the second. */
  readonly slopes: readonly [number, number];
  /** How it follows the groves: 1 gathers in them, 0 spreads evenly, -1 keeps to the clearings between them. */
  readonly grove: number;
  /** Thicker near the coast or fresh water, up to `boost` times within `reachM`; with `only`, nowhere else. */
  readonly byWater?: { readonly reachM: number; readonly boost: number; readonly only?: boolean };
  /** The lowest ground it stands on, metres: trees keep off the beach, reeds and mangroves do not. */
  readonly lowestM: number;
  /** How far above (+) or below (-) the snow line it still grows, metres. */
  readonly snowLineM: number;
}

/** How far a kind is drawn: its near mesh to `nearM` (crossfading into its far mesh), nothing past `reachM`. */
export interface Reach {
  readonly nearM: number;
  readonly reachM: number;
  /** How far its top sways in the wind, metres, at size 1. */
  readonly swayM: number;
}

/** One kind of plant or rock in a biome's cast. */
export interface Kind extends Reach {
  readonly name: string;
  readonly layer: Layer;
  readonly growth: Growth;
  /** The same kind grown a few ways; each instance takes one. */
  readonly plants: readonly Plant[];
  /** The least and most it is scaled by. */
  readonly sizes: readonly [number, number];
  /** Its trunk's or footprint's radius, metres, at size 1: nothing low grows inside it. */
  readonly footM: number;
}

/** A biome's cast, and how far its far trees thin out: the share still drawn at the edge, each widened to fill in. */
export interface Cast {
  readonly kinds: readonly Kind[];
  readonly keepAtReach: number;
}

export const TREE: Reach = { nearM: 700, reachM: 3000, swayM: 0.3 };
export const SMALL_TREE: Reach = { nearM: 450, reachM: 2000, swayM: 0.2 };
export const ROCK: Reach = { nearM: 350, reachM: 1800, swayM: 0 };
export const SHRUB: Reach = { nearM: 200, reachM: 700, swayM: 0.06 };
export const GRASS: Reach = { nearM: Infinity, reachM: 160, swayM: 0.1 };
export const TREE_FERN: Reach = { nearM: 300, reachM: 900, swayM: 0.15 };

/** Trees keep off the beach, below the snow line by a margin. */
export const TREES = { slopes: [0, 0.6], lowestM: 2, snowLineM: -300 } as const;
export const ROCKS = { slopes: [0.22, 4], grove: 0, lowestM: 0.5, snowLineM: 1e5 } as const;
export const LOW = { slopes: [0, 0.75], lowestM: 1.2, snowLineM: -120 } as const;

export const tall = (
  name: string,
  reach: Reach,
  growth: Growth,
  plants: Plant[],
  sizes: [number, number],
  footM: number,
): Kind => ({
  name,
  layer: 'tall',
  growth,
  plants,
  sizes,
  footM,
  ...reach,
});
export const low = (
  name: string,
  reach: Reach,
  growth: Growth,
  plants: Plant[],
  sizes: [number, number],
  footM: number,
): Kind => ({
  ...tall(name, reach, growth, plants, sizes, footM),
  layer: 'low',
});

export const twice = (grow: (seed: number) => Plant, seed: number): Plant[] => [grow(seed), grow(seed + 101)];
export const boulders = (seed: number, stone: Colour, cap?: { colour: Colour; from: number }): Plant[] => [
  rock({ seed, size: [1.6, 1.3, 1.1], stone, ...(cap ? { cap } : {}) }),
  rock({ seed: seed + 7, size: [2.6, 2.0, 1.5], stone, ...(cap ? { cap } : {}) }),
];
export const meadow = (seed: number, height: number, foot: Colour, tip: Colour, blades = 8): Plant[] => [
  tuft({ seed, blades, height, spread: height * 0.35, width: 0.07, foot, tip }),
];

export const FIR_BARK: Colour = [0.3, 0.24, 0.2];
export const FIR: Colour = [0.11, 0.25, 0.19];
export const firs = (seed: number) =>
  twice(
    (each) => conifer({ seed: each, height: 18, width: 6, tiers: 6, skirt: 0.07, bark: FIR_BARK, needles: FIR }),
    seed,
  );

/** The nine casts, by the biome's key in the layout. Each is made the first time a landmass of it is drawn. */
