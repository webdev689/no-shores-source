// A lit city's lights as the page draws them ([[Overlook's City Below Is Lit at Night, in Detail]]): each kind's post
// and flame, the glowing points that make them read from afar (`glowPoints.ts`), and the pools of light they lay on
// the paving and the walls round them, written once into a light map of the city when it is built and read by its
// shaders at night, so thousands of lamps cost no loop a pixel and none of the sky's sixteen lamps.
import type { GlowPoint } from '../sky/glowPoints.ts';
import { seedAt } from '../sky/lamps.ts';
import type { MeshData } from './mesh.ts';
import type { CityLight, Solid } from './plan.ts';
import { solidModel } from './solidModel.ts';

/** Each kind of light: how high its flame burns over its post's foot, its light's colour (linear), its glow's size
 *  across, and how far its pool of light reaches on the ground round it, metres. The harbour mouth's is the tallest
 *  and brightest, so the way in reads from the sea. */
export const LIGHT_LOOKS = {
  lamp: { flameM: 3.1, colour: [1.0, 0.66, 0.32], sizeM: 0.7, poolM: 9 },
  lantern: { flameM: 2.3, colour: [1.0, 0.62, 0.3], sizeM: 0.6, poolM: 8 },
  mouth: { flameM: 5.4, colour: [1.0, 0.74, 0.44], sizeM: 1.4, poolM: 14 },
} as const satisfies Record<CityLight['kind'], unknown>;

/** The kinds in the order their posts' models are laid after the city's others. */
export const LIGHT_KINDS = ['lamp', 'lantern', 'mouth'] as const;

/** The sea's level, metres: what a lantern's light lies on under it. */
const SEA_M = 0;

/** The glowing point of each light, at its flame; a lantern's and the mouth's over the water with their column on it. */
export function glowsOf(lights: readonly CityLight[]): GlowPoint[] {
  return lights.map((light) => {
    const look = LIGHT_LOOKS[light.kind];
    const flame = light.at[2] + look.flameM;
    return {
      at: [light.at[0], light.at[1], flame],
      colour: look.colour,
      sizeM: look.sizeM,
      // Seeded by where it stands, as every lantern on land is (`seedAt`).
      seed: seedAt([light.at[0], light.at[1], flame]),
      ...(light.kind === 'lamp' ? {} : { overWaterM: flame - SEA_M }),
    };
  });
}

/** Each kind's post as a forged model's mesh, a model's frame at its foot: an iron post, its lantern burning in the
 *  glow's layer and an iron cap over it. */
export function postMeshes(iron: number, glow: number): MeshData[] {
  return LIGHT_KINDS.map((kind) => {
    const flame = LIGHT_LOOKS[kind].flameM;
    const wide = kind === 'mouth' ? 1.8 : 1;
    const lantern = 0.42 * wide;
    const still = { turn: 0, lean: 0, roll: 0 };
    const post: Solid = {
      shape: 'column',
      sides: 6,
      top: 0.7,
      at: [0, 0, 0],
      size: [0.16 * wide, 0.16 * wide, flame - lantern / 2],
      material: 'iron',
      ...still,
    };
    const flameBox: Solid = {
      shape: 'block',
      at: [0, 0, flame - lantern / 2],
      size: [lantern * 0.75, lantern * 0.75, lantern],
      material: 'glow',
      ...still,
    };
    const cap: Solid = {
      shape: 'pyramid',
      top: 0.1,
      at: [0, 0, flame + lantern / 2],
      size: [lantern, lantern, lantern * 0.45],
      material: 'iron',
      ...still,
    };
    return solidModel([
      { solid: post, layer: iron },
      { solid: flameBox, layer: glow },
      { solid: cap, layer: iron },
    ]);
  });
}

/** Metres a texel of the light map covers each way: half a ground tile, fine enough for a pool some ten metres across
 *  seen from the parapet or the sea. */
export const POOL_TEXEL_M = 3.2;
/** Rows of the light map are a multiple of this many texels (WebGPU's 256 bytes a row, one byte a texel). */
const ROW_TEXELS = 256;

/** The light map: how lit each texel's ground is by the lamps round it (0 to 255), row by row from its north-west
 *  corner, which stands `west`, `north` from the city's middle; `width` texels a row (padded), `height` rows. */
export interface PoolMap {
  readonly texels: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly west: number;
  readonly north: number;
}

/** The light map of `lights` round the city's middle `origin`, a step a few hundred lights: each lamp's pool falls
 *  off as the square of the way out to its reach, pools adding where they meet, and the sum held to full. Null with no
 *  lights. */
export function* poolMapSteps(
  lights: readonly CityLight[],
  origin: readonly [number, number],
): Generator<void, PoolMap | null> {
  if (!lights.length) return null;
  const most = Math.max(...Object.values(LIGHT_LOOKS).map((look) => look.poolM));
  let [west, north, east, south] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { at } of lights) {
    [west, north] = [Math.min(west, at[0] - origin[0]), Math.min(north, at[1] - origin[1])];
    [east, south] = [Math.max(east, at[0] - origin[0]), Math.max(south, at[1] - origin[1])];
  }
  [west, north] = [west - most - POOL_TEXEL_M, north - most - POOL_TEXEL_M];
  const width = Math.ceil((east + most + POOL_TEXEL_M - west) / POOL_TEXEL_M / ROW_TEXELS) * ROW_TEXELS;
  const height = Math.ceil((south + most + POOL_TEXEL_M - north) / POOL_TEXEL_M);
  // each texel's light, held to full as it is added (a clamped byte rounds and holds each sum)
  const lit = new Uint8ClampedArray(width * height);
  yield;
  for (let index = 0; index < lights.length; index++) {
    const light = lights[index] as CityLight;
    const reach = LIGHT_LOOKS[light.kind].poolM;
    const [x, y] = [(light.at[0] - origin[0] - west) / POOL_TEXEL_M, (light.at[1] - origin[1] - north) / POOL_TEXEL_M];
    const texels = reach / POOL_TEXEL_M;
    for (let row = Math.max(0, Math.floor(y - texels)); row <= Math.min(height - 1, Math.ceil(y + texels)); row++)
      for (
        let column = Math.max(0, Math.floor(x - texels));
        column <= Math.min(width - 1, Math.ceil(x + texels));
        column++
      ) {
        // a texel's middle, as the GPU's filtering reads it
        const out = Math.hypot(column + 0.5 - x, row + 0.5 - y) / texels;
        if (out < 1) lit[row * width + column] = (lit[row * width + column] ?? 0) + (1 - out) * (1 - out) * 255;
      }
    if (index % 200 === 199) yield;
  }
  return { texels: new Uint8Array(lit.buffer), width, height, west, north };
}
