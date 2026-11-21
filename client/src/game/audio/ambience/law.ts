// The ambience's laws, pure: which ambience a place sounds as, the time of day's share in each phase, a bed's slow
// breathing, a voice's wandering mood and the gaps between its calls, a crossfade's level, a ship's way, the sea's
// nearness, and a breaker's swell on a shore. The engine (ambience.ts) keeps the clocks and plays what these say.

import type { Random } from './dsp.ts';
import type { Place } from '../place.ts';
import { CLIMATES, type Climate } from '../place.ts';

/** Each of the eleven ambiences: the sea, the social space, and an island's by its climate. */
export type AmbienceKey = 'sea' | 'social' | Climate;
export const AMBIENCES: readonly AmbienceKey[] = ['sea', 'social', ...CLIMATES];

/** The ambience a place sounds as. */
export const ambienceOf = (place: Place): AmbienceKey =>
  place.kind === 'sea' ? 'sea' : place.kind === 'social' ? 'social' : place.climate;

/** The day's four phases. */
export type Phase = 'dawn' | 'day' | 'dusk' | 'night';
export const PHASES: readonly Phase[] = ['dawn', 'day', 'dusk', 'night'];
/** A number for each phase; a phase left out is 0. */
export type ByPhase = Partial<Readonly<Record<Phase, number>>>;
/** The same number in every phase. */
export const always = (value: number): ByPhase => ({ dawn: value, day: value, dusk: value, night: value });

/** Where each phase is whole, hours: the dawn's and the dusk's an hour and a half either side of their middle, each
 *  turning into the next over an hour. */
const DAWN_H = 5.5;
const DUSK_H = 19.5;
const HALF_H = 1.5;
const TURN_H = 1;

/** How much of each phase an hour of the day is in, the four summing to 1. */
export function phasesAt(hour: number): Readonly<Record<Phase, number>> {
  const time = ((hour % 24) + 24) % 24;
  const near = (middle: number) => {
    const away = Math.min(Math.abs(time - middle), 24 - Math.abs(time - middle));
    const into = (HALF_H + TURN_H / 2 - away) / TURN_H;
    return Math.max(0, Math.min(1, into));
  };
  const [dawn, dusk] = [near(DAWN_H), near(DUSK_H)];
  const daylight = time > DAWN_H && time < DUSK_H;
  return { dawn, dusk, day: daylight ? 1 - dawn - dusk : 0, night: daylight ? 0 : 1 - dawn - dusk };
}

/** A number by phase, weighed by how much of each phase it is now. */
export const byPhase = (values: ByPhase, phases: Readonly<Record<Phase, number>>): number =>
  PHASES.reduce((sum, phase) => sum + (values[phase] ?? 0) * phases[phase], 0);

/** Three slow waves, their periods (s) far from any whole multiple of each other, so their sum never repeats within
 *  an hour an ear could hold. */
const WAVES: readonly (readonly [number, number])[] = [
  [23.7, 0.5],
  [9.1, 0.3],
  [41.3, 0.2],
];

/** A slow sum of the waves for a seed, -1 to 1, each wave's phase the seed's own. */
function slowly(time: number, seed: number, stretch: number): number {
  return WAVES.reduce(
    (sum, [period, share], nth) =>
      sum + share * Math.sin((2 * Math.PI * time) / (period * stretch) + seed * (nth + 1.618)),
    0,
  );
}

/** A bed's breathing: 1 at its fullest, down to `1 - depth` at its lowest. */
export const breathOf = (time: number, seed: number, depth: number): number =>
  1 - depth * (0.5 + 0.5 * slowly(time, seed, 1));

/** A value at random for each whole step of `time`, the same for the same seed and step, joined smoothly to the next:
 *  a wandering that never comes round again. 0 to 1. */
