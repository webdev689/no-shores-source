// The sea's and the storm's sounds as numbers: how levels glide, how thunder changes with distance, when spot sounds
// fall due, the shapes of their envelopes and the noise every bed is made from. Nothing here touches Web Audio, so
// each shape is tested on its own.

/** How fast sound crosses the air, in kilometres a second: thunder is heard this long after its flash. */
export const SOUND_KM_S = 0.343;

/** Clamps a bed's level to 0 (silent) to 1 (full); anything that is not a number is silence. */
export const clampLevel = (level: number): number => (Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0);

/** A level `elapsedS` into its glide from `from` to `to` over `glideS`, eased at both ends so a gain never lurches. */
export function glided(from: number, to: number, elapsedS: number, glideS: number): number {
  if (glideS <= 0 || elapsedS >= glideS) return to;
  const along = Math.max(0, elapsedS / glideS);
  return from + (to - from) * along * along * (3 - 2 * along);
}

/** Thunder at a distance: how long after the flash, how bright its filter, how much tearing crack, how loud and
 *  how long its roll. Close strikes tear; far ones only rumble, as the air takes their high notes first. */
export function thunderShape(distanceKm: number): {
  readonly delayS: number;
  readonly brightnessHz: number;
  readonly crack: number;
  readonly gain: number;
  readonly rollS: number;
} {
  const kilometres = Math.max(0, Number.isFinite(distanceKm) ? distanceKm : 0);
  return {
    delayS: kilometres / SOUND_KM_S,
    brightnessHz: 150 + 7850 * Math.exp(-kilometres),
    crack: kilometres <= 0.5 ? 1 : Math.max(0, 1 - (kilometres - 0.5) / 2),
    gain: 1 / (1 + kilometres / 1.5),
    rollS: 3 + Math.min(kilometres, 8) * 0.8,
  };
}

/** A small seeded random source (mulberry32), so spot sounds fall at the same times on every run of a test. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seconds to the next spot sound at its bed's full level: random as rain on a roof, exponential gaps averaging
 *  `meanGapS`. The caller counts them down slower as the bed quietens. */
export const nextGapS = (meanGapS: number, roll: number): number =>
  Math.max(0.05, -Math.log(1 - Math.min(roll, 0.999999)) * meanGapS);

/** A strike's envelope as [seconds, gain] points: a straight rise to `peak`, then a fall that slows as it goes,
 *  as a struck thing's ring does, to silence at `attackS + decayS`. */
export function hit(attackS: number, decayS: number, peak: number): readonly (readonly [number, number])[] {
  const points: [number, number][] = [
    [0, 0],
    [attackS, peak],
  ];
  const steps = 6;
  for (let step = 1; step < steps; step++) points.push([attackS + (decayS * step) / steps, peak * Math.exp(-step)]);
  points.push([attackS + decayS, 0]);
  return points;
}

/** Folds a buffer's last `fadeSamples` into its start (equal power), so played as a loop it never clicks. */
export function seamlessLoop(samples: Float32Array<ArrayBuffer>, fadeSamples: number): Float32Array<ArrayBuffer> {
  const length = samples.length - fadeSamples;
  const loop = samples.slice(0, length);
  for (let index = 0; index < fadeSamples; index++) {
    const weight = index / fadeSamples;
    loop[index] = (samples[index] ?? 0) * Math.sqrt(weight) + (samples[length + index] ?? 0) * Math.sqrt(1 - weight);
  }
  return loop;
}

function levelled(samples: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) for (let index = 0; index < samples.length; index++) samples[index] = (samples[index] ?? 0) / peak;
  return samples;
}

/** White noise, every pitch alike: rain's hiss, a splash's spray. */
export const whiteNoise = (length: number, random: () => number): Float32Array<ArrayBuffer> =>
  levelled(Float32Array.from({ length }, () => random() * 2 - 1));

/** Brown noise, deep and rumbling (white noise summed, leaking back to zero so it never drifts away): the sea, the
 *  wind, thunder's roll. */
export function brownNoise(length: number, random: () => number): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  let sum = 0;
  for (let index = 0; index < length; index++) {
    sum = sum * 0.998 + (random() * 2 - 1) * 0.04;
    samples[index] = sum;
  }
  return levelled(samples);
}

/** A blaze's crackle: `perSecond` tiny snaps at random, most faint, a few sharp, each dying in a few milliseconds. */
export function crackle(
  length: number,
  sampleRate: number,
  random: () => number,
  perSecond: number,
): Float32Array<ArrayBuffer> {
  const samples = new Float32Array(length);
  const count = Math.round((length / sampleRate) * perSecond);
  const ring = Math.round(sampleRate * 0.004);
  for (let snap = 0; snap < count; snap++) {
    const start = Math.floor(random() * length);
    const size = random() ** 3;
    for (let offset = 0; offset < ring; offset++) {
      const index = (start + offset) % length;
      samples[index] = (samples[index] ?? 0) + (random() * 2 - 1) * size * Math.exp((-6 * offset) / ring);
    }
  }
  return levelled(samples);
}

/** One call of a gull's cry: a quick rise to its peak, then a fall. */
export interface GullCall {
  readonly startS: number;
  readonly durationS: number;
  readonly fromHz: number;
  readonly peakHz: number;
  readonly toHz: number;
}

/** A gull's cry, two to five calls, and how far the bird is (0.2 near to 1 far: farther is quieter and duller). */
export function gullCry(random: () => number): { readonly calls: readonly GullCall[]; readonly distance: number } {
  const count = 2 + Math.floor(random() * 4);
  const pitch = 0.85 + random() * 0.3;
  const calls: GullCall[] = [];
  let startS = 0;
  for (let call = 0; call < count; call++) {
    const durationS = 0.14 + random() * 0.16;
    const fall = call === count - 1 ? 0.6 : 0.8;
    calls.push({ startS, durationS, fromHz: 1300 * pitch, peakHz: 2300 * pitch, toHz: 2300 * pitch * fall });
    startS += durationS + 0.05 + random() * 0.12;
  }
  return { calls, distance: 0.2 + random() * 0.8 };
}
