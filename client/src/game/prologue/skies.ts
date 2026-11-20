// The weathers the story passes through, each a whole `Weather` the director eases between, at the hour of the
// story's one day and night the game's sky draws it at: first light over the cloud, Saltmere's early morning, the storm
// at evening, the stillness at sunset, the dusk the Frigate comes out of, the burning wreck and the deep by night,
// and the next dawn on the shore. Saltmere's sun rises about 5:05 and sets about 18:55.
import { CLEAR, type Weather } from '../../cinema/weather.ts';

/** The cloud the intro flies through. Only the intro lays one: under it the sky's own cover is the ceiling, and a
 *  layer seen from below would be drawn in the day's white at any hour. */
const CLOUD_LAYER = { base: 650, top: 1150, cover: 0.62 } as const;

/** High over the cloud, the intro's first light. */
export const OVER_CLOUD: Weather = { ...CLEAR, clouds: CLOUD_LAYER, wind: [3, 1], hour: 5.25 };
/** Saltmere on a fair morning, the title over it: the sun still low, an hour after the first light over the cloud. */
export const SALTMERE: Weather = { ...CLEAR, clouds: { ...CLOUD_LAYER, cover: 0.42 }, wind: [3, 1], hour: 6.4 };
/** The stormfront at sea: dark, wild, rain driven slant, the swell gained. Its rain is three quarters of the sky's
 *  heaviest, so the Brig still shows through it. */
export const STORM: Weather = {
  ...CLEAR,
  overcast: 1,
  rain: 0.75,
  mist: 0.55,
  clouds: null,
  wind: [14, 6],
  seaGain: 2.5,
  hour: 18,
};
/** The storm thickened while ships come out of it: the mist that hides them. */
export const STORM_FOG: Weather = { ...STORM, mist: 0.8 };
/** The air gone still after the fight: the wind drops, the rain eases, and the cloud thins enough for the low sun to
 *  show through it at sunset. */
export const STILL: Weather = { ...STORM, overcast: 0.82, rain: 0.45, wind: [3, 1], mist: 0.45, hour: 18.6 };
/** The light failing as the Frigate comes out of the storm: the sun just gone. */
export const DUSK: Weather = { ...STILL, hour: 19.1 };
/** The wreck burning in the storm. */
export const WRECK: Weather = {
  ...STORM,
  rain: 0.75,
  mist: 0.45,
  glow: { colour: [1, 0.45, 0.15], strength: 0.35 },
  hour: 21,
};
/** Under the sea, the wreck burning above. */
export const DEEP: Weather = {
  ...STORM,
  rain: 0,
  deep: 1,
  glow: { colour: [1, 0.5, 0.18], strength: 0.8 },
  hour: 21.2,
};
/** Saltmere's shore the morning after: grey, calm, a fine drizzle passing. */
export const MORNING: Weather = {
  ...CLEAR,
  overcast: 0.6,
  rain: 0.1,
  mist: 0.2,
  clouds: null,
  wind: [2, 1],
  hour: 29.6,
};
