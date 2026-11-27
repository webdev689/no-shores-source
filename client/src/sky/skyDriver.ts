import { type SkyLaw, type SkyReading, type Strike, windBearing } from './skyLaw.ts';
import { lookOf } from './skyLook.ts';
import { type Roofing, type Shelter, shelterOver, stillServes } from './shelter.ts';
import { AFTERNOON, type Lamp, type SkyLook, type SkyUniform } from './skyUniform.ts';
import { WORLD_CLOCK, type WorldClock } from './worldClock.ts';

/** How far round the eye lightning is followed, metres, and how long a strike is kept, seconds: thunder from the
 *  edge of hearing (25 km) comes about 73 s after its flash. */
export const STRIKE_REACH_M = 40_000;
export const STRIKE_KEPT_S = 80;

/** Over this long, world seconds, the weather eases from one air into the next, as the eye boards or lands. */
export const AIR_EASE_S = 20;

/** The light on what the eye holds, against a clear afternoon's: the sky's from above, the key's on a face half turned
 *  to it, and each lamp's falling to nothing at its reach, as every lit shader takes them, held under 1.2. */
export function heldLight(look: SkyLook, lamps: readonly Lamp[]): [number, number, number] {
  const lit = (sky: SkyLook, part: number) => (sky.ambientSky[part] ?? 0) + (sky.keyLight[part] ?? 0) * 0.65 * 0.5;
  const lamped = (part: number) =>
    lamps.reduce((sum, lamp) => {
      const near = Math.max(
        0,
        1 - (lamp.fromEye[0] ** 2 + lamp.fromEye[1] ** 2 + lamp.fromEye[2] ** 2) / lamp.reachM ** 2,
      );
      return sum + (lamp.light[part] ?? 0) * near * near;
    }, 0);
  const share = (part: number) =>
    Math.min(1.2, (lit(look, part) + lamped(part)) / Math.max(1e-3, lit(AFTERNOON, part)));
  return [share(0), share(1), share(2)];
}

/** A reading `share` of the way from `from` to `to`: the weather's numbers mixed, the heavens `to`'s. */
export function mixReading(from: SkyReading, to: SkyReading, share: number): SkyReading {
  const mix = (start: number, end: number) => start + (end - start) * share;
  return {
    ...to,
    cloud: mix(from.cloud, to.cloud),
    falling: mix(from.falling, to.falling),
    snowShare: mix(from.snowShare, to.snowShare),
    storm: mix(from.storm, to.storm),
    fog: mix(from.fog, to.fog),
    sand: mix(from.sand, to.sand),
    wind: [mix(from.wind[0], to.wind[0]), mix(from.wind[1], to.wind[1])],
    gust: mix(from.gust, to.gust),
    temperatureC: mix(from.temperatureC, to.temperatureC),
    wetness: mix(from.wetness, to.wetness),
    snowCover: mix(from.snowCover, to.snowCover),
  };
}

/** The sky as the page last drew it, for whatever else reads it: the sound, the rain, the bolts. */
export interface SkyNow {
  readonly reading: SkyReading | null;
  readonly look: SkyLook;
  readonly climate: string;
  readonly eye: readonly [number, number, number];
  readonly worldS: number;
  /** Every strike within reach in the last STRIKE_KEPT_S seconds, earliest first. */
  readonly strikes: readonly Strike[];
  /** The light on what the eye holds in its hands, against a clear afternoon's (1): the sky's, the key's and the
   *  lamps' within reach, a carried flame among them. */
  readonly held: readonly [number, number, number];
  /** The way the sails' wind blows at the eye, radians clockwise from north (as a swell's bearing runs): the wind the
   *  rules sail a ship in there. Null until the law has come. */
  readonly sails: number | null;
  /** How far a lookout who sees `rangeM` by day sees a ship under this sky, `lit` or dark (`SkyLaw.nightSight`). */
  readonly sight: (rangeM: number, lit: boolean) => number;
}

