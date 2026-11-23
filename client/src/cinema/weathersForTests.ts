// A weather of each kind for the cinema's tests to draw and mix.
import { CLEAR, type Weather } from './weather.ts';

export const WEATHERS = {
  storm: { ...CLEAR, overcast: 0.92, rain: 1, mist: 0.3, wind: [11, 5], seaGain: 2.5 },
  rain: { ...CLEAR, overcast: 0.55, rain: 0.6, mist: 0.15, wind: [3, 2], seaGain: 1.3 },
  snow: { ...CLEAR, overcast: 0.45, snow: 0.8, mist: 0.25, wind: [2, 1] },
  mist: { ...CLEAR, overcast: 0.2, mist: 1 },
  clouds: { ...CLEAR, overcast: 0.1, clouds: { base: 120, top: 260, cover: 0.7 }, wind: [6, 0] },
  deep: { ...CLEAR, deep: 1, glow: { colour: [1, 0.45, 0.12], strength: 0.8 } },
} as const satisfies Record<string, Weather>;
