// The ambience's DSP kit: the seeded die, the filters, and the few shapes every bed and call is cut from. DFO's own
// synthesiser kit, typed: a sound is noise and sines shaped by envelopes and second-order sections, never a recording.
// Everything takes its sample rate, so the same maker cuts a bed for the game's context and for a render's. Pure.

/** A stream of numbers in [0, 1). */
export type Random = () => number;

/** A seeded stream, the same numbers for the same seed every time (mulberry32). */
export function seeded(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

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

/** Scaled to a peak of 1, so a piece's gain in a mix is its peak there. */
export function unit(samples: Float32Array): Float32Array {
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] ?? 0) / peak;
  return samples;
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

/** A soft start over `rise` and a soft end over `fall`, both shares of the length: no sound starts or stops on an
 *  edge, as an edge is a click. */
export const swell =
  (rise: number, fall: number, power = 1) =>
  (share: number): number => {
    const up = rise > 0 ? Math.min(1, share / rise) : 1;
    const down = fall > 0 ? Math.min(1, (1 - share) / fall) : 1;
    return Math.max(0, Math.min(up, down)) ** power;
  };

/** A struck body's decay: up over `attack` seconds, falling by e every `tau` seconds after. */
export const struck =
  (attack: number, tau: number, seconds: number) =>
  (share: number): number => {
    const time = share * seconds;
    return Math.min(1, time / Math.max(1e-4, attack)) * Math.exp(-Math.max(0, time - attack) / tau);
  };

/**
 * A voiced tone: `seconds` long at `rate`, its pitch `pitch(u)` Hz and loudness `loudness(u)` at each share u of the
 * way, made of harmonics at the given strengths (the first the fundamental). A harmonic past the rate's top is left
 * out rather than folded back.
 */
export function tone(
  rate: number,
  seconds: number,
  pitch: (share: number) => number,
  loudness: (share: number) => number,
  harmonics: readonly number[] = [1],
): Float32Array {
  const length = Math.max(1, Math.round(seconds * rate));
  const out = new Float32Array(length);
  const top = rate * 0.45;
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const share = i / length;
    const hertz = pitch(share);
    phase += (2 * Math.PI * hertz) / rate;
    let sum = 0;
    harmonics.forEach((strength, nth) => {
      if (strength !== 0 && hertz * (nth + 1) < top) sum += strength * Math.sin(phase * (nth + 1));
    });
    out[i] = sum * loudness(share);
  }
  return out;
}

/** A struck body's modes: damped sines at [Hz, tau s, gain], each from rest, `seconds` long. */
export function modes(
  rate: number,
  seconds: number,
  list: readonly (readonly [number, number, number])[],
): Float32Array {
  const length = Math.max(1, Math.round(seconds * rate));
  const out = new Float32Array(length);
  const fade = Math.round(0.012 * rate);
  for (const [hertz, tau, gain] of list) {
    if (hertz > rate * 0.45) continue;
    const omega = (2 * Math.PI * hertz) / rate;
    for (let i = 0; i < length; i++) {
      const edge = Math.min(1, (length - i) / fade, i / Math.max(1, rate * 0.0004));
      out[i] = (out[i] ?? 0) + gain * Math.sin(omega * i) * Math.exp(-i / (tau * rate)) * edge;
    }
  }
  return out;
}

/** A burst of noise through a band, enveloped and scaled to a peak of 1: a crack, a knock's grit, a tick. */
export function burst(rate: number, random: Random, hertz: number, quality: number, tau: number): Float32Array {
  const seconds = tau * 8 + 0.004;
  const samples = filtered(noise(Math.round(seconds * rate), random), [['bandpass', hertz, quality]], rate);
  return unit(shaped(samples, struck(0.0003, tau, seconds)));
}

/** A bubble: a sine whose pitch climbs from `from` toward `to` as it rings (water's bloop). */
export function bubble(rate: number, from: number, to: number, rise: number, tau: number): Float32Array {
  const seconds = tau * 7;
  return tone(
    rate,
    seconds,
    (share) => to - (to - from) * Math.exp((-share * seconds) / rise),
    struck(0.0008, tau, seconds),
  );
}

/** A slow random wobble, 0 to 1, `hertz` new values a second joined smoothly: a drag's roughness. */
export function wobble(length: number, rate: number, random: Random, hertz: number): Float32Array {
  const out = new Float32Array(length);
  const step = Math.max(1, Math.round(rate / hertz));
  let [from, to] = [random(), random()];
  for (let i = 0; i < length; i++) {
    const within = i % step;
    if (within === 0 && i > 0) [from, to] = [to, random()];
    out[i] = from + (to - from) * ((1 - Math.cos((Math.PI * within) / step)) / 2);
  }
  return out;
}