/** The page's one view of the sky. */
export const SKY_NOW: { current: SkyNow } = {
  current: {
    reading: null,
    look: AFTERNOON,
    climate: 'sea',
    eye: [0, 0, 0],
    worldS: 0,
    strikes: [],
    sails: null,
    held: [1, 1, 1],
    sight: (rangeM) => rangeM,
  },
};

/** The sky a story tells in place of the world's: the moment its sun, moon and stars stand at (`hourS`), the clock
 *  its clouds drift and its strikes fall on (`worldS`), its weather over that moment's, and its own strikes. */
export interface ToldSky {
  readonly hourS: number;
  readonly worldS: number;
  readonly weather: Pick<
    SkyReading,
    'cloud' | 'falling' | 'snowShare' | 'storm' | 'fog' | 'wind' | 'gust' | 'wetness' | 'snowCover'
  >;
  readonly strikes: readonly Strike[];
}

/** The light of every strike in `strikes` at an eye at `eye` at world time `worldS`, together, at most 1. */
function flashOfAll(strikes: readonly Strike[], worldS: number, eye: readonly [number, number, number]): number {
  return Math.min(
    1,
    strikes.reduce(
      (sum, strike) => sum + flashOf(strike, worldS - strike.atS, Math.hypot(strike.x - eye[0], strike.y - eye[1])),
      0,
    ),
  );
}

/** A strike's light at an eye `distanceM` away, `ageS` after it: a bright stroke and two return strokes, gone in a
 *  third of a second, the nearest brightest; a strike in the cloud lights less than one to the ground. */
export function flashOf(strike: Strike, ageS: number, distanceM: number): number {
  if (ageS < 0 || ageS > 0.6) return 0;
  const strokes =
    Math.exp(-ageS * 14) + 0.6 * Math.exp(-Math.abs(ageS - 0.09) * 40) + 0.4 * Math.exp(-Math.abs(ageS - 0.2) * 40);
  const near = Math.max(0, 1 - distanceM / STRIKE_REACH_M);
  return strike.power * (strike.toGround ? 1 : 0.6) * near * near * Math.min(1, strokes);
}

/**
 * Reads the sky's law at the eye each frame, at the world clock's time and in the climate's air, follows the lightning
 * round it, and writes what the shaders read. Until the law has come, the sky stays the clear afternoon.
 */
export class SkyDriver {
  private law: SkyLaw | null = null;
  private readonly uniform: Pick<SkyUniform, 'write'> & Partial<Pick<SkyUniform, 'writeShelter'>>;
  /** What keeps the rain off where the player stands (a node's boxes), and the grid laid round the eye from it. */
  private roofing: readonly Roofing[] = [];
  private shelter: Shelter | null = null;
  private asked = Number.NEGATIVE_INFINITY;
  private strikes: Strike[] = [];
  /** The air the weather was last read in, the reading last shown, and an easing from one air into the next. */
  private air: { climate: string; shown: SkyReading } | null = null;
  private easing: { from: SkyReading; since: number } | null = null;
  /** The sky a story tells, in place of the world's, while it does; and whether it did last frame. */
  told: ToldSky | null = null;
  private wasTold = false;

  private readonly clock: Pick<WorldClock, 'seconds'>;

  constructor(
    law: Promise<SkyLaw>,
    uniform: Pick<SkyUniform, 'write'> & Partial<Pick<SkyUniform, 'writeShelter'>>,
    clock: Pick<WorldClock, 'seconds'> = WORLD_CLOCK,
  ) {
    this.uniform = uniform;
    this.clock = clock;
    law
      .then((started) => (this.law = started))
      .catch((error: unknown) => console.error('the sky could not start:', error));
  }

  /** Shelters the rain under `boxes` (world metres) from the next frame: a node's boxes on foot, none elsewhere. */
  shelterUnder(boxes: readonly Roofing[]): void {
    this.roofing = boxes;
    this.shelter = null;
  }

