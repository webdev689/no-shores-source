// The ambience's beds: a few seconds each of seeded noise and of events laid round a loop, cut by chains of
// sections, made the way DFO made its sea's and its wind's. Noise repeats nowhere an ear can find, and what makes a
// sea or a gale of it (a swell, a gust) is the gain the engine moves live, never baked in.
// Seamless: each layer's source is periodic (noise as made, events wrapped round the loop's end), and its chain is
// run over it twice with the second pass kept, so the last sample runs into the first as any sample into the next.
// Each bed is levelled last, to one loudness, so a scape's gain means the same whatever its bed is made of. Mono: the
// engine plays two of one bed half a loop apart, one to each ear, for a bed as wide as the air. Pure.

import { CALLS, type Maker } from './calls.ts';
import {
  type Random,
  type Section,
  between,
  burst,
  bubble,
  grains,
  mixInto,
  noise,
  runSection,
  seeded,
  shaped,
  swell,
  tone,
} from './dsp.ts';
import { NOISES, murmurVoice } from './noises.ts';

/** A layer's events, laid into its loop with `wrap`, so what runs past the end comes round to the start. */
type Texture = (into: Float32Array, rate: number, random: Random) => void;

/** A layer: white noise or a texture of events, through its chain, at its gain. */
interface Layer {
  readonly source: 'noise' | Texture;
  readonly chain: readonly Section[];
  readonly gain: number;
}

/** A bed: its length, the rate it is made at, its seed and its layers. */
export interface BedSpec {
  readonly seconds: number;
  readonly rate: number;
  readonly seed: number;
  readonly layers: readonly Layer[];
}

/** Every bed's loudness as made (-20 dBFS), unless its peak would pass PEAK_MOST first. */
export const BED_RMS = 0.1;
const PEAK_MOST = 0.95;

const layer = (source: Layer['source'], chain: readonly Section[], gain = 1): Layer => ({ source, chain, gain });

/** Events at random through the loop, `perSecond` of them, each a call of `make`'s at a gain drawn in `gain`. */
const scattered =
  (make: Maker, perSecond: number, gain: readonly [number, number]): Texture =>
  (into, rate, random) => {
    const count = Math.round((perSecond * into.length) / rate);
    for (let nth = 0; nth < count; nth++)
      mixInto(into, make(rate, random), random() * into.length, between(random, gain), true);
  };

/** A chorus of crickets, each chirping on its own steady beat on its own carrier, some near and most far. */
const crickets =
  (count: number): Texture =>
  (into, rate, random) => {
    for (let one = 0; one < count; one++) {
      const carrier = between(random, [3700, 5300]);
      const beat = between(random, [0.35, 0.9]);
      const pulses = 2 + Math.floor(random() * 4);
      const gain = between(random, [0.15, 1]) ** 2;
      const pulse = tone(rate, 0.012, () => carrier, swell(0.25, 0.4), [1, 0.04]);
      for (let time = random() * beat; time < into.length / rate; time += beat * between(random, [0.96, 1.04]))
        for (let nth = 0; nth < pulses; nth++) mixInto(into, pulse, (time + nth * 0.028) * rate, gain, true);
    }
  };

/** Leaves stirring: a crackle of grains whose loudness rises and falls `cycles` whole times round the loop. */
const rustle =
  (perSecond: number, cycles: number, low: number, high: number): Texture =>
  (into, rate, random) =>
    void grains(into, rate, random, {
      count: Math.round((perSecond * into.length) / rate),
      from: 0,
      to: into.length / rate,
      low,
      high,
      tau: [0.0005, 0.002],
      gain: 0.5,
      loudness: (share) => 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(2 * Math.PI * cycles * share)),
      wrap: true,
    });

/** Quiet water lapping at a quay: small sloshes and plips at uneven times. */
const laps: Texture = (into, rate, random) => {
  const count = Math.round((2.2 * into.length) / rate);
  for (let nth = 0; nth < count; nth++) {
    const slosh = shaped(
      noise(Math.round(0.3 * rate), random),
      (share) => Math.exp(-share * 6) * Math.min(1, share * 40),
    );
    mixInto(into, slosh, random() * into.length, between(random, [0.3, 0.8]), true);
    const pitch = between(random, [500, 1400]);
    mixInto(
      into,
      bubble(rate, pitch, pitch * 1.5, 0.01, 0.012),
      random() * into.length,
      between(random, [0.05, 0.2]),
      true,
    );
  }
};

