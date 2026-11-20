// The world's own noises, made from sines and noise: a ship's timbers and canvas, the shore's waves, the ground's
// stones, sand and ice, the wind's gusts, and a port city's bell, anvil, hammers and carts. Each is one sound, `rate`
// samples a second, from its seeded die, peaking at 1 with soft edges. Pure.

import type { Maker } from './calls.ts';
import {
  between,
  bubble,
  burst,
  coefficients,
  filtered,
  grains,
  groan,
  mixInto,
  modes,
  noise,
  shaped,
  softened,
  struck,
  swell,
  sweptLowpass,
  tone,
  unit,
  wobble,
} from './dsp.ts';

const length = (rate: number, seconds: number) => new Float32Array(Math.max(1, Math.round(seconds * rate)));

/** A hull's timbers working in the sea: a slow stick-slip through the wood's low bands. */
const hullCreak: Maker = (rate, random) => {
  const seconds = between(random, [0.8, 1.8]);
  const start = between(random, [25, 45]);
  const end = start * between(random, [1.2, 2.2]);
  const bands = [
    [between(random, [160, 210]), 4, 1],
    [between(random, [380, 460]), 5, 0.7],
    [between(random, [850, 1050]), 3, 0.35],
  ] as const;
  return groan(rate, random, seconds, (share) => start + (end - start) * share, bands, swell(0.3, 0.4), 0.08);
};

/** A rope stretching round a pin or a block: a quicker, higher stick-slip. */
const ropeCreak: Maker = (rate, random) => {
  const seconds = between(random, [0.35, 0.8]);
  const start = between(random, [140, 200]);
  const bands = [
    [between(random, [600, 720]), 6, 1],
    [between(random, [1300, 1500]), 6, 0.6],
    [2600, 5, 0.3],
  ] as const;
  return groan(rate, random, seconds, (share) => start * (1 + 0.9 * share), bands, swell(0.25, 0.35), 0.05);
};

/** The sea slapping a hull: a low thump and the water's slosh falling away, a few drops. */
const hullSlap: Maker = (rate, random) => {
  const out = length(rate, 1);
  const thump = filtered(noise(Math.round(0.4 * rate), random), [['lowpass', 220, 0.8]], rate);
  mixInto(out, unit(shaped(thump, struck(0.004, 0.05, 0.4))), 0, 0.9);
  const slosh = shaped(noise(Math.round(0.9 * rate), random), struck(0.01, 0.18, 0.9));
  mixInto(out, unit(sweptLowpass(slosh, rate, 2400, 450, 0.18)), 0.01 * rate, 0.6);
  for (let drop = 0; drop < 4; drop++) {
    const pitch = between(random, [700, 1600]);
    mixInto(out, bubble(rate, pitch, pitch * 1.5, 0.01, 0.01), between(random, [0.15, 0.7]) * rate, 0.12);
  }
  return softened(unit(out));
};

/** A heavier sea against her bow: a boom and its spray. */
const bowThump: Maker = (rate, random) => {
  const out = length(rate, 2);
  const boom = filtered(noise(Math.round(0.8 * rate), random), [['lowpass', 130, 0.8]], rate);
  mixInto(out, unit(shaped(boom, struck(0.01, 0.12, 0.8))), 0, 1);
  const spray = shaped(noise(Math.round(1.8 * rate), random), struck(0.06, 0.4, 1.8));
  mixInto(out, unit(sweptLowpass(spray, rate, 6000, 900, 0.4)), 0.04 * rate, 0.55);
  return softened(unit(out));
};

/** Canvas filling or shaking: two to four thwaps, a flutter after. */
const canvasFlap: Maker = (rate, random) => {
  const out = length(rate, 1.5);
  let time = 0.01;
  const count = 2 + Math.floor(random() * 3);
  for (let nth = 0; nth < count; nth++) {
    const thwap = filtered(noise(Math.round(0.25 * rate), random), [['lowpass', 520, 0.7]], rate);
    mixInto(out, unit(shaped(thwap, struck(0.003, 0.03, 0.25))), time * rate, 1 - nth * 0.15);
    mixInto(out, burst(rate, random, 1100, 1, 0.02), time * rate, 0.35);
    time += between(random, [0.12, 0.3]);
  }
  const flutter = filtered(noise(Math.round(0.5 * rate), random), [['bandpass', 800, 1.2]], rate);
  const shake = (share: number) => (1 - share) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 12 * share * 0.5));
  mixInto(out, unit(shaped(flutter, shake)), time * rate, 0.25);
  return softened(unit(out));
};