  /** Where the eye stands in the shelter grid, laid again round it when it has strayed (as the uniform's
   *  shelter_place); none laid where nothing shelters. */
  private shelterPlace(eye: readonly [number, number, number]): [number, number, number, number] {
    if (this.roofing.length === 0 || !this.uniform.writeShelter) return [0, 0, 0, 0];
    if (!this.shelter || !stillServes(this.shelter, eye)) {
      this.shelter = shelterOver(this.roofing, eye);
      this.uniform.writeShelter(this.shelter.undersides);
    }
    const { west, north, base } = this.shelter;
    return [eye[0] - west, eye[1] - north, eye[2] - base, 1];
  }

  /** The sky over the eye (world metres, height above the sea) in a climate's air, its weather read at the ground
   *  under the eye (`groundM` above the sea), where the player stands, with the lamps lit round it. */
  frame(
    eye: readonly [number, number, number],
    climate: string,
    lamps: readonly Lamp[] = [],
    groundM = eye[2],
  ): SkyNow {
    const law = this.law;
    if (!law) return SKY_NOW.current;
    if (this.told) return this.toldFrame(law, this.told, eye, climate, lamps, groundM);
    // The world's sky comes back afresh: its lightning and its air read anew, never eased from the story's.
    if (this.wasTold)
      [this.strikes, this.asked, this.air, this.easing, this.wasTold] = [[], -Infinity, null, null, false];
    const worldS = this.clock.seconds();
    const reading = this.eased(law.at(eye[0], eye[1], Math.max(0, groundM), worldS, climate), climate, worldS);
    // A window of world time is asked once: a long frame asks a little more, a jump in the clock starts afresh.
    const from = worldS - this.asked > 2 || worldS < this.asked ? worldS - 0.05 : this.asked;
    if (worldS > from) this.strikes.push(...law.strikes(eye[0], eye[1], STRIKE_REACH_M, from, worldS, climate));
    this.asked = worldS;
    this.strikes = this.strikes.filter((strike) => worldS - strike.atS <= STRIKE_KEPT_S);
    const flash = flashOfAll(this.strikes, worldS, eye);
    const look = lookOf(reading, worldS, flash);
    this.uniform.write(look, lamps, [eye[0], eye[1], Math.max(0, groundM)], this.shelterPlace(eye));
    const sails = windBearing(law.seaWind(eye[0], eye[1], worldS));
    const held = heldLight(look, lamps);
    const sight = (rangeM: number, lit: boolean) => law.nightSight(rangeM, reading.daylight, lit);
    SKY_NOW.current = { reading, look, climate, eye, worldS, strikes: this.strikes, sails, held, sight };
    return SKY_NOW.current;
  }

  /** The story's sky: the law's reading at its hour under its weather, its strikes' light, its clouds on its clock. */
  private toldFrame(
    law: SkyLaw,
    told: ToldSky,
    eye: readonly [number, number, number],
    climate: string,
    lamps: readonly Lamp[],
    groundM: number,
  ): SkyNow {
    this.wasTold = true;
    const { worldS, strikes } = told;
    const reading = { ...law.at(eye[0], eye[1], Math.max(0, groundM), told.hourS, climate), ...told.weather };
    const look = lookOf(reading, worldS, flashOfAll(strikes, worldS, eye));
    this.uniform.write(look, lamps, [eye[0], eye[1], Math.max(0, groundM)], this.shelterPlace(eye));
    const sails = windBearing(told.weather.wind);
    const sight = (rangeM: number, lit: boolean) => law.nightSight(rangeM, reading.daylight, lit);
    SKY_NOW.current = { reading, look, climate, eye, worldS, strikes, sails, held: heldLight(look, lamps), sight };
    return SKY_NOW.current;
  }

  /** The reading shown: a new air's eased in from what was shown, so boarding or landing never jumps the sky. */
  private eased(reading: SkyReading, climate: string, worldS: number): SkyReading {
    if (this.air && this.air.climate !== climate) this.easing = { from: this.air.shown, since: worldS };
    const share = this.easing ? Math.min(1, Math.max(0, (worldS - this.easing.since) / AIR_EASE_S)) : 1;
    if (share >= 1) this.easing = null;
    const shown = this.easing ? mixReading(this.easing.from, reading, share * share * (3 - 2 * share)) : reading;
    this.air = { climate, shown };
    return shown;
  }
}