/** Running water: many small bubbles at uneven times. */
const babbling: Texture = (into, rate, random) => {
  const count = Math.round((45 * into.length) / rate);
  for (let nth = 0; nth < count; nth++) {
    const pitch = between(random, [280, 1700]);
    mixInto(
      into,
      bubble(rate, pitch, pitch * between(random, [1.3, 2]), 0.008, between(random, [0.006, 0.02])),
      random() * into.length,
      between(random, [0.1, 0.5]),
      true,
    );
  }
};

/** Fine sand or snow blown along the ground. */
const drift =
  (perSecond: number, low: number, high: number): Texture =>
  (into, rate, random) =>
    void grains(into, rate, random, {
      count: Math.round((perSecond * into.length) / rate),
      from: 0,
      to: into.length / rate,
      low,
      high,
      tau: [0.0002, 0.0008],
      gain: 0.4,
      wrap: true,
    });

/** A crowd far off: many voices at once, a few nearer. */
const crowd: Texture = (into, rate, random) => {
  const count = Math.round((34 * into.length) / rate);
  for (let nth = 0; nth < count; nth++)
    mixInto(into, murmurVoice(rate, random), random() * into.length, between(random, [0.08, 0.6]) ** 1.5, true);
  const laughs = Math.round((0.3 * into.length) / rate);
  for (let nth = 0; nth < laughs; nth++) {
    const pitch = between(random, [180, 300]);
    const start = random() * into.length;
    for (let laugh = 0; laugh < 4; laugh++)
      mixInto(
        into,
        tone(rate, 0.09, () => pitch * (1 - laugh * 0.04), swell(0.2, 0.5), [1, 0.6, 0.4, 0.2]),
        start + laugh * 0.15 * rate,
        0.25,
        true,
      );
  }
};

/** A cicada chorus: buzzing swells overlapping, and a few clicks of the nearest. */
const cicadas: Texture = (into, rate, random) => {
  const count = Math.round((0.9 * into.length) / rate);
  for (let nth = 0; nth < count; nth++)
    mixInto(into, CALLS.cicada(rate, random), random() * into.length, between(random, [0.2, 1]) ** 2, true);
};

/** A frog chorus: croaks and peeps all about. */
const frogs: Texture = (into, rate, random) => {
  scattered(CALLS['frog.croak'], 2.4, [0.1, 0.6])(into, rate, random);
  scattered(CALLS['frog.peeps'], 0.9, [0.05, 0.35])(into, rate, random);
  scattered(CALLS['frog.bull'], 0.25, [0.2, 0.6])(into, rate, random);
};

/** A ship's timbers working softly all the while. */
const timbers: Texture = (into, rate, random) => {
  scattered(NOISES['hull.creak'], 0.55, [0.2, 0.7])(into, rate, random);
  const knocks = Math.round((0.8 * into.length) / rate);
  for (let nth = 0; nth < knocks; nth++)
    mixInto(into, burst(rate, random, between(random, [300, 600]), 2, 0.01), random() * into.length, 0.15, true);
};

const LOW = 11025;
const MID = 22050;
const HIGH = 32000;

