// A city's plan as the city crate serialises it, a port city's or a ruin's, and the climate its pictures are drawn in. The land worker hands
// the plan over as JSON; this layer only reads it.
import type { Climate, Season } from '../textures/picture.ts';

/** A cell's side in metres: one RMB block. */
export const CELL_M = 102.4;

/** A solid's shape and what it takes: a column's faces round and its top's share of its base, a dome's faces round,
 *  a frustum's top share, an arch's opening as a share of its height. */
export type SolidShape =
  | { readonly shape: 'block' }
  | { readonly shape: 'column'; readonly sides: number; readonly top: number }
  | { readonly shape: 'dome'; readonly sides: number }
  | { readonly shape: 'pyramid'; readonly top: number }
  | { readonly shape: 'gable' }
  | { readonly shape: 'arch'; readonly opening: number };

export type SolidMaterial =
  'stone' | 'trim' | 'roof' | 'timber' | 'plaster' | 'paving' | 'gold' | 'iron' | 'bone' | 'glow' | 'rubble';

/** One solid: the middle of its base in world metres (z up), its width, depth and height, its turn clockwise from
 *  north (its own x east and y south at 0), its lean toward its own +y and its roll about its own y, radians. */
export type Solid = SolidShape & {
  readonly at: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly turn: number;
  readonly lean: number;
  readonly roll: number;
  readonly material: SolidMaterial;
};

/** What a cell's ground is and what stands on it. Only a levelled cell carries its level. */
export type PlanCell = {
  readonly column: number;
  readonly row: number;
  readonly ground: 'level' | 'steep' | 'shore' | 'outside';
  readonly level?: number;
  readonly use: 'open' | 'landmark' | 'avenue' | 'block';
  readonly district?: string;
  readonly block?: string;
};

export type Pad = { readonly bounds: readonly [number, number, number, number]; readonly level: number };

/** A wreck settled in a ruin's harbour (the city crate's `Wreck`): which ship, where she lies, her heading clockwise
 *  from north and her heel to starboard, radians. */
export type Wreck = {
  readonly ship: 'sloop' | 'schooner';
  readonly at: readonly [number, number];
  readonly heading: number;
  readonly heel: number;
};

export type CityPlan = {
  readonly id: string;
  readonly name: string;
  readonly motif: string;
  readonly centre: readonly [number, number];
  readonly grid: { readonly west: number; readonly north: number };
  readonly cells: readonly PlanCell[];
  readonly gates: readonly (readonly [number, number])[];
  readonly harbour: readonly [number, number] | null;
  readonly landmark: readonly Solid[];
  readonly works: readonly Solid[];
  readonly social: {
    readonly bounds: readonly [number, number, number, number];
    readonly level: number;
    readonly ring: readonly (readonly [number, number])[];
    readonly spawns: readonly (readonly [number, number])[];
    readonly solids: readonly Solid[];
  };
  readonly pads: readonly Pad[];
  /** Whether the city is a ruin, desolate and destroyed (the city crate's `ruins`); a port city's plan says false. */
  readonly ruined?: boolean;
  readonly wrecks?: readonly Wreck[];
};

/** The climate and season a city's pictures are drawn in. */
export type CityClimate = { readonly climate: Climate; readonly season: Season };

/** Each continent's biome, as the layout names it, read as Daggerfall's climate sets. The tundra takes the mountain's
 *  set without snow: its coast lies below its snow line, and roofs under snow on bare ground read wrong. */
const BIOME_CLIMATES: Readonly<Record<string, CityClimate>> = {
  'temperate-coast': { climate: 'temperate', season: 'summer' },
  woodland: { climate: 'temperate', season: 'summer' },
  highland: { climate: 'mountain', season: 'summer' },
  steppe: { climate: 'mountain', season: 'summer' },
  desert: { climate: 'desert', season: 'summer' },
  savanna: { climate: 'desert', season: 'summer' },
  rainforest: { climate: 'swamp', season: 'summer' },
  swamp: { climate: 'swamp', season: 'summer' },
  tundra: { climate: 'mountain', season: 'summer' },
};

/** The climate a continent's city is drawn in, from its biome; temperate for a biome the table does not know. */
export function cityClimate(biome: string | undefined): CityClimate {
  return BIOME_CLIMATES[biome ?? ''] ?? { climate: 'temperate', season: 'summer' };
}

/** The north-west corner of a cell in world metres. */
export function cellCorner(plan: CityPlan, cell: { column: number; row: number }): [number, number] {
  return [plan.grid.west + cell.column * CELL_M, plan.grid.north + cell.row * CELL_M];
}

/** How far a solid reaches from the middle of its base across the ground: round its base, and as far as its top
 *  swings out where it leans or rolls (the city crate's `Solid::bounds`). */
export function solidReach(solid: Solid): number {
  const swing = Math.max(Math.abs(Math.sin(solid.lean)), Math.abs(Math.sin(solid.roll)));
  return Math.hypot(solid.size[0], solid.size[1]) / 2 + solid.size[2] * swing;
}