export function wander(time: number, seed: number, step: number): number {
  const steps = time / step;
  const whole = Math.floor(steps);
  const valueOf = (nth: number) => {
    let hash = Math.imul((nth + Math.round(seed * 7919)) | 0, 0x9e3779b1) ^ 0x85ebca6b;
    hash = Math.imul(hash ^ (hash >>> 15), 0x2c1b3c6d);
    hash = Math.imul(hash ^ (hash >>> 12), 0x297a2d39);
    return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
  };
  const share = steps - whole;
  const eased = share * share * (3 - 2 * share);
  return valueOf(whole) + (valueOf(whole + 1) - valueOf(whole)) * eased;
}

/** The wind's gusts, 0 to 1: a wandering over a few seconds and a quicker one over it, their peaks short and their
 *  lulls long, as a gust rises and falls, and never on a beat. */
export const gustOf = (time: number, seed: number): number =>
  (0.65 * wander(time, seed, 4.3) + 0.35 * wander(time, seed + 17, 1.7)) ** 1.8;

/** A voice's mood: how much more or less it calls than its mean, 0.4 to 1.6, wandering over minutes, so a bird's
 *  song comes in spells and lulls. */
export const moodOf = (time: number, seed: number): number => 1 + 0.6 * slowly(time, seed, 4.7);

/** The seconds until a voice calls again at `perMinute` calls a minute: drawn as a stream's gaps are (exponential,
 *  so never on a beat), but never under a quarter of the mean; never at a rate of none. */
export function gapAfter(perMinute: number, random: Random): number {
  if (!(perMinute > 0)) return Infinity;
  const mean = 60 / perMinute;
  return Math.max(mean * 0.25, -mean * Math.log(1 - random() * 0.999));
}

/** A bout's call times from its first, seconds: `count` drawn in `bout`, each gap in `spacing`. */
export function boutTimes(
  bout: readonly [number, number],
  spacing: readonly [number, number],
  random: Random,
): readonly number[] {
  const count = bout[0] + Math.floor(random() * (bout[1] - bout[0] + 1));
  const times = [0];
  for (let nth = 1; nth < count; nth++)
    times.push((times[nth - 1] ?? 0) + spacing[0] + (spacing[1] - spacing[0]) * random());
  return times;
}

/** The sea's swell, 0 to 1: three long waves summed (8.3, 12.7 and 5.1 s), so no two swells are alike. */
export function swellAt(time: number): number {
  const sum =
    0.55 * Math.sin((2 * Math.PI * time) / 8.3) +
    0.3 * Math.sin((2 * Math.PI * time) / 12.7 + 1.3) +
    0.15 * Math.sin((2 * Math.PI * time) / 5.1 + 0.4);
  return Math.max(0, Math.min(1, 0.5 + 0.5 * sum));
}

/** How long a crossfade between two places takes, seconds. */
export const CROSSFADE_S = 4;

/** A fade's level stepped `seconds` toward its target, a whole fade taking `fade` seconds. */
export const stepLevel = (level: number, target: number, seconds: number, fade = CROSSFADE_S): number =>
  target > level ? Math.min(target, level + seconds / fade) : Math.max(target, level - seconds / fade);

/** A fade's gain at its level: equal power, so two crossing never dip or swell together. */
export const fadeGain = (level: number): number => Math.sin((Math.PI / 2) * Math.max(0, Math.min(1, level)));

/** A ship's way, 0 to 1: none hove to; under way, its pace dial's step (5 to 100 times), slow to full. */
export const wayOf = (sailing: boolean, pace: number): number =>
  sailing ? Math.min(1, 0.3 + 0.7 * Math.sqrt(Math.max(0, pace) / 100)) : 0;

/** How near the coast is, 1 within `full` metres, falling to 0 at `none`. */
export function nearness(distance: number, full: number, none: number): number {
  if (!Number.isFinite(distance)) return 0;
  const share = Math.max(0, Math.min(1, (none - distance) / (none - full)));
  return share * share * (3 - 2 * share);
}