/** A block in the rigging knocking on wood, once or twice. */
const blockKnock: Maker = (rate, random) => {
  const out = length(rate, 0.6);
  const body = (gain: number) => {
    const pitch = between(random, [480, 560]);
    const knock = modes(rate, 0.25, [
      [pitch, 0.02, 1],
      [pitch * 2.45, 0.012, 0.5],
      [pitch * 4.6, 0.006, 0.25],
    ]);
    mixInto(knock, burst(rate, random, 1800, 1.2, 0.003), 0, 0.4);
    return shaped(unit(knock), () => gain);
  };
  mixInto(out, body(1), 0.005 * rate, 1);
  if (random() < 0.4) mixInto(out, body(0.55), between(random, [0.12, 0.25]) * rate, 1);
  return unit(out);
};

/** A wave breaking on a shore: its roar rising as it curls, the crash, the foam running back. */
const surfCrash: Maker = (rate, random) => {
  const [curl, run] = random() < 0.5 ? [0.85, 1.1] : [1.05, 1.3];
  const seconds = curl + run * 2.2;
  const out = length(rate, seconds);
  const rising = noise(Math.round((curl + 0.1) * rate), random);
  shaped(rising, (share) => Math.min(1, (share * (curl + 0.1)) / curl) ** 1.8 * Math.min(1, (1 - share) * 10));
  mixInto(out, unit(sweptLowpass(rising, rate, 350, 2600, curl * 0.5)), 0, 0.55);
  const hit = shaped(noise(Math.round((seconds - curl) * rate), random), struck(0.015, run, seconds - curl));
  mixInto(out, unit(sweptLowpass(hit, rate, 5200, 900, run)), curl * rate, 1);
  const boom = filtered(noise(Math.round(0.6 * rate), random), [['lowpass', 180, 0.8]], rate);
  mixInto(out, unit(shaped(boom, struck(0.012, 0.14, 0.6))), curl * rate, 0.6);
  grains(out, rate, random, {
    count: 40,
    from: curl + 0.2,
    to: seconds - 0.2,
    low: 2400,
    high: 4600,
    tau: [0.0015, 0.004],
    gain: 0.08,
  });
  return softened(shaped(unit(out), swell(0.01, 0.08)), 1.15);
};

/** The backwash dragging a beach's pebbles: a falling hiss full of ticks. */
const backwash: Maker = (rate, random) => {
  const seconds = between(random, [1.4, 2.2]);
  const out = length(rate, seconds);
  const fade = (share: number) => swell(0.2, 0.6)(share);
  grains(out, rate, random, {
    count: 220,
    from: 0,
    to: seconds,
    low: 1600,
    high: 5200,
    tau: [0.0008, 0.003],
    gain: 0.5,
    loudness: fade,
  });
  const hiss = shaped(noise(out.length, random), fade);
  mixInto(out, unit(sweptLowpass(hiss, rate, 4000, 800, seconds / 2)), 0, 0.4);
  return unit(out);
};

/** A dry twig snapping underfoot or under a beast. */
const twigSnap: Maker = (rate, random) => {
  const out = length(rate, 0.3);
  mixInto(out, burst(rate, random, 2600, 1, 0.004), 0, 1);
  mixInto(out, burst(rate, random, 1200, 1.2, 0.01), 0.004 * rate, 0.6);
  grains(out, rate, random, {
    count: 6,
    from: 0.01,
    to: 0.12,
    low: 2000,
    high: 4500,
    tau: [0.0008, 0.002],
    gain: 0.35,
  });
  return unit(out);
};

/** A bough creaking as the wind leans on it. */
const branchCreak: Maker = (rate, random) => {
  const seconds = between(random, [1.4, 2.6]);
  const start = between(random, [18, 32]);
  const bands = [
    [between(random, [230, 290]), 5, 1],
    [between(random, [560, 680]), 6, 0.6],
    [1300, 4, 0.2],
  ] as const;
  return groan(
    rate,
    random,
    seconds,
    (share) => start * (1 + Math.sin(Math.PI * share)),
    bands,
    swell(0.35, 0.35),
    0.06,
  );
};

/** A gust through the leaves of one tree: a crackling swell. */
const leafGust: Maker = (rate, random) => {
  const seconds = between(random, [2.5, 4]);
  const out = length(rate, seconds);
  const gust = swell(0.45, 0.45, 1.5);
  grains(out, rate, random, {
    count: Math.round(seconds * 380),
    from: 0,
    to: seconds,
    low: 1800,
    high: 5500,
    tau: [0.0005, 0.002],
    gain: 0.45,
    loudness: gust,
  });
  mixInto(out, unit(shaped(filtered(noise(out.length, random), [['bandpass', 2600, 0.7]], rate), gust)), 0, 0.25);
  return unit(out);
};

