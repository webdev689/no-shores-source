// The weather's own sounds, made by the synthesiser: the rain's beds (the steady hiss of many drops, the near patter,
// a city's gutters dripping, rain drumming on a ship's canvas and planks) and thunder (a near ground strike's crack
// and rip, a far strike's long low roll). Beds loop without a seam as every bed does (beds.ts); each thunder is one
// take, peaking at 1. Pure.

import type { BedSpec } from './beds.ts';
import type { Maker } from './calls.ts';
import {
  type Random,
  between,
  bubble,
  burst,
  filtered,
  grains,
  mixInto,
  noise,
  shaped,
  softened,
  struck,
  unit,
  wobble,
} from './dsp.ts';

type Texture = (into: Float32Array, rate: number, random: Random) => void;

/** Drops at random through a loop, `perSecond` of them: each a short burst in a band drawn in `band`, Hz. */
const drops =
  (perSecond: number, band: readonly [number, number], tau: readonly [number, number], gain: number): Texture =>
  (into, rate, random) =>
    void grains(into, rate, random, {
      count: Math.round((perSecond * into.length) / rate),
      from: 0,
      to: into.length / rate,
      low: band[0],
      high: band[1],
      tau,
      gain,
      wrap: true,
    });

/** Gutters and eaves dripping: each drips on its own slow beat, a few splashing into a puddle with a bloop. */
const gutters: Texture = (into, rate, random) => {
  const seconds = into.length / rate;
  for (let gutter = 0; gutter < 9; gutter++) {
    const beat = between(random, [0.25, 1.4]);
    const pitch = between(random, [700, 2600]);
    const gain = between(random, [0.2, 1]) ** 1.5;
    for (let time = random() * beat; time < seconds; time += beat * between(random, [0.8, 1.2])) {
      const drop = bubble(rate, pitch, pitch * 1.5, 0.006, between(random, [0.008, 0.02]));
      mixInto(into, drop, time * rate, gain * between(random, [0.6, 1]), true);
      mixInto(into, burst(rate, random, 3200, 1.4, 0.002), time * rate, gain * 0.4, true);
    }
  }
};

/** Rain on stretched canvas and on planks: a soft drumming low in the cloth, and crisp ticks on the wood. */
const canvasAndPlanks: Texture = (into, rate, random) => {
  drops(70, [180, 520], [0.004, 0.012], 0.7)(into, rate, random);
  drops(45, [1400, 3600], [0.0008, 0.002], 0.5)(into, rate, random);
};

const RATE = 32000;

/** The rain's beds, by key, made and levelled as every bed is. */
export const RAIN_BEDS = {
  /** A steady hiss of many drops: rain falling all round, too many to tell one from the next. */
  'rain.hiss': {
    seconds: 10,
    rate: RATE,
    seed: 0x4a1255,
    layers: [
      {
        source: 'noise',
        chain: [
          ['highpass', 900, 0.6],
          ['lowpass', 9000, 0.7],
        ],
        gain: 0.6,
      },
      { source: drops(1400, [2500, 9000], [0.0003, 0.001], 0.3), chain: [['highpass', 1500, 0.7]], gain: 1 },
    ],
  },
  /** The rain near: drops striking the ground, leaves and stones round the ear, each heard. */
  'rain.patter': {
    seconds: 9.4,
    rate: RATE,
    seed: 0x9a77e4,
    layers: [
      { source: drops(90, [700, 4200], [0.001, 0.004], 0.6), chain: [['highpass', 300, 0.7]], gain: 1 },
      { source: 'noise', chain: [['bandpass', 1200, 0.6]], gain: 0.15 },
    ],
  },
  /** A city's gutters and eaves dripping into the streets. */
  'rain.gutters': {
    seconds: 11.1,
    rate: RATE,
    seed: 0x6077e5,
    layers: [{ source: gutters, chain: [['highpass', 250, 0.7]], gain: 1 }],
  },
  /** Rain on a ship's sails and deck. */
  'rain.deck': {
    seconds: 9.7,
    rate: RATE,
    seed: 0xdec4a1,
    layers: [
      { source: canvasAndPlanks, chain: [['highpass', 120, 0.7]], gain: 1 },
      { source: 'noise', chain: [['bandpass', 2400, 0.7]], gain: 0.12 },
    ],
  },
} satisfies Record<string, BedSpec>;