/** The beds, by key. */
export const BEDS = {
  /** The open sea's body: a deep wash under 500 Hz, the roll a swell makes against a hull and itself. */
  'sea.swell': {
    seconds: 14,
    rate: LOW,
    seed: 0x5ea5e11,
    layers: [
      layer('noise', [
        ['lowpass', 520, 0.7],
        ['lowpass', 380, 0.8],
        ['highpass', 40, 0.7],
      ]),
      layer('noise', [['bandpass', 160, 0.9]], 0.5),
    ],
  },
  /** Water running past a hull under way: a hiss about 1.5 kHz, gone past 5. */
  'sea.wash': {
    seconds: 10,
    rate: MID,
    seed: 0x5eaa45a,
    layers: [
      layer('noise', [
        ['bandpass', 1500, 0.55],
        ['lowpass', 4800, 0.707],
      ]),
    ],
  },
  /** Wind in the rigging: two narrow resonances a fifth apart, a moan in the lines. */
  'sea.rigging': {
    seconds: 12,
    rate: LOW,
    seed: 0x51661a6,
    layers: [
      layer('noise', [
        ['bandpass', 410, 14],
        ['bandpass', 410, 14],
      ]),
      layer(
        'noise',
        [
          ['bandpass', 615, 16],
          ['bandpass', 615, 16],
        ],
        0.6,
      ),
      layer('noise', [['bandpass', 900, 1.2]], 0.25),
    ],
  },
  /** A ship's timbers working all the while, softly. */
  'deck.timbers': {
    seconds: 13,
    rate: LOW,
    seed: 0x7ab3e5,
    layers: [layer(timbers, [['lowpass', 2400, 0.7]]), layer('noise', [['lowpass', 260, 0.7]], 0.15)],
  },
  /** A wave breaking on a shore: a low body and a brighter spray over it. */
  'shore.surf': {
    seconds: 12,
    rate: MID,
    seed: 0x5a0f5e1,
    layers: [
      layer('noise', [
        ['lowpass', 700, 0.7],
        ['highpass', 45, 0.7],
      ]),
      layer(
        'noise',
        [
          ['highpass', 1800, 0.6],
          ['lowpass', 7000, 0.707],
        ],
        0.45,
      ),
    ],
  },
  /** Quiet water at a quay: a soft band and its sloshes. */
  'shore.lap': {
    seconds: 9,
    rate: MID,
    seed: 0x1a91a9,
    layers: [
      layer(
        'noise',
        [
          ['bandpass', 700, 0.9],
          ['lowpass', 2400, 0.707],
        ],
        0.5,
      ),
      layer(laps, [
        ['lowpass', 2600, 0.7],
        ['highpass', 90, 0.7],
      ]),
    ],
  },
  /** A brook or a river running: its two bands and its bubbling. */
  'water.brook': {
    seconds: 10,
    rate: MID,
    seed: 0xb200c,
    layers: [
      layer('noise', [['bandpass', 550, 0.6]]),
      layer('noise', [['bandpass', 2400, 0.9]], 0.5),
      layer(babbling, [['highpass', 200, 0.7]], 0.8),
    ],
  },
  /** A light wind over open ground: a soft whoosh and a little air over it. */
  'wind.breeze': {
    seconds: 12,
    rate: MID,
    seed: 0xb4ee2e,
    layers: [
      layer('noise', [
        ['bandpass', 700, 0.5],
        ['lowpass', 2600, 0.7],
      ]),
      layer('noise', [['bandpass', 2800, 0.8]], 0.2),
    ],
  },
  /** A strong wind's low moan over hills and ice. */
  'wind.moan': {
    seconds: 14,
    rate: LOW,
    seed: 0x3a0a11,
    layers: [
      layer('noise', [
        ['bandpass', 240, 1.4],
        ['lowpass', 900, 0.7],
      ]),
      layer('noise', [['bandpass', 470, 3]], 0.45),
    ],
  },
  /** A gale's thin whistle over edges: narrow bands high up. */
  'wind.whistle': {
    seconds: 11,
    rate: MID,
    seed: 0x3415e,
    layers: [
      layer('noise', [
        ['bandpass', 1350, 12],
        ['bandpass', 1350, 12],
      ]),
      layer(
        'noise',
        [
          ['bandpass', 2200, 16],
          ['bandpass', 2200, 16],
        ],
        0.6,
      ),
      layer('noise', [['bandpass', 700, 1]], 0.35),
    ],
  },
  /** Sand blown along the ground: a fine hiss full of grains. */
  'wind.sand': {
    seconds: 9,
    rate: HIGH,
    seed: 0x5a4d,
    layers: [
      layer(
        'noise',
        [
          ['highpass', 3500, 0.7],
          ['lowpass', 9000, 0.7],
        ],
        0.6,
      ),
      layer(drift(520, 3000, 8500), [['highpass', 1500, 0.7]]),
    ],
  },
  /** Snow blown over a frozen waste: a thinner, colder hiss. */
  'wind.snow': {
    seconds: 9,
    rate: HIGH,
    seed: 0x5e0b,
    layers: [
      layer(
        'noise',
        [
          ['highpass', 5000, 0.7],
          ['lowpass', 11000, 0.7],
        ],
        0.7,
      ),
      layer(drift(240, 4500, 10000), [['highpass', 2500, 0.7]], 0.6),
    ],
  },
  /** A wood's canopy stirring: leaves' crackle swelling and falling, and their hiss. */
  'leaves': {
    seconds: 13,
    rate: MID,
    seed: 0x1eaf5,
    layers: [
      layer('noise', [['bandpass', 2600, 0.7]], 0.4),
      layer(rustle(600, 3, 1800, 5800), [['highpass', 800, 0.7]]),
    ],
  },
  /** Tall grass in the wind: a lighter rustle. */
  'grass': {
    seconds: 12,
    rate: MID,
    seed: 0x62a55,
    layers: [
      layer(
        'noise',
        [
          ['bandpass', 1800, 0.6],
          ['lowpass', 6000, 0.7],
        ],
        0.8,
      ),
      layer(rustle(260, 2, 2500, 7000), [['highpass', 1200, 0.7]], 0.6),
    ],
  },
  /** A cicada chorus in the heat of the day. */
  'insects.cicadas': {
    seconds: 10,
    rate: HIGH,
    seed: 0xc1cada,
    layers: [layer(cicadas, [['highpass', 2500, 0.7]]), layer('noise', [['bandpass', 5800, 4]], 0.12)],
  },
  /** Crickets at dusk and in the night. */
  'insects.crickets': {
    seconds: 9.3,
    rate: HIGH,
    seed: 0xc41c,
    layers: [layer(crickets(16), [['highpass', 2000, 0.7]])],
  },
  /** A marsh's air: a low insect drone under a thin high whine. */
  'insects.marsh': {
    seconds: 10,
    rate: MID,
    seed: 0x3a125b,
    layers: [
      layer('noise', [
        ['bandpass', 240, 3],
        ['lowpass', 900, 0.707],
      ]),
      layer('noise', [['bandpass', 4200, 6]], 0.35),
    ],
  },
  /** A frog chorus. */
  'frogs.chorus': {
    seconds: 11.3,
    rate: MID,
    seed: 0xf406,
    layers: [layer(frogs, [['highpass', 80, 0.7]]), layer('noise', [['bandpass', 300, 1]], 0.08)],
  },
  /** A rainforest's canopy dripping in the damp air. */
  'forest.drips': {
    seconds: 10.7,
    rate: MID,
    seed: 0xd419,
    layers: [
      layer('noise', [['bandpass', 380, 0.7]], 0.3),
      layer(scattered(NOISES.drip, 7, [0.05, 0.6]), [['highpass', 300, 0.7]]),
    ],
  },
  /** A city's low air below: the rumble of a town at work, far off. */
  'town.hum': {
    seconds: 12,
    rate: LOW,
    seed: 0x7044,
    layers: [
      layer('noise', [
        ['lowpass', 260, 0.7],
        ['highpass', 50, 0.7],
      ]),
      layer('noise', [['bandpass', 120, 1]], 0.5),
    ],
  },
  /** A market's crowd far below: many voices, none clear. */
  'town.crowd': {
    seconds: 13,
    rate: MID,
    seed: 0xc40bd,
    layers: [
      layer(crowd, [
        ['lowpass', 1600, 0.7],
        ['highpass', 90, 0.7],
      ]),
      layer(
        'noise',
        [
          ['bandpass', 500, 0.7],
          ['lowpass', 1500, 0.7],
        ],
        0.06,
      ),
    ],
  },
} satisfies Record<string, BedSpec>;