/** Stones clattering down a slope: a knock, then a run of smaller ones. */
const rockFall: Maker = (rate, random) => {
  const out = length(rate, 2.4);
  let time = 0.02;
  const count = 6 + Math.floor(random() * 9);
  for (let nth = 0; nth < count; nth++) {
    const pitch = between(random, [1500, 2600]) * (1 + nth * 0.04);
    const stone = modes(rate, 0.12, [
      [pitch, 0.012, 1],
      [pitch * 1.7, 0.007, 0.6],
      [pitch * 2.6, 0.004, 0.35],
    ]);
    mixInto(stone, burst(rate, random, 3200, 1, 0.002), 0, 0.5);
    mixInto(out, unit(stone), time * rate, (1 - (0.7 * nth) / count) * between(random, [0.5, 1]));
    time += between(random, [0.05, 0.22]) * (1 - (0.4 * nth) / count);
  }
  return unit(filtered(out, [['lowpass', 5000, 0.7]], rate));
};

/** Ice under strain: a long groan deep in it. */
const iceCreak: Maker = (rate, random) => {
  const seconds = between(random, [2, 3.2]);
  const start = between(random, [8, 16]);
  const bands = [
    [between(random, [80, 100]), 6, 1],
    [between(random, [190, 230]), 6, 0.6],
    [480, 4, 0.3],
  ] as const;
  return groan(rate, random, seconds, (share) => start * (1 + 1.5 * share), bands, swell(0.3, 0.4), 0.04);
};

/** Ice cracking: a sharp crack, its ring falling through the sheet ("pew"), and a low boom. */
const iceCrack: Maker = (rate, random) => {
  const out = length(rate, 1.6);
  mixInto(out, burst(rate, random, 1400, 0.7, 0.006), 0, 1);
  const top = between(random, [3500, 4800]);
  const ring = tone(rate, 0.5, (share) => top * Math.exp(-share * 2.6), struck(0.002, 0.12, 0.5), [1, 0.3]);
  mixInto(out, ring, 0.004 * rate, 0.55);
  const boom = filtered(noise(Math.round(0.9 * rate), random), [['lowpass', 75, 0.9]], rate);
  mixInto(out, unit(shaped(boom, struck(0.01, 0.3, 0.9))), 0, 0.7);
  return softened(unit(out));
};

/** A frozen sheet singing: only the ring, falling. */
const icePing: Maker = (rate, random) => {
  const top = between(random, [2500, 4200]);
  return unit(tone(rate, 0.7, (share) => top * Math.exp(-share * 2.2), struck(0.003, 0.18, 0.7), [1, 0.2]));
};

/** A drift of sand lifted by a gust: a fine crackling hiss. */
const sandGust: Maker = (rate, random) => {
  const seconds = between(random, [2.5, 4.5]);
  const out = length(rate, seconds);
  const gust = swell(0.45, 0.5, 1.4);
  grains(out, rate, random, {
    count: Math.round(seconds * 700),
    from: 0,
    to: seconds,
    low: 3000,
    high: 8500,
    tau: [0.0003, 0.001],
    gain: 0.4,
    loudness: gust,
  });
  mixInto(
    out,
    unit(
      shaped(
        filtered(
          noise(out.length, random),
          [
            ['highpass', 3500, 0.7],
            ['lowpass', 9500, 0.7],
          ],
          rate,
        ),
        gust,
      ),
    ),
    0,
    0.35,
  );
  return unit(out);
};

/** A gust of wind passing: a broad swell with a thin whistle riding it. */
const windGust: Maker = (rate, random) => {
  const seconds = between(random, [3, 5.5]);
  const gust = swell(0.4, 0.45, 1.6);
  const body = unit(
    shaped(
      filtered(
        noise(Math.round(seconds * rate), random),
        [
          ['bandpass', 420, 0.8],
          ['lowpass', 1600, 0.7],
        ],
        rate,
      ),
      gust,
    ),
  );
  const whistle = between(random, [800, 1400]);
  const thin = unit(
    shaped(
      filtered(
        noise(body.length, random),
        [
          ['bandpass', whistle, 14],
          ['bandpass', whistle, 14],
        ],
        rate,
      ),
      gust,
    ),
  );
  mixInto(body, thin, 0, 0.3);
  return unit(body);
};

