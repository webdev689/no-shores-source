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
  /** How many forms the same kind is grown in (content/nature/flora.json bakes each); each instance takes one. */
  readonly forms: number;
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

/** Past its near range a plant is a sprite, its baked mesh's triangles kept for where they show; trees are drawn out
 *  to 6 km. */
export const TREE: Reach = { nearM: 300, reachM: 6000, swayM: 0.3 };
export const SMALL_TREE: Reach = { nearM: 220, reachM: 2000, swayM: 0.2 };
export const ROCK: Reach = { nearM: 200, reachM: 1800, swayM: 0 };
export const SHRUB: Reach = { nearM: 120, reachM: 700, swayM: 0.06 };
export const GRASS: Reach = { nearM: Infinity, reachM: 160, swayM: 0.1 };
export const TREE_FERN: Reach = { nearM: 150, reachM: 900, swayM: 0.15 };

/** Trees keep off the beach, below the snow line by a margin. */
export const TREES = { slopes: [0, 0.6], lowestM: 2, snowLineM: -300 } as const;
export const ROCKS = { slopes: [0.22, 4], grove: 0, lowestM: 0.5, snowLineM: 1e5 } as const;
export const LOW = { slopes: [0, 0.75], lowestM: 1.2, snowLineM: -120 } as const;

export const tall = (
  name: string,
  reach: Reach,
  growth: Growth,
  forms: number,
  sizes: [number, number],
  footM: number,
): Kind => ({
  name,
  layer: 'tall',
  growth,
  forms,
  sizes,
  footM,
  ...reach,
});
export const low = (
  name: string,
  reach: Reach,
  growth: Growth,
  forms: number,
  sizes: [number, number],
  footM: number,
): Kind => ({
  ...tall(name, reach, growth, forms, sizes, footM),
  layer: 'low',
});