/** Wood groaning, a rope stretching: a stick-slip train of pulses at `pulses(u)` a second, jittered, weighed by
 *  `loudness(u)`, ringing the given bands [Hz, Q, gain], a breath of friction under it. */
export function groan(
  rate: number,
  random: Random,
  seconds: number,
  pulses: (share: number) => number,
  bands: readonly (readonly [number, number, number])[],
  loudness: (share: number) => number,
  breath = 0.1,
): Float32Array {
  const length = Math.round(seconds * rate);
  const train = new Float32Array(length);
  for (let time = 0.002; time < seconds;) {
    const index = Math.round(time * rate);
    if (index < length) train[index] = (train[index] ?? 0) + (0.6 + 0.4 * random()) * loudness(time / seconds);
    time += (1 / Math.max(4, pulses(time / seconds))) * (1 + 0.28 * (2 * random() - 1));
  }
  const out = new Float32Array(length);
  for (const [hertz, quality, gain] of bands)
    mixInto(out, filtered(train, [['bandpass', hertz, quality]], rate), 0, gain);
  unit(out);
  const friction = unit(filtered(noise(length, random), [['bandpass', 900, 0.9]], rate));
  for (let i = 0; i < length; i++) out[i] = (out[i] ?? 0) + (friction[i] ?? 0) * breath * loudness(i / length);
  return unit(out);
}

/** A one-pole low-pass whose corner moves from `from` to `to` Hz over `tau` seconds: a crash losing its top. */
export function sweptLowpass(samples: Float32Array, rate: number, from: number, to: number, tau: number): Float32Array {
  const out = new Float32Array(samples.length);
  let held = 0;
  for (let i = 0; i < samples.length; i++) {
    const hertz = to + (from - to) * Math.exp(-i / (tau * rate));
    const keep = Math.exp((-2 * Math.PI * hertz) / rate);
    held = (1 - keep) * (samples[i] ?? 0) + keep * held;
    out[i] = held;
  }
  return out;
}

/** Grains: `count` short bursts through bands drawn between `low` and `high` Hz, at times drawn in [from, to]
 *  seconds, each `loudness(u)` of where it falls: leaves, sand, grit, a rustle that crackles rather than hisses. */
export function grains(
  into: Float32Array,
  rate: number,
  random: Random,
  spread: {
    readonly count: number;
    readonly from: number;
    readonly to: number;
    readonly low: number;
    readonly high: number;
    readonly tau: readonly [number, number];
    readonly gain: number;
    readonly loudness?: (share: number) => number;
    readonly wrap?: boolean;
  },
): Float32Array {
  for (let nth = 0; nth < spread.count; nth++) {
    const share = random();
    const grain = burst(rate, random, between(random, [spread.low, spread.high]), 1.4, between(random, spread.tau));
    const loud = random() < 0.12 ? 1.8 : 1;
    const offset = (spread.from + (spread.to - spread.from) * share) * rate;
    const gain = spread.gain * loud * (0.25 + 0.75 * random()) * (spread.loudness?.(share) ?? 1);
    mixInto(into, grain, offset, gain, spread.wrap);
  }
  return into;
}

/** Soft saturation, a ceiling no peak passes. */
export function softened(samples: Float32Array, drive = 1.2): Float32Array {
  const norm = Math.tanh(drive);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.tanh((samples[i] ?? 0) * drive) / norm;
  return samples;
}

/** Darkens a far call and lays the hills' two echoes after it. */
export function far(rate: number, voice: Float32Array, corner: number, seconds: number, echoes = true): Float32Array {
  const dark = filtered(
    voice,
    [
      ['lowpass', corner, 0.7],
      ['lowpass', corner, 0.7],
    ],
    rate,
  );
  const out = new Float32Array(Math.max(1, Math.round(seconds * rate)));
  mixInto(out, dark, 0, 1);
  if (echoes) {
    mixInto(out, filtered(dark, [['lowpass', corner / 2, 0.7]], rate), 0.21 * rate, 0.32);
    mixInto(out, filtered(dark, [['lowpass', corner / 2.8, 0.7]], rate), 0.47 * rate, 0.16);
  }
  return out;
}

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