export type BedKey = keyof typeof BEDS;

/** A bed's samples: its layers each made from its source and run through its chain twice (the seam's law), summed at
 *  their gains and levelled. Mono floats at the bed's own rate. */
export function bedSamples(spec: BedSpec): Float32Array {
  const length = Math.max(1, Math.round(spec.rate * spec.seconds));
  const random = seeded(spec.seed);
  const sum = new Float64Array(length);
  for (const { source, chain, gain } of spec.layers) {
    const raw = source === 'noise' ? noise(length, random) : new Float32Array(length);
    if (source !== 'noise') source(raw, spec.rate, random);
    const states = chain.map(() => [0, 0, 0, 0]);
    const passed = new Float64Array(length);
    for (let pass = 0; pass < 2; pass++) {
      passed.set(raw);
      chain.forEach((section, nth) => runSection(passed, section, spec.rate, states[nth] ?? [0, 0, 0, 0]));
    }
    for (let i = 0; i < length; i++) sum[i] = (sum[i] ?? 0) + (passed[i] ?? 0) * gain;
  }
  let [power, peak] = [0, 0];
  for (const value of sum) [power, peak] = [power + value * value, Math.max(peak, Math.abs(value))];
  const rms = Math.sqrt(power / length);
  const scale = rms > 0 ? Math.min(BED_RMS / rms, PEAK_MOST / peak) : 0;
  return Float32Array.from(sum, (value) => value * scale);
}
