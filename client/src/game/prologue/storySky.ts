// The story's weather told to the game's sky: the sky draws the hour's light, the cloud, the rain, the fog and the
// lightning for the story as it does for the game, and the story's own atmosphere keeps only what the sky cannot
// draw (a cloud layer flown through, the deep, fire's glow seen from under the sea, the storm's gained swell).
import { CLEAR, type Weather } from '../../cinema/weather.ts';
import type { ToldSky } from '../../sky/skyDriver.ts';
import { FOG_BANK } from '../../sky/skyLook.ts';
import type { Strike } from '../../sky/skyLaw.ts';
import { DAY_S } from '../../sky/worldClock.ts';

/** The story's day: world day 3, a full moon over its night, the same for every player. */
export const STORY_DAY_S = 3 * DAY_S;
const HOUR_S = DAY_S / 24;
/** How thick the story's mist and its overcast make the air, a metre (the atmosphere's own,
 *  cinema/atmosphereShader). */
const MIST_PER_M = 0.0063;
const OVERCAST_PER_M = 0.0005;
/** An overcast past this is a storm's, growing to a full storm at 1. */
const STORM_FROM = 0.6;
/** The wind at which the gusts are at their strongest, m/s. */
const GUSTIEST_MS = 16;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** The sky the story tells for `weather` at its hour, its clouds drifting and its lightning striking on the story's
 *  clock `worldS`; none for a weather with no hour, which leaves the world's own sky. */
export function toldSky(weather: Weather, worldS: number, strikes: readonly Strike[]): ToldSky | null {
  if (weather.hour === undefined) return null;
  const { overcast, rain, snow, mist, wind } = weather;
  const falling = Math.max(rain, snow);
  return {
    hourS: STORY_DAY_S + weather.hour * HOUR_S,
    worldS,
    weather: {
      cloud: clamp01(Math.max(overcast, weather.clouds?.cover ?? 0)),
      storm: clamp01((overcast - STORM_FROM) / (1 - STORM_FROM)),
      falling,
      snowShare: falling > 0 ? snow / (rain + snow) : 0,
      fog: clamp01((mist * MIST_PER_M + overcast * OVERCAST_PER_M) / FOG_BANK),
      wind,
      gust: clamp01(Math.hypot(wind[0], wind[1]) / GUSTIEST_MS),
      wetness: clamp01(rain * 1.5 + overcast * 0.3),
      snowCover: snow,
    },
    strikes,
  };
}

/** What the story's own atmosphere still lays over a told sky's picture: the cloud flown through, the deep, fire's
 *  glow from below and the gained swell; the rest is the sky's. A weather with no hour keeps all of its own. */
export function overTheSky(weather: Weather): Weather {
  if (weather.hour === undefined) return weather;
  const { clouds, wind, deep, glow, seaGain } = weather;
  return { ...CLEAR, clouds, wind, deep, glow, seaGain };
}
