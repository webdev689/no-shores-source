// A port city's plan as the city crate serialises it, and the climate its pictures are drawn in. The land worker hands
// the plan over as JSON; this layer only reads it.
import type { RockShape } from '../rules/rockMesh.ts';
import { FIRELIGHT, type LampPlace } from '../sky/lamps.ts';
import type { Climate, Season } from '../textures/picture.ts';

/** A cell's side in metres: one RMB block. */
export const CELL_M = 102.4;

/** A solid's shape and what it takes: a column's faces round and its top's share of its base, a dome's faces round,
 *  a frustum's top share, an arch's opening as a share of its height, a natural rock's seed (../rules/rockMesh.ts),
 *  a module's surface group (./modules.ts). */
export type SolidShape =
  | { readonly shape: 'block' }
  | { readonly shape: 'column'; readonly sides: number; readonly top: number }
  | { readonly shape: 'dome'; readonly sides: number }
  | { readonly shape: 'pyramid'; readonly top: number }
  | { readonly shape: 'gable' }
  | { readonly shape: 'arch'; readonly opening: number }
  | { readonly shape: 'module'; readonly module: number; readonly group: number }
  | RockShape;

export type SolidMaterial =
  | 'stone'
  | 'trim'
  | 'roof'
  | 'timber'
  | 'plaster'
  | 'paving'
  | 'gold'
  | 'iron'
  | 'bone'
  | 'glow'
  | 'rubble'
  | 'chalk'
  | ClothMaterial;

/** Cloth's plain dyed colours (the city crate's `Material`): linen, crimson, verdant, black, straw, and each
 *  faction's dye. */
export type ClothMaterial =
  'linen' | 'crimson' | 'verdant' | 'black' | 'straw' | 'stormcaller_blue' | 'lamplighter_gold' | 'veiled_dusk';

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
  /** 'pieces' holds models already placed in the world (a layout's): levelled for the tiers, with no plate. */
  readonly use: 'open' | 'landmark' | 'avenue' | 'block' | 'pieces';
  readonly district?: string;
  readonly block?: string;
};

export type Pad = { readonly bounds: readonly [number, number, number, number]; readonly level: number };

/** A forged model already placed in the world: its id, whether it is a building, its origin (east, south, up) and
 *  its yaw in degrees clockwise from north. */
export type Piece = {
  readonly model: number;
  readonly building: boolean;
  /** A building walked into: its doorways stand open. */
  readonly open?: boolean;
  readonly at: readonly [number, number, number];
  readonly yaw: number;
};

/** A ground picture laid on the land: four corners in world metres (north-west, north-east, south-east, south-west,
 *  on the ground), each corner's UV in pictures, and the ground record whose picture it wears. */
export type Decal = {
  readonly corners: readonly (readonly [number, number, number])[];
  readonly uvs: readonly (readonly [number, number])[];
  readonly record: number;
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
  /** Models placed in the world and pictures laid on the land, beside the blocks the cells stand. */
  readonly pieces?: readonly Piece[];
  readonly decals?: readonly Decal[];
  /** Round ground kept clear of the wild: a camp's floor, a landing's shore, an arena. */
  readonly clearings?: readonly { readonly at: readonly [number, number]; readonly radius: number }[];
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
 *  swings out where it leans or rolls: never less than the city crate's `Solid::bounds`. */
export function solidReach(solid: Solid): number {
  const swing = Math.max(Math.abs(Math.sin(solid.lean)), Math.abs(Math.sin(solid.roll)));
  return Math.hypot(solid.size[0], solid.size[1]) / 2 + solid.size[2] * swing;
}

/** Every glowing solid of a city (its Beacon, its stations' and courtyards' lanterns) as a place that gives light, from
 *  the middle of the solid: a lantern's light reaches some ten metres, a great fire's more, up to sixty. */
export function glowLamps(plan: CityPlan): LampPlace[] {
  const solids = [...plan.landmark, ...plan.works, ...plan.social.solids];
  return solids
    .filter((solid) => solid.material === 'glow')
    .map((solid, index) => {
      const largest = Math.max(...solid.size);
      const strength = Math.min(1.3, 1 + largest / 40);
      return {
        at: [solid.at[0], solid.at[1], solid.at[2] + solid.size[2] / 2],
        reachM: Math.min(60, 9 + 2 * largest),
        light: [FIRELIGHT[0] * strength, FIRELIGHT[1] * strength, FIRELIGHT[2] * strength],
        seed: index * 0.618,
      };
    });
}
