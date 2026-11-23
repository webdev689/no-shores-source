// A fire's parts at one moment, worked out from its seed and the clock alone, so a fire looks the same every time it
// is drawn. The clock is held in steps, as a sprite's frames are, so a fire flickers in frames rather than smoothly.
import { hashUnit, smoothNoise } from './seeded.ts';

export type Point = readonly [number, number, number];
export type Wind = readonly [number, number];

/** A fire: where its base burns (world metres), how tall its tallest flame stands, its seed, and for a fire burning
 *  along an edge (a rail, a spar, a sail's foot) the edge's run from its base, in metres. */
export interface Fire {
  readonly at: Point;
  readonly sizeM: number;
  readonly seed: number;
  readonly along?: Point;
}

/** A fire at one moment, each part in world metres: its tongues of flame, the wisps torn from their tips, its smoke,
 *  its embers, and the points its light is thrown from. */
export interface FireParts {
  /** The moment its frame stands for, which its flames' licks and tears are drawn at. */
  readonly held: number;
  readonly tongues: readonly { position: Point; height: number; width: number; lean: Wind }[];
  readonly wisps: readonly { position: Point; radius: number; heat: number }[];
  readonly smoke: readonly { position: Point; radius: number; age: number; opacity: number; warmth: number }[];
  readonly embers: readonly { position: Point; brightness: number; texels: number }[];
  readonly glows: readonly { position: Point; reach: number; strength: number }[];
}

/** How many frames a second a fire's flicker is drawn at, as a figure's sprite is. */
export const FIRE_FRAMES_PER_SECOND = 10;
/** Every part of a fire is drawn on a grid of this many texels a metre: between the ships' 40 and the figures' 62. */
export const FIRE_TEXELS_PER_METRE = 48;
/** How far a fire's light reaches from its middle, in times its height: the deck round it and whoever stands there. */
export const GLOW_REACH = 3;

const TONGUES = 6;
const WISPS_EACH = 2;
const PUFFS = 18;
const EMBERS = 20;
const EMBERS_A_METRE = 8;
const SMOKE_LIFE_S = 4.5;
const WISP_LIFE_S = 0.6;
/** A line fire is at most this many round fires long in parts, however long its edge: what bounds its instances. */
const LONGEST_RUN = 6;
const MOST_EMBERS = 160;

/** The frame of its flicker a fire shows at `seconds`. Each fire's frames turn at a moment of its own, so a deck of
 *  fires never flickers in step, and their parts are worked out a few at a time. */
export function fireFrame(fire: Fire, seconds: number): number {
  return Math.floor(seconds * FIRE_FRAMES_PER_SECOND + hashUnit(fire.seed * 7_919 + 5));
}

/** How many round fires' worth of parts a fire takes: one, or more along a burning edge. */
function runOf(fire: Fire): number {
  const length = fire.along ? Math.hypot(...fire.along) : 0;
  return Math.min(LONGEST_RUN, 1 + length / (fire.sizeM * 0.8));
}

/** The fire's parts at `seconds` in a `wind` (m/s east and south). Its tongues wander in height, sway and lean a
 *  little downwind, and throw wisps from their tips that rise and fade; its smoke rolls up in a column that widens,
 *  thins and leans further; its embers swirl up in the heat and burn out. Along an edge, all of it spreads along. */
