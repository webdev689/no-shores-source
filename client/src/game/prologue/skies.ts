// The weathers the story passes through, each a whole `Weather` the director eases between: the clear morning the
// intro opens on, the cloud it flies through, mist, rain and snow over the islands, Saltmere's fair day, the storm at
// sea and its stillness after the fight, the burning wreck, and the deep.
import { CLEAR, type Weather } from '../../cinema/weather.ts';

const CLOUD_LAYER = { base: 650, top: 1150, cover: 0.62 } as const;

/** High over the cloud, the intro's first light. */
export const OVER_CLOUD: Weather = { ...CLEAR, clouds: CLOUD_LAYER, wind: [3, 1] };
/** Under the cloud over a highland island: low mist in its valleys. */
export const HIGHLAND: Weather = { ...CLEAR, overcast: 0.3, mist: 0.45, clouds: CLOUD_LAYER, wind: [4, 2] };
/** Rain over a green island. */
export const RAIN: Weather = {
  ...CLEAR,
  overcast: 0.6,
  rain: 0.6,
  mist: 0.3,
  clouds: CLOUD_LAYER,
  wind: [5, 3],
  seaGain: 1.4,
};
/** A clear, hot sky over a desert island. */
export const FAIR: Weather = { ...CLEAR, clouds: { ...CLOUD_LAYER, cover: 0.35 }, wind: [2, 0] };
/** Snow over the tundra. */
export const SNOW: Weather = { ...CLEAR, overcast: 0.45, snow: 0.7, mist: 0.35, clouds: CLOUD_LAYER, wind: [3, 4] };
/** Saltmere on a fair day, the title over it. */
export const SALTMERE: Weather = { ...CLEAR, clouds: { ...CLOUD_LAYER, cover: 0.42 }, wind: [3, 1] };
/** The stormfront at sea: dark, wild, rain driven slant, the swell gained. */
export const STORM: Weather = {
  ...CLEAR,
  overcast: 1,
  rain: 1,
  mist: 0.55,
  clouds: { base: 420, top: 1400, cover: 0.95 },
  wind: [14, 6],
  seaGain: 2.5,
};
/** The storm thickened while ships come out of it: the mist that hides them. */
export const STORM_FOG: Weather = { ...STORM, mist: 0.8 };
/** The air gone still after the fight while the storm rages on: the wind drops, the rain eases a little. */
export const STILL: Weather = { ...STORM, rain: 0.7, wind: [3, 1], mist: 0.5 };
/** The wreck burning in the storm. */
export const WRECK: Weather = { ...STORM, rain: 0.75, mist: 0.45, glow: { colour: [1, 0.45, 0.15], strength: 0.35 } };
/** Under the sea, the wreck burning above. */
export const DEEP: Weather = { ...STORM, rain: 0, deep: 1, glow: { colour: [1, 0.5, 0.18], strength: 0.8 } };
/** Saltmere's shore the morning after: grey, calm, a fine drizzle passing. */
export const MORNING: Weather = { ...CLEAR, overcast: 0.35, rain: 0.1, mist: 0.2, clouds: CLOUD_LAYER, wind: [2, 1] };