/** The wind finding a hollow in the rocks: a narrow, wavering whistle. */
const rockWhistle: Maker = (rate, random) => {
  const seconds = between(random, [2.5, 4]);
  const pitch = between(random, [650, 1500]);
  const source = noise(Math.round(seconds * rate), random);
  const sung = new Float32Array(source.length);
  const step = Math.round(0.02 * rate);
  const state = [0, 0, 0, 0];
  for (let from = 0; from < source.length; from += step) {
    const share = from / source.length;
    const piece = source.slice(from, from + step);
    const bent = pitch * (1 + 0.06 * Math.sin(2 * Math.PI * 0.6 * share * seconds) + 0.04 * share);
    const [ahead0, , ahead2, back1, back2] = coefficients('bandpass', bent, 30, rate);
    for (let i = 0; i < piece.length; i++) {
      const value = piece[i] ?? 0;
      const out = ahead0 * value + ahead2 * (state[1] ?? 0) - back1 * (state[2] ?? 0) - back2 * (state[3] ?? 0);
      [state[1], state[0], state[3], state[2]] = [state[0] ?? 0, value, state[2] ?? 0, out];
      sung[from + i] = out;
    }
  }
  return unit(shaped(sung, swell(0.4, 0.45, 1.5)));
};

/** Marsh gas breaking the surface: a few low bubbles and a plop. */
const bubbles: Maker = (rate, random) => {
  const out = length(rate, 1.2);
  const count = 2 + Math.floor(random() * 4);
  for (let nth = 0; nth < count; nth++) {
    const pitch = between(random, [170, 420]);
    mixInto(
      out,
      bubble(rate, pitch, pitch * 1.9, 0.025, 0.035),
      between(random, [0.02, 0.8]) * rate,
      between(random, [0.4, 1]),
    );
  }
  return unit(out);
};

/** A drop falling from a leaf into water or onto leaves. */
const drip: Maker = (rate, random) => {
  const pitch = between(random, [1400, 3200]);
  const out = length(rate, 0.25);
  mixInto(out, bubble(rate, pitch, pitch * 1.6, 0.006, 0.012), 0, 1);
  mixInto(out, burst(rate, random, 3500, 1.5, 0.0015), 0, 0.3);
  return unit(out);
};

/** A fish breaking the water. */
const fishSplash: Maker = (rate, random) => {
  const out = length(rate, 0.8);
  const spray = shaped(noise(Math.round(0.5 * rate), random), struck(0.003, 0.06, 0.5));
  mixInto(out, unit(sweptLowpass(spray, rate, 4200, 600, 0.08)), 0, 1);
  for (let drop = 0; drop < 5; drop++) {
    const pitch = between(random, [800, 2000]);
    mixInto(out, bubble(rate, pitch, pitch * 1.5, 0.01, 0.008), between(random, [0.05, 0.4]) * rate, 0.2);
  }
  return unit(out);
};

/** A harbour's bell struck once: its note, the octave and a bell's 2.76 over it, and a breath-sharp twin. */
const bell: Maker = (rate, random) => {
  const pitch = between(random, [640, 700]);
  const out = modes(rate, 6, [
    [pitch, 1.6, 1],
    [pitch * 1.0035, 1.45, 0.3],
    [pitch * 2, 0.72, 0.24],
    [pitch * 2.76, 0.4, 0.1],
    [pitch * 0.5, 2.2, 0.18],
  ]);
  mixInto(out, burst(rate, random, 2800, 1, 0.004), 0, 0.08);
  return unit(out);
};

/** A hammer on an anvil: bright, unevenly tuned metal over a thud; `light` the hammer's bounce on the face between
 *  blows. */
const anvilStrike =
  (light: boolean): Maker =>
  (rate, random) => {
    const pitch = between(random, [1000, 1120]);
    const gain = light ? 0.4 : 1;
    const out = modes(rate, light ? 0.9 : 1.6, [
      [pitch, light ? 0.3 : 0.55, 1],
      [pitch * 2.31, 0.35, 0.55],
      [pitch * 3.98, 0.22, 0.35],
      [pitch * 5.75, 0.15, 0.2],
    ]);
    const thud = filtered(noise(Math.round(0.2 * rate), random), [['lowpass', 320, 0.8]], rate);
    mixInto(out, unit(shaped(thud, struck(0.001, 0.02, 0.2))), 0, light ? 0.1 : 0.45);
    mixInto(out, burst(rate, random, 4200, 1, 0.0015), 0, 0.3);
    return shaped(unit(out), () => gain);
  };

/** A moored ship's halyard slapping her mast: a tink of metal on wood. */
const halyard: Maker = (rate, random) => {
  const pitch = between(random, [2000, 2300]);
  const out = modes(rate, 0.6, [
    [pitch, 0.15, 1],
    [pitch * 1.58, 0.08, 0.5],
    [pitch * 2.5, 0.04, 0.3],
    [between(random, [420, 520]), 0.02, 0.5],
  ]);
  return unit(out);
};