const length = (rate: number, seconds: number) => new Float32Array(Math.max(1, Math.round(seconds * rate)));

/** Thunder's rumble: low noise whose loudness rolls in uneven swells, as the sound comes in from each part of the
 *  bolt's length at its own distance: `lobes` swells through `seconds`, its top at `corner` Hz. */
function rumble(rate: number, random: Random, seconds: number, corner: number, lobes: number): Float32Array {
  const body = filtered(
    noise(Math.round(seconds * rate), random),
    [
      ['lowpass', corner, 0.7],
      ['lowpass', corner, 0.7],
      ['highpass', 28, 0.7],
    ],
    rate,
  );
  const swells = Array.from({ length: lobes }, (unused, nth) => ({
    at: (seconds * (nth + between(random, [0.2, 0.9]))) / lobes,
    width: between(random, [0.5, 1.4]),
    height: between(random, [0.4, 1]),
  }));
  const roll = wobble(body.length, rate, random, 6);
  for (let i = 0; i < body.length; i++) {
    const time = i / rate;
    const loud = swells.reduce(
      (sum, swell) => sum + swell.height * Math.exp(-(((time - swell.at) / swell.width) ** 2)),
      0,
    );
    body[i] = (body[i] ?? 0) * loud * (0.55 + 0.45 * (roll[i] ?? 0));
  }
  return unit(body);
}

/** A near ground strike: one sharp crack, a ripping crackle along the bolt, a boom, and its rumble rolling away. */
const thunderCrack: Maker = (rate, random) => {
  const seconds = between(random, [5.5, 7]);
  const out = length(rate, seconds);
  const crack = filtered(noise(Math.round(0.12 * rate), random), [['highpass', 400, 0.7]], rate);
  mixInto(out, unit(shaped(crack, struck(0.0015, 0.025, 0.12))), 0, 1);
  const ripS = between(random, [0.45, 0.8]);
  for (let nth = 0; nth < 140; nth++) {
    const into = ripS * random() ** 1.6;
    const snap = burst(rate, random, between(random, [600, 5500]), 1.2, between(random, [0.001, 0.006]));
    mixInto(out, snap, (0.01 + into) * rate, (1 - into / ripS) * between(random, [0.2, 0.7]));
  }
  const boom = filtered(noise(Math.round(1.2 * rate), random), [['lowpass', 110, 0.8]], rate);
  mixInto(out, unit(shaped(boom, struck(0.02, 0.35, 1.2))), 0.03 * rate, 0.9);
  const tail = rumble(rate, random, seconds - 0.4, 260, 4);
  shaped(tail, (share) => Math.min(1, share * 8) * (1 - share) ** 1.5);
  mixInto(out, tail, 0.35 * rate, 0.6);
  return softened(unit(out), 1.3);
};

/** A far strike: no crack, only a long low roll swelling and falling, the bolt's far end coming last. */
const thunderRoll: Maker = (rate, random) => {
  const seconds = between(random, [8, 11]);
  const body = rumble(rate, random, seconds, between(random, [220, 380]), 5);
  return unit(shaped(body, (share) => Math.min(1, share * 6) ** 2 * (1 - share) ** 1.2));
};

/** Thunder, by key. */
export const THUNDER: Readonly<Record<'thunder.crack' | 'thunder.roll', Maker>> = {
  'thunder.crack': thunderCrack,
  'thunder.roll': thunderRoll,
};
