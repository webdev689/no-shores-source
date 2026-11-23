// What the sky and the sea are doing, as plain numbers a director eases from one to the next. The weather is drawn by
// the atmosphere pass over the finished picture and by the water on a gained swell; nothing here touches the rules.
import type { reach } from '../water/swell.ts';

/** The sea's swell as the shared rules give it. The cinema layer may not import the rules, so the type is taken from
 *  the water's own reader of it. */
type Swell = Parameters<typeof reach>[0];
type Colour = readonly [number, number, number];

/** What the sky and sea are doing; the director eases from one to the next. */
export interface Weather {
  /** 0 clear to 1 a storm's ceiling: the light dims, greys and cools, the sky darkens. */
  readonly overcast: number;
  /** 0 to 1: streaks round the eye, slanted by the wind, heavy at 1. */
  readonly rain: number;
  readonly snow: number;
  /** 0 to 1: distance fog; at 1 a ship 300 m off is a shadow and 600 m off is gone. */
  readonly mist: number;
  /** A layer of cloud to fly through, its base and top in world metres and how much of it is cloud. */
  readonly clouds: { readonly base: number; readonly top: number; readonly cover: number } | null;
  /** Metres a second east and south: the rain's slant and the clouds' drift. */
  readonly wind: readonly [number, number];
  /** 0 to 1: lightning's light this frame. */
  readonly flash: number;
  /** A bolt down to (x, y) in world metres, its shape from `seed`. */
  readonly bolt: { readonly x: number; readonly y: number; readonly seed: number } | null;
  /** 0 to 1: the eye under the sea, the deep's blue and its drifting motes. */
  readonly deep: number;
  /** Fire's light from above, seen through the surface from the deep. */
  readonly glow: { readonly colour: Colour; readonly strength: number } | null;
  /** The swell drawn this many times its height: 1 calm, about 2.5 a storm. Drawing only. */
  readonly seaGain: number;
  /** The hour of the story's day it is told at, hours from the day's start (past 24, the next day): the game's sky
   *  draws it at that hour, with its own light, cloud, rain and lightning. None leaves the world's sky as it is. */
  readonly hour?: number;
}

export const CLEAR: Weather = {
  overcast: 0,
  rain: 0,
  snow: 0,
  mist: 0,
  clouds: null,
  wind: [0, 0],
  flash: 0,
  bolt: null,
  deep: 0,
  glow: null,
  seaGain: 1,
};

const mix = (from: number, to: number, share: number) => from * (1 - share) + to * share;

/** Two optional parts eased into each other: present at both ends, every number eased; at one end only, that end's
 *  part with its `amount` key eased from or to none, and gone once there is none of it. */
function mixPart<Part extends Record<string, unknown>>(
  from: Part | null,
  to: Part | null,
  share: number,
  amount: keyof Part & string,
  eased: (from: Part, to: Part, share: number) => Part,
): Part | null {
  const either = to ?? from;
  if (!either) return null;
  const faded = (part: Part | null): Part => part ?? { ...either, [amount]: 0 };
  const mixed = eased(faded(from), faded(to), share);
  return mixed[amount] === 0 ? null : mixed;
}

/** The weather `share` of the way (0 to 1, eased by the caller) from `from` to `to`. A bolt is the nearer end's. */
export function mixWeather(from: Weather, to: Weather, share: number): Weather {
  const part = Math.min(1, Math.max(0, share));
  const eased = (key: 'overcast' | 'rain' | 'snow' | 'mist' | 'flash' | 'deep' | 'seaGain') =>
    mix(from[key], to[key], part);
  return {
    overcast: eased('overcast'),
    rain: eased('rain'),
    snow: eased('snow'),
    mist: eased('mist'),
    clouds: mixPart(from.clouds, to.clouds, part, 'cover', (start, end, along) => ({
      base: mix(start.base, end.base, along),
      top: mix(start.top, end.top, along),
      cover: mix(start.cover, end.cover, along),
    })),
    wind: [mix(from.wind[0], to.wind[0], part), mix(from.wind[1], to.wind[1], part)],
    flash: eased('flash'),
    bolt: part < 0.5 ? from.bolt : to.bolt,
    deep: eased('deep'),
    glow: mixPart(from.glow, to.glow, part, 'strength', (start, end, along) => ({
      colour: [
        mix(start.colour[0], end.colour[0], along),
        mix(start.colour[1], end.colour[1], along),
        mix(start.colour[2], end.colour[2], along),
      ],
      strength: mix(start.strength, end.strength, along),
    })),
    seaGain: eased('seaGain'),
    ...(to.hour === undefined ? {} : { hour: from.hour === undefined ? to.hour : mix(from.hour, to.hour, part) }),
  };
}

/** The swell with every wave's height and sideways carry times `gain`, for drawing a storm's sea; its speeds and
 *  lengths are the rules' own, so a ship still rides where the server puts it. */
export function swellGained(swell: Swell, gain: number): Swell {
  if (gain === 1) return swell;
  return {
    ...swell,
    waves: swell.waves.map((wave) => ({ ...wave, amplitude: wave.amplitude * gain, shift: wave.shift * gain })),
  };
}