/** A carpenter's hammer driving a nail into planking. */
const hammer: Maker = (rate, random) => {
  const pitch = between(random, [360, 420]);
  const out = modes(rate, 0.3, [
    [pitch, 0.03, 1],
    [pitch * 2.3, 0.02, 0.5],
    [pitch * 4.4, 0.01, 0.3],
  ]);
  mixInto(out, burst(rate, random, 2400, 1, 0.002), 0, 0.5);
  return unit(out);
};

/** A cart rolling past over cobbles: its rumble swelling and fading, the wheels' knocks in it. */
const cart: Maker = (rate, random) => {
  const seconds = between(random, [3.5, 5]);
  const out = length(rate, seconds);
  const passing = swell(0.45, 0.45, 1.3);
  const rumble = filtered(
    noise(out.length, random),
    [
      ['lowpass', 170, 0.8],
      ['highpass', 40, 0.7],
    ],
    rate,
  );
  const rough = wobble(out.length, rate, random, 14);
  for (let i = 0; i < out.length; i++) rumble[i] = (rumble[i] ?? 0) * (0.6 + 0.4 * (rough[i] ?? 0));
  mixInto(out, unit(shaped(rumble, passing)), 0, 1);
  for (let time = 0.1; time < seconds - 0.2; time += between(random, [0.18, 0.34])) {
    const knock = modes(rate, 0.1, [
      [between(random, [300, 420]), 0.015, 1],
      [900, 0.008, 0.4],
    ]);
    mixInto(out, unit(knock), time * rate, 0.4 * passing(time / seconds));
  }
  return unit(filtered(out, [['lowpass', 2500, 0.7]], rate));
};

/** A soft step on stone: the heel's thump and the sole's scuff. */
const step: Maker = (rate, random) => {
  const out = length(rate, 0.3);
  const thump = filtered(noise(Math.round(0.12 * rate), random), [['lowpass', between(random, [240, 340]), 0.8]], rate);
  mixInto(out, unit(shaped(thump, struck(0.002, 0.018, 0.12))), 0, 1);
  grains(out, rate, random, {
    count: 14,
    from: 0.01,
    to: 0.09,
    low: 1800,
    high: 4800,
    tau: [0.0006, 0.002],
    gain: 0.25,
  });
  return unit(out);
};

/** One voice of a crowd far off: a syllable or two in a low, changing vowel, darkened by the distance. */
export const murmurVoice: Maker = (rate, random) => {
  const syllables = 1 + Math.floor(random() * 4);
  const out = length(rate, syllables * 0.24 + 0.1);
  const pitch = between(random, [95, 230]);
  let time = 0.01;
  for (let nth = 0; nth < syllables; nth++) {
    const seconds = between(random, [0.11, 0.22]);
    const glide = between(random, [-0.12, 0.08]);
    const voiced = tone(
      rate,
      seconds,
      (share) => pitch * (1 + glide * share),
      swell(0.2, 0.35),
      [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.22, 0.15],
    );
    const vowel = between(random, [350, 800]);
    const shapedVowel = filtered(voiced, [['bandpass', vowel, 2.5]], rate);
    mixInto(shapedVowel, filtered(voiced, [['bandpass', vowel * between(random, [1.8, 2.8]), 4]], rate), 0, 0.5);
    mixInto(out, unit(shapedVowel), time * rate, between(random, [0.5, 1]));
    time += seconds + between(random, [0.01, 0.06]);
  }
  return unit(filtered(out, [['lowpass', 1400, 0.7]], rate));
};

export const NOISES = {
  'hull.creak': hullCreak,
  'rope.creak': ropeCreak,
  'hull.slap': hullSlap,
  'bow.thump': bowThump,
  'canvas.flap': canvasFlap,
  'block.knock': blockKnock,
  'surf.crash': surfCrash,
  'backwash': backwash,
  'twig.snap': twigSnap,
  'branch.creak': branchCreak,
  'leaf.gust': leafGust,
  'rock.fall': rockFall,
  'ice.creak': iceCreak,
  'ice.crack': iceCrack,
  'ice.ping': icePing,
  'sand.gust': sandGust,
  'wind.gust': windGust,
  'rock.whistle': rockWhistle,
  'bubbles': bubbles,
  'drip': drip,
  'fish.splash': fishSplash,
  'bell': bell,
  'anvil': anvilStrike(false),
  'anvil.light': anvilStrike(true),
  'halyard': halyard,
  'hammer': hammer,
  'cart': cart,
  'step': step,
} satisfies Record<string, Maker>;