export function fireParts(fire: Fire, seconds: number, wind: Wind): FireParts {
  const { at, sizeM: size, seed } = fire;
  const held = fireFrame(fire, seconds) / FIRE_FRAMES_PER_SECOND;
  const lot = (salt: number) => hashUnit(seed * 7_919 + salt);
  const run = runOf(fire);
  const along = fire.along ?? ([0, 0, 0] as Point);
  const spot = (share: number, scatter: number, angle: number): Point => [
    at[0] + along[0] * share + Math.cos(angle) * scatter,
    at[1] + along[1] * share + Math.sin(angle) * scatter,
    at[2] + along[2] * share,
  ];
  const rise = 0.6 + 0.9 * Math.sqrt(size);

  const tongueCount = Math.round(TONGUES * run);
  const tongues = Array.from({ length: tongueCount }, (_slot, index) => {
    const core = index % TONGUES === 0;
    const share = fire.along ? (index + 0.5 + (lot(1_000 + index) - 0.5) * 0.8) / tongueCount : 0;
    const out = core && !fire.along ? 0 : size * 0.3 * lot(2_000 + index);
    const flicker = smoothNoise(seed * 13 + index, held * 3.2 + lot(3_000 + index) * 50);
    const sway = (salt: number) => (smoothNoise(seed * 17 + index * 2 + salt, held * 1.4) - 0.5) * 0.4;
    return {
      position: spot(share, out, lot(4_000 + index) * Math.PI * 2),
      height: size * (0.55 + 0.45 * flicker) * (core ? 1 : 0.6 + 0.2 * lot(5_000 + index)),
      width: size * (core ? 0.26 : 0.17),
      lean: [wind[0] * 0.04 + sway(0), wind[1] * 0.04 + sway(1)] as Wind,
    };
  });

  const wisps = tongues.flatMap((tongue, index) =>
    Array.from({ length: WISPS_EACH }, (_slot, which) => {
      const age = (held / WISP_LIFE_S + which / WISPS_EACH + lot(6_000 + index * WISPS_EACH + which)) % 1;
      const tip = tongue.height * (0.85 + age * 0.9);
      const drift = (smoothNoise(seed * 31 + index * 5 + which, held * 2) - 0.5) * tongue.width;
      return {
        position: [
          tongue.position[0] + tongue.lean[0] * tip + drift + wind[0] * age * 0.08,
          tongue.position[1] + tongue.lean[1] * tip + wind[1] * age * 0.08,
          tongue.position[2] + tip,
        ] as Point,
        radius: tongue.width * 0.4 * (1 - age * 0.6),
        heat: 0.8 * (1 - age),
      };
    }),
  );

  const puffCount = Math.round(PUFFS * run);
  const smoke = Array.from({ length: puffCount }, (_slot, index) => {
    const lived = held / SMOKE_LIFE_S + index / puffCount + lot(7_000 + index);
    const age = lived % 1;
    const from = hashUnit(seed * 104_729 + index * 977 + Math.floor(lived));
    const aloft = age * SMOKE_LIFE_S;
    const swirl = size * 0.3 * Math.sin(aloft * 1.7 + index);
    const base = spot(fire.along ? from : 0, 0, 0);
    return {
      position: [
        base[0] + wind[0] * aloft * 0.7 + swirl,
        base[1] + wind[1] * aloft * 0.7 + swirl * 0.6,
        base[2] + size * 0.8 + aloft * rise,
      ] as Point,
      radius: size * (0.3 + 1.1 * age),
      age,
      opacity: 0.9 * Math.min(1, age * 6) * (1 - age) ** 0.6,
      warmth: Math.max(0, 1 - age * 3.5),
    };
  });
  smoke.sort((first, second) => second.age - first.age);

  const emberCount = Math.min(MOST_EMBERS, Math.round((EMBERS + EMBERS_A_METRE * size) * run));
  const embers = Array.from({ length: emberCount }, (_slot, index) => {
    const life = 1.1 + 0.9 * lot(8_000 + index);
    const lived = held / life + index / emberCount + lot(9_000 + index);
    const age = lived % 1;
    const from = hashUnit(seed * 15_485 + index * 613 + Math.floor(lived));
    const aloft = age * life;
    const angle = lot(10_000 + index) * Math.PI * 2 + aloft * (2 + 2 * lot(11_000 + index));
    const out = size * 0.3 * (0.3 + age);
    const base = spot(fire.along ? from : 0, out, angle);
    return {
      position: [
        base[0] + wind[0] * aloft * 0.6,
        base[1] + wind[1] * aloft * 0.6,
        base[2] + size * 0.3 + aloft * (rise + 0.4),
      ] as Point,
      brightness: (1 - age) ** 1.2 * (0.7 + 0.3 * smoothNoise(seed + index, held * 9)),
      texels: lot(12_000 + index) < 0.3 ? 2 : 1,
    };
  });

  const strength = Math.max(...tongues.map((tongue) => tongue.height)) / size;
  const reach = size * GLOW_REACH;
  const glowCount = fire.along ? Math.min(LONGEST_RUN, Math.ceil(Math.hypot(...along) / reach)) + 1 : 1;
  const glows = Array.from({ length: glowCount }, (_slot, index) => {
    const base = spot(glowCount === 1 ? 0 : index / (glowCount - 1), 0, 0);
    return { position: [base[0], base[1], base[2] + size * 0.5] as Point, reach, strength };
  });
  return { held, tongues, wisps, smoke, embers, glows };
}

/** Whether `point` stands within `margin` metres of `fire`'s smoke column in `wind`: of the room its puffs roll
 *  through over their life, as `fireParts` lays them, each puff at its widest swirl. A camera keeps out of it. */
export function inSmoke(fire: Fire, wind: Wind, point: Point, margin: number): boolean {
  const { at, sizeM: size } = fire;
  const along = fire.along ?? ([0, 0, 0] as Point);
  const rise = 0.6 + 0.9 * Math.sqrt(size);
  for (let age = 0; age <= 1.0001; age += 0.05) {
    const aloft = age * SMOKE_LIFE_S;
    // Its puff's middle at this age from the base's end nearest the point, the swirl and the wobble of a step between.
    const [x, y, z] = [at[0] + wind[0] * aloft * 0.7, at[1] + wind[1] * aloft * 0.7, at[2] + size * 0.8 + aloft * rise];
    const length2 = along[0] ** 2 + along[1] ** 2 + along[2] ** 2;
    const share =
      length2 > 0
        ? Math.min(
            1,
            Math.max(0, ((point[0] - x) * along[0] + (point[1] - y) * along[1] + (point[2] - z) * along[2]) / length2),
          )
        : 0;
    const apart = Math.hypot(
      point[0] - x - along[0] * share,
      point[1] - y - along[1] * share,
      point[2] - z - along[2] * share,
    );
    const reach =
      size * (0.3 + 1.1 * age) + size * 0.35 + (Math.hypot(wind[0], wind[1]) * 0.7 + rise) * 0.05 * SMOKE_LIFE_S;
    if (apart <= reach + margin) return true;
  }
  return false;
}
