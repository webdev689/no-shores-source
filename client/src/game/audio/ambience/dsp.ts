// The ambience's few sums: the seeded die, the second-order filters, and the shapes a place's room is cut from. Pure.

/** A stream of numbers in [0, 1). */
export type Random = () => number;

/** A seeded stream, the same numbers for the same seed every time. */
export { seeded } from '../../../seeded.ts';

/** A number drawn between two. */
export const between = (random: Random, [low, high]: readonly [number, number]): number =>
  low + (high - low) * random();

export type FilterKind = 'lowpass' | 'bandpass' | 'highpass';
/** One second-order section: its kind, its corner or centre in Hz, and its Q. */
export type Section = readonly [FilterKind, number, number];

/** A section's coefficients (the audio EQ cookbook's; the band-pass at 0 dB peak), a0 divided out: b0, b1, b2, a1,
 *  a2. A corner past the rate's top is held under it. */
export function coefficients(
  kind: FilterKind,
  hertz: number,
  quality: number,
  rate: number,
): readonly [number, number, number, number, number] {
  const omega = (2 * Math.PI * Math.min(hertz, rate * 0.45)) / rate;
  const cosine = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * quality);
  const norm = 1 + alpha;
  const forward =
    kind === 'bandpass'
      ? [alpha, 0, -alpha]
      : kind === 'highpass'
        ? [(1 + cosine) / 2, -(1 + cosine), (1 + cosine) / 2]
        : [(1 - cosine) / 2, 1 - cosine, (1 - cosine) / 2];
  return [
    (forward[0] ?? 0) / norm,
    (forward[1] ?? 0) / norm,
    (forward[2] ?? 0) / norm,
    (-2 * cosine) / norm,
    (1 - alpha) / norm,
  ];
}

/** Runs one section over `samples` in place, its state carried in `state` (the last two inputs and outputs), so a
 *  second pass over a loop starts where the first left off. */
export function runSection(
  samples: Float64Array | Float32Array,
  section: Section,
  rate: number,
  state: number[],
): void {
  const [ahead0, ahead1, ahead2, back1, back2] = coefficients(section[0], section[1], section[2], rate);
  let [in1, in2, out1, out2] = [state[0] ?? 0, state[1] ?? 0, state[2] ?? 0, state[3] ?? 0];
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] ?? 0;
    const out = ahead0 * value + ahead1 * in1 + ahead2 * in2 - back1 * out1 - back2 * out2;
    [in2, in1, out2, out1] = [in1, value, out1, out];
    samples[i] = out;
  }
  [state[0], state[1], state[2], state[3]] = [in1, in2, out1, out2];
}

/** `samples` through a chain of sections from rest, as a new buffer. */
export function filtered(samples: Float32Array, chain: readonly Section[], rate: number): Float32Array {
  const out = Float32Array.from(samples);
  for (const section of chain) runSection(out, section, rate, [0, 0, 0, 0]);
  return out;
}

/** White noise, `length` samples. */
export function noise(length: number, random: Random): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = random() * 2 - 1;
  return out;
}

/** Adds `source` times `gain` into `target` from sample `offset`; with `wrap` what runs past the end comes round to the
 *  start, so a loop's events cross its seam as any other sample does. */
export function mixInto(target: Float32Array, source: Float32Array, offset: number, gain = 1, wrap = false): void {
  const start = Math.round(offset);
  for (let i = 0; i < source.length; i++) {
    let index = start + i;
    if (wrap) index = ((index % target.length) + target.length) % target.length;
    else if (index < 0 || index >= target.length) continue;
    target[index] = (target[index] ?? 0) + (source[i] ?? 0) * gain;
  }
}

/** Multiplies each sample by `shape(u)`, u its share of the way through (0 to 1). */
export function shaped(samples: Float32Array, shape: (share: number) => number): Float32Array {
  const last = Math.max(1, samples.length - 1);
  for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] ?? 0) * shape(i / last);
  return samples;
}

/** A struck body's decay: up over `attack` seconds, falling by e every `tau` seconds after. */
export const struck =
  (attack: number, tau: number, seconds: number) =>
  (share: number): number => {
    const time = share * seconds;
    return Math.min(1, time / Math.max(1e-4, attack)) * Math.exp(-Math.max(0, time - attack) / tau);
  };

/** A place's answer to a sound: two channels of noise dying away over `seconds` (by 60 dB), losing its top as it
 *  dies, with `echoes` (seconds) off walls or hillsides, and its power levelled to 1, so a send's gain means the
 *  same in every place. */
export function roomResponse(
  rate: number,
  room: { readonly seconds: number; readonly corner: number; readonly echoes: readonly number[] },
  random: Random,
): readonly [Float32Array, Float32Array] {
  const length = Math.round((room.seconds + Math.max(0, ...room.echoes)) * rate);
  const channel = () => {
    const out = new Float32Array(length);
    let [bright, dark] = [0, 0];
    const keepBright = Math.exp((-2 * Math.PI * room.corner) / rate);
    const keepDark = Math.exp((-2 * Math.PI * room.corner * 0.25) / rate);
    for (let i = 0; i < length; i++) {
      const time = i / rate;
      const white = random() * 2 - 1;
      bright = (1 - keepBright) * white + keepBright * bright;
      dark = (1 - keepDark) * white + keepDark * dark;
      const fall = Math.exp((-6.9 * time) / room.seconds);
      // Its top dies first: the bright part fades three times as fast as the dark.
      out[i] = (bright * fall ** 3 + dark * 2 * fall) * Math.min(1, time / 0.004);
    }
    room.echoes.forEach((delay, nth) => {
      const echo = filtered(noise(Math.round(0.03 * rate), random), [['bandpass', 900, 0.8]], rate);
      mixInto(out, shaped(echo, struck(0.002, 0.008, 0.03)), delay * rate, 0.6 / (nth + 1));
    });
    let power = 0;
    for (const value of out) power += value * value;
    const scale = power > 0 ? 1 / Math.sqrt(power) : 0;
    for (let i = 0; i < length; i++) out[i] = (out[i] ?? 0) * scale;
    return out;
  };
  return [channel(), channel()];
}
