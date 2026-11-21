// The weather and the hour as the ambience hears them, pure: the day's phases from the sun's height, the wind's
// strength and wildness, how hard rain, snow and sand come, how far rain and snow send the day's birds and insects to
// shelter, and each lightning strike's thunder: where it is heard from, when it arrives, and which it is.

import type { SkyReading, Strike } from '../../../sky/skyLaw.ts';
import type { Phase } from './law.ts';
import type { BedKey, SoundKey } from './recordings.ts';

/** The twilight is whole while the sun is within the first height of the horizon, degrees, and gone past the second:
 *  dawn as it rises in the east, dusk as it sets in the west. */
const TWILIGHT_DEG: readonly [number, number] = [3, 9];

/** How much of each phase the sky is in, from the sun's direction (east, south, up), the four summing to 1. */
export function phasesOfSun(sun: readonly [number, number, number]): Readonly<Record<Phase, number>> {
  const height = (Math.asin(Math.max(-1, Math.min(1, sun[2]))) * 180) / Math.PI;
  const share = Math.max(0, Math.min(1, (TWILIGHT_DEG[1] - Math.abs(height)) / (TWILIGHT_DEG[1] - TWILIGHT_DEG[0])));
  const twilight = share * share * (3 - 2 * share);
  const rising = sun[0] > 0;
  return {
    dawn: rising ? twilight : 0,
    dusk: rising ? 0 : twilight,
    day: height > 0 ? 1 - twilight : 0,
    night: height > 0 ? 0 : 1 - twilight,
  };
}

/** The weather as the ambience plays it. `wind` scales every wind bed and gust: 1 at the world's usual 6 m/s, near
 *  none in a calm, 2.5 in a gale. `wild` deepens the gusts. `rain`, `snow` and `sand` are how hard each comes, 0 to 1.
 *  `fall` is how hard rain or snow falls, which sends the day's birds and insects to shelter. */
export interface HeardWeather {
  readonly wind: number;
  readonly wild: number;
  readonly rain: number;
  readonly snow: number;
  readonly sand: number;
  readonly fall: number;
}

/** No reading yet: the air every place was made for, a usual wind and no rain. */
export const FAIR: HeardWeather = { wind: 1, wild: 0.5, rain: 0, snow: 0, sand: 0, fall: 0 };

/** The usual wind, m/s, and the most a gale is heard over it. */
const USUAL_WIND_MS = 6;
const WIND_MOST = 2.5;

/** The wind's strength as its beds play it: steeper than its speed, so a calm is near silent and a gale roars. */
export const windLevelOf = (metresPerSecond: number): number =>
  Math.min(WIND_MOST, (Math.max(0, metresPerSecond) / USUAL_WIND_MS) ** 1.4);

/** The weather heard from a reading of the sky. */
export function weatherOf(reading: SkyReading | null): HeardWeather {
  if (!reading) return FAIR;
  const falling = Math.max(0, Math.min(1, reading.falling));
  const snowShare = Math.max(0, Math.min(1, reading.snowShare));
  return {
    wind: windLevelOf(Math.hypot(reading.wind[0], reading.wind[1])),
    wild: Math.max(0, Math.min(1, reading.gust)),
    rain: falling * (1 - snowShare),
    snow: falling * snowShare,
    sand: Math.max(0, Math.min(1, reading.sand)),
    fall: falling,
  };
}

/** How deep a gusty bed's gusts go in this weather: as made in the usual air, deeper as the gusts grow wild. */
export const gustDepth = (depth: number, weather: HeardWeather): number =>
  Math.min(1, depth * (0.6 + 0.8 * weather.wild));

/** A rain bed's level by how hard it falls: a drizzle is heard, a downpour fills the air. */
export const rainLevel = (rain: number): number => Math.max(0, rain) ** 0.6;

/** Falling snow muffles the land: every bed but the weather's own is softened by up to this share. */
const SNOW_SOFTENS = 0.45;
export const snowSoftening = (weather: HeardWeather): number => 1 - SNOW_SOFTENS * weather.snow;

/** The day's birds and insects, which go to shelter from rain and snow. */
export const SHELTERING: ReadonlySet<SoundKey | BedKey> = new Set<SoundKey | BedKey>([
  'song.lark',
  'song.warbler',
  'song.finch',
  'song.thrush',
  'song.wren',
  'song.chiff',
  'song.weaver',
  'song.fluter',
  'song.sparrow',
  'dove',
  'pigeon',
  'cuckoo',
  'woodpecker',
  'curlew',
  'buzzard',
  'crow',
  'cicada',
  'fly',
  'mosquito',
  'insects.cicadas',
]);
/** How much of them rain or snow silences at most, and how hard a fall does it whole. */
const SHELTER_MOST = 0.85;
const SHELTER_FALL = 0.5;

/** The share of a sheltering voice still heard: all of it by night, less by day the harder it falls. */
export const shelterOf = (weather: HeardWeather, phases: Readonly<Record<Phase, number>>): number =>
  1 - SHELTER_MOST * Math.min(1, weather.fall / SHELTER_FALL) * (1 - phases.night);

/** Thunder is heard this far from its strike, metres, travelling at this speed, m/s. */
export const THUNDER_REACH_M = 25_000;
export const SOUND_M_S = 343;
/** A ground strike nearer than this, metres, by its power, cracks and rips; any other rolls. */
const CRACK_WITHIN_M = 3000;
/** Thunder's level: whole within the first distance, metres, falling as a power of its distance past it; never past
 *  the most, which keeps a near crack's peak under the ambience's ceiling in every place. */
const THUNDER_WHOLE_M = 1000;
const THUNDER_FALL = 0.75;
export const THUNDER_MOST = 0.6;

/** One strike's thunder at an ear: its sound, the world time it arrives, its level and its top (Hz, darker the
 *  farther it has come), its pitch, and the way it comes from (a unit step east and south). */
export interface Thunder {
  readonly sound: 'thunder.crack' | 'thunder.roll';
  readonly arrivesS: number;
  readonly gain: number;
  readonly corner: number;
  readonly pitch: number;
  readonly toward: readonly [number, number];
}

/** The thunder a strike sends an ear at (east, south), or none past hearing. */
export function thunderOf(strike: Strike, ear: readonly [number, number]): Thunder | null {
  const [east, south] = [strike.x - ear[0], strike.y - ear[1]];
  const distance = Math.hypot(east, south);
  if (distance > THUNDER_REACH_M) return null;
  const toward: readonly [number, number] = distance > 0 ? [east / distance, south / distance] : [0, -1];
  const crack = strike.toGround && distance < CRACK_WITHIN_M * strike.power;
  return {
    sound: crack ? 'thunder.crack' : 'thunder.roll',
    arrivesS: strike.atS + distance / SOUND_M_S,
    gain: THUNDER_MOST * strike.power * (THUNDER_WHOLE_M / Math.max(THUNDER_WHOLE_M, distance)) ** THUNDER_FALL,
    corner: Math.max(160, 9000 / (1 + distance / 800)),
    pitch: 1 - 0.15 * (distance / THUNDER_REACH_M),
    toward,
  };
}
