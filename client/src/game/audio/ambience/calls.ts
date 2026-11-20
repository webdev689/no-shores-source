// The wild's voices, made from sines and noise: owls and wolves as DFO made them, and the rest of Overlook's birds,
// beasts and insects. Each is one call, `rate` samples a second, from its seeded die, peaking at 1 with soft edges;
// where it rings out far off it is darkened here as distance darkens it. Pure.

import {
  type Random,
  between,
  burst,
  far,
  filtered,
  mixInto,
  modes,
  noise,
  shaped,
  softened,
  swell,
  tone,
  unit,
} from './dsp.ts';

/** A call's maker: its samples at `rate` from its die. */
export type Maker = (rate: number, random: Random) => Float32Array;

const length = (rate: number, seconds: number) => new Float32Array(Math.max(1, Math.round(seconds * rate)));

/** A hoot at `pitch` Hz for `seconds`: a sine sliding down a little, soft at both ends, a breath of its band under it,
 *  and a flutter of `flutter` depth at `flutterHertz` where it trembles. */
function hoot(
  rate: number,
  random: Random,
  pitch: number,
  seconds: number,
  slide = 0.05,
  flutter = 0,
  flutterHertz = 0,
) {
  const total = seconds + 0.05;
  const shape = (share: number) => {
    const time = share * total;
    const edge = Math.min(1, time / 0.035) * Math.max(0, Math.min(1, (seconds - time) / 0.09));
    return edge * (flutter ? 1 - flutter * (0.5 + 0.5 * Math.sin(2 * Math.PI * flutterHertz * time)) : 1);
  };
  const voice = tone(
    rate,
    total,
    (share) => pitch * (1 + slide * (0.5 - Math.min(1, (share * total) / seconds))),
    shape,
    [1, 0.08],
  );
  const breath = shaped(filtered(noise(voice.length, random), [['bandpass', pitch, 6]], rate), shape);
  mixInto(voice, breath, 0, 0.6);
  return unit(voice);
}

/** A tawny owl: "hoo ... hu-hu-hooo", the last trembling. */
const tawnyOwl: Maker = (rate, random) => {
  const out = length(rate, 2.4);
  mixInto(out, hoot(rate, random, 470, 0.55), 0.02 * rate, 1);
  mixInto(out, hoot(rate, random, 440, 0.08, 0), 1.05 * rate, 0.55);
  mixInto(out, hoot(rate, random, 450, 0.08, 0), 1.2 * rate, 0.6);
  mixInto(out, hoot(rate, random, 465, 0.95, 0.03, 0.45, 11), 1.36 * rate, 0.95);
  return softened(unit(out), 1.1);
};

/** A deeper owl's slow "hoo-hoo, hoooo". */
const deepOwl: Maker = (rate, random) => {
  const out = length(rate, 2.1);
  mixInto(out, hoot(rate, random, 315, 0.32, 0.04), 0.02 * rate, 1);
  mixInto(out, hoot(rate, random, 300, 0.32, 0.04), 0.45 * rate, 0.85);
  mixInto(out, hoot(rate, random, 290, 0.75, 0.08), 1.1 * rate, 0.95);
  return softened(unit(out), 1.1);
};

/** A wolf far off: a long howl gliding up from `low`, held with a vibrato, falling to `end`, a breath in it. */
function howl(low: number, high: number, end: number, seconds: number): Maker {
  return (rate, random) => {
    const glide = (share: number) =>
      share < 0.22
        ? low + (high - low) * Math.sin((Math.PI / 2) * (share / 0.22))
        : share < 0.7
          ? high
          : high + (end - high) * ((share - 0.7) / 0.3) ** 1.4;
    const shape = (share: number) => Math.min(1, share / 0.08) * Math.min(1, (1 - share) / 0.18);
    const vibrato = (share: number) => 9 * Math.sin(2 * Math.PI * 5.2 * share * seconds) * Math.min(1, share / 0.3);
    const voice = tone(rate, seconds, (share) => glide(share) + vibrato(share), shape, [1, 0.28, 0.1]);
    mixInto(voice, shaped(filtered(noise(voice.length, random), [['bandpass', 900, 1.4]], rate), shape), 0, 0.25);
    return softened(unit(far(rate, unit(voice), 2200, seconds + 1.2)), 1.05);
  };
}

/** A jackal's yips: short glides up and down, quickening, and a thin howl to end. */
const yips: Maker = (rate, random) => {
  const out = length(rate, 3.2);
  let time = 0.02;
  const count = 5 + Math.floor(random() * 5);
  for (let nth = 0; nth < count; nth++) {
    const seconds = between(random, [0.08, 0.15]);
    const top = between(random, [950, 1250]);
    const yip = tone(
      rate,
      seconds,
      (share) => 650 + (top - 650) * Math.sin(Math.PI * share),
      swell(0.2, 0.4),
      [1, 0.35, 0.15],
    );
    mixInto(out, yip, time * rate, 0.6 + 0.4 * random());
    time += seconds + between(random, [0.05, 0.16]) * (1 - nth / (count + 2));
  }
  const tail = tone(
    rate,
    0.9,
    (share) => 1100 - 250 * share + 15 * Math.sin(31 * share),
    swell(0.15, 0.5),
    [1, 0.3, 0.1],
  );
  mixInto(out, tail, (time + 0.05) * rate, 0.7);
  return unit(far(rate, unit(out), 2600, 3.6));
};

/** A hyena's whoops: each rising from low to high, a little higher each time. */
const whoops: Maker = (rate, random) => {
  const count = 3 + Math.floor(random() * 3);
  const out = length(rate, count * 1.35 + 0.8);
  for (let nth = 0; nth < count; nth++) {
    const top = between(random, [780, 920]) * (1 + nth * 0.03);
    const whoop = tone(
      rate,
      0.95,
      (share) => 280 + (top - 280) * share ** 0.7,
      swell(0.12, 0.25),
      [1, 0.4, 0.18, 0.08],
    );
    mixInto(
      whoop,
      shaped(filtered(noise(whoop.length, random), [['bandpass', 600, 1.5]], rate), swell(0.1, 0.3)),
      0,
      0.12,
    );
    mixInto(out, whoop, (0.05 + nth * between(random, [1.2, 1.4])) * rate, 0.8 + 0.2 * random());
  }
  return unit(far(rate, unit(out), 2400, out.length / rate + 0.5));
};

/** A cuckoo's two notes, the second a third below. */
const cuckoo: Maker = (rate) => {
  const out = length(rate, 0.75);
  mixInto(
    out,
    tone(rate, 0.17, (share) => 760 - 25 * share, swell(0.15, 0.35), [1, 0.06]),
    0.01 * rate,
    1,
  );
  mixInto(
    out,
    tone(rate, 0.3, (share) => 612 - 18 * share, swell(0.1, 0.5), [1, 0.06]),
    0.3 * rate,
    0.9,
  );
  return unit(far(rate, out, 3000, 0.75, false));
};

/** A dove's soft "coo-cooo-coo", breathy. */
const dove: Maker = (rate, random) => {
  const out = length(rate, 1.6);
  const notes: readonly (readonly [number, number, number, number])[] = [
    [0.02, 0.24, 520, 0.7],
    [0.36, 0.5, 565, 1],
    [0.98, 0.32, 490, 0.75],
  ];
  for (const [start, seconds, pitch, gain] of notes) {
    const coo = tone(rate, seconds, (share) => pitch * (1 - 0.06 * share), swell(0.25, 0.35), [1, 0.12, 0.04]);
    mixInto(
      coo,
      shaped(filtered(noise(coo.length, random), [['bandpass', pitch, 8]], rate), swell(0.25, 0.35)),
      0,
      0.5,
    );
    mixInto(out, coo, start * rate, gain);
  }
  return unit(out);
};

/** A pigeon's throaty "hrroo-hoo", trilled in the throat. */
const pigeon: Maker = (rate) => {
  const out = length(rate, 1.3);
  const trill = (share: number) => swell(0.2, 0.3)(share) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 26 * share * 0.7));
  mixInto(
    out,
    tone(rate, 0.7, (share) => 380 - 70 * share, trill, [1, 0.3, 0.12]),
    0.02 * rate,
    1,
  );
  mixInto(
    out,
    tone(rate, 0.4, (share) => 330 - 30 * share, swell(0.2, 0.5), [1, 0.25, 0.08]),
    0.82 * rate,
    0.7,
  );
  return unit(filtered(out, [['lowpass', 1800, 0.7]], rate));
};

/** A curlew: rising "cour-lee"s, quickening, then its bubbling trill. */
const curlew: Maker = (rate, random) => {
  const out = length(rate, 3.4);
  let time = 0.02;
  for (let nth = 0; nth < 4; nth++) {
    const seconds = 0.42 - nth * 0.05;
    mixInto(
      out,
      tone(rate, seconds, (share) => 1500 + 950 * share ** 1.3, swell(0.2, 0.25), [1, 0.1]),
      time * rate,
      0.8,
    );
    time += seconds + 0.18 - nth * 0.03;
  }
  const bubbling = (share: number) => swell(0.1, 0.3)(share) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 17 * share * 1.3));
  mixInto(
    out,
    tone(rate, 1.3, (share) => 2550 + 120 * Math.sin(5 * share) - 300 * share, bubbling, [1, 0.08]),
    time * rate,
    1,
  );
  return unit(far(rate, unit(out), 4200, 3.4 + 0.2 * random(), false));
};

/** A buzzard's mewing "pee-yow", high overhead. */
const buzzard: Maker = (rate, random) => {
  const out = length(rate, 1.4);
  const vibrato = (share: number) => 40 * Math.sin(2 * Math.PI * 6 * share);
  const mew = tone(
    rate,
    0.85,
    (share) => 3000 - 1100 * share ** 1.5 + vibrato(share),
    swell(0.08, 0.3),
    [1, 0.25, 0.08],
  );
  mixInto(mew, shaped(filtered(noise(mew.length, random), [['bandpass', 2600, 3]], rate), swell(0.08, 0.3)), 0, 0.12);
  mixInto(out, mew, 0.02 * rate, 1);
  return unit(far(rate, unit(out), 5000, 1.4, false));
};

/** A marmot's sharp alarm whistle, once to thrice. */
const marmot: Maker = (rate, random) => {
  const out = length(rate, 1.2);
  const count = 1 + Math.floor(random() * 3);
  for (let nth = 0; nth < count; nth++)
    mixInto(
      out,
      tone(rate, 0.11, (share) => 2850 + 300 * share, swell(0.1, 0.4), [1, 0.05]),
      (0.02 + nth * 0.32) * rate,
      1,
    );
  return unit(far(rate, out, 6000, 1.2, false));
};

/** A gull's call: "kyow" notes, bright and harsh, the long call's laughing run after. */
const gull: Maker = (rate, random) => {
  const out = length(rate, 2.2);
  let time = 0.02;
  const count = 2 + Math.floor(random() * 4);
  for (let nth = 0; nth < count; nth++) {
    const seconds = nth === 0 ? 0.36 : between(random, [0.16, 0.24]);
    const top = between(random, [1550, 1800]);
    const pitch = (share: number) =>
      share < 0.2 ? 1150 + (top - 1150) * (share / 0.2) : top - (top - 900) * ((share - 0.2) / 0.8);
    const rasp = (share: number) =>
      swell(0.1, 0.35)(share) * (0.75 + 0.25 * Math.sin(2 * Math.PI * 95 * share * seconds));
    const note = tone(rate, seconds, pitch, rasp, [1, 0.75, 0.55, 0.38, 0.24, 0.15, 0.1]);
    mixInto(note, shaped(filtered(noise(note.length, random), [['bandpass', 2400, 1.2]], rate), rasp), 0, 0.18);
    mixInto(out, note, time * rate, nth === 0 ? 1 : 0.8);
    time += seconds + between(random, [0.05, 0.12]);
  }
  return unit(far(rate, unit(out), 6500, 2.2, false));
};

/** A crow's "kaah": a buzzing voice through its throat's bands. */
function caw(rate: number, random: Random, pitch: number, seconds: number): Float32Array {
  const voice = tone(
    rate,
    seconds,
    (share) => pitch * (1 - 0.08 * share),
    swell(0.08, 0.3),
    [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4],
  );
  mixInto(voice, shaped(noise(voice.length, random), swell(0.08, 0.3)), 0, 0.35);
  return unit(
    (() => {
      const out = new Float32Array(voice.length);
      for (const [hertz, quality, gain] of [
        [1150, 3, 1],
        [1850, 4, 0.7],
        [2900, 5, 0.35],
      ] as const)
        mixInto(out, filtered(voice, [['bandpass', hertz, quality]], rate), 0, gain);
      return out;
    })(),
  );
}

/** A crow's two to four caws. */
const crow: Maker = (rate, random) => {
  const out = length(rate, 2.2);
  const count = 2 + Math.floor(random() * 3);
  for (let nth = 0; nth < count; nth++)
    mixInto(
      out,
      caw(rate, random, between(random, [480, 540]), between(random, [0.22, 0.32])),
      (0.02 + nth * 0.46) * rate,
      1,
    );
  return unit(far(rate, out, 4500, 2.2, false));
};

/** A raven's deep "kronk", twice. */
const raven: Maker = (rate, random) => {
  const out = length(rate, 1.6);
  for (let nth = 0; nth < 2; nth++)
    mixInto(out, caw(rate, random, between(random, [150, 175]), 0.26), (0.02 + nth * 0.55) * rate, 1 - nth * 0.15);
  return unit(far(rate, filtered(out, [['lowpass', 2600, 0.7]], rate), 3200, 1.8));
};

/** A woodpecker drumming on dead wood: quick knocks, a bout loud at first and fading. */
const woodpecker: Maker = (rate, random) => {
  const out = length(rate, 1.6);
  const count = 14 + Math.floor(random() * 8);
  const pace = between(random, [16, 20]);
  const wood = between(random, [900, 1200]);
  for (let nth = 0; nth < count; nth++) {
    // Dead wood knocked: a dull, unevenly tuned body under the strike's crack, never a clean tone.
    const knock = modes(rate, 0.05, [
      [wood, 0.006, 1],
      [wood * 1.83, 0.004, 0.5],
      [wood * 2.71, 0.003, 0.3],
    ]);
    mixInto(knock, burst(rate, random, between(random, [1500, 2600]), 1.2, 0.003), 0, 0.9);
    mixInto(out, unit(knock), (0.02 + nth / pace) * rate, Math.min(1, (nth + 2) / 4) * (1 - (0.6 * nth) / count));
  }
  return unit(far(rate, out, 4000, 1.6));
};

/** A cricket nearby: chirps of four pulses on its carrier. */
const cricket: Maker = (rate, random) => {
  const out = length(rate, 2.6);
  const carrier = between(random, [4300, 5100]);
  for (let chirp = 0; chirp < 5; chirp++)
    for (let pulse = 0; pulse < 4; pulse++)
      mixInto(
        out,
        tone(rate, 0.014, () => carrier, swell(0.25, 0.4), [1, 0.05]),
        (0.02 + chirp * 0.5 + pulse * 0.03) * rate,
        1,
      );
  return unit(out);
};

/** A cicada's swelling buzz. */
const cicada: Maker = (rate, random) => {
  const seconds = between(random, [3, 5]);
  const pulses = between(random, [180, 230]);
  const band = filtered(
    noise(Math.round(seconds * rate), random),
    [['bandpass', between(random, [5200, 6600]), 4]],
    rate,
  );
  return unit(
    shaped(
      band,
      (share) => swell(0.35, 0.2)(share) * (0.35 + 0.65 * Math.abs(Math.sin(Math.PI * pulses * share * seconds))),
    ),
  );
};

/** A tree frog's high peeps. */
const peeps: Maker = (rate, random) => {
  const out = length(rate, 2.2);
  const count = 3 + Math.floor(random() * 6);
  const pitch = between(random, [2600, 3000]);
  for (let nth = 0; nth < count; nth++)
    mixInto(
      out,
      tone(rate, 0.1, (share) => pitch * (1 + 0.16 * share), swell(0.15, 0.35), [1, 0.1]),
      (0.02 + nth * 0.24) * rate,
      1,
    );
  return unit(out);
};

/** A frog's croak: a rasp of quick pulses through its throat's band, twice. */
function croakOf(rate: number, pitch: number, pulses: number, seconds: number): Float32Array {
  const shape = (share: number) =>
    swell(0.1, 0.3)(share) * (0.5 + 0.5 * Math.sign(Math.sin(2 * Math.PI * pulses * share * seconds)));
  const voice = tone(rate, seconds, (share) => pitch * (1 - 0.15 * share), shape, [1, 0.6, 0.4, 0.3, 0.2]);
  return unit(
    filtered(
      voice,
      [
        ['bandpass', pitch * 2, 2],
        ['lowpass', 3000, 0.7],
      ],
      rate,
    ),
  );
}
const croaks: Maker = (rate, random) => {
  const out = length(rate, 1.2);
  const pitch = between(random, [380, 520]);
  mixInto(out, croakOf(rate, pitch, 55, 0.18), 0.02 * rate, 1);
  mixInto(out, croakOf(rate, pitch * 0.92, 50, 0.22), 0.32 * rate, 0.85);
  return unit(out);
};

/** A bullfrog's deep "rumm". */
const bullfrog: Maker = (rate, random) => {
  const out = length(rate, 1.1);
  mixInto(out, croakOf(rate, between(random, [105, 125]), 28, 0.6), 0.02 * rate, 1);
  return unit(filtered(out, [['lowpass', 900, 0.7]], rate));
};

/** A nightjar's churr: a long run of quick pulses, its pitch shifting now and then. */
const nightjar: Maker = (rate, random) => {
  const seconds = between(random, [4, 7]);
  const shifts = Array.from({ length: 8 }, () => (random() < 0.5 ? 1200 : 1420));
  const pulses = between(random, [28, 38]);
  const shape = (share: number) =>
    swell(0.06, 0.06)(share) * Math.max(0, Math.sin(2 * Math.PI * pulses * share * seconds)) ** 3;
  const voice = tone(rate, seconds, (share) => shifts[Math.min(7, Math.floor(share * 8))] ?? 1300, shape, [1, 0.3]);
  return unit(far(rate, voice, 4000, seconds + 0.3, false));
};

/** A mosquito's whine, wavering as it hunts. */
const mosquito: Maker = (rate, random) => {
  const seconds = between(random, [1.8, 3]);
  const pitch = between(random, [520, 600]);
  return unit(
    tone(
      rate,
      seconds,
      (share) => pitch + 25 * Math.sin(2 * Math.PI * 3.3 * share * seconds) + 30 * Math.sin(5 * share),
      swell(0.3, 0.3),
      [1, 0.6, 0.45, 0.3, 0.2, 0.12],
    ),
  );
};

/** A fly's buzz passing. */
const fly: Maker = (rate, random) => {
  const seconds = between(random, [0.9, 1.6]);
  return unit(
    tone(rate, seconds, (share) => 205 + 30 * Math.sin(Math.PI * share), swell(0.3, 0.4), [1, 0.7, 0.5, 0.4, 0.3, 0.2]),
  );
};

export const CALLS = {
  'owl.tawny': tawnyOwl,
  'owl.deep': deepOwl,
  'wolf.howl': howl(360, 640, 420, 2.6),
  'wolf.howl.low': howl(330, 590, 380, 2.9),
  'jackal.yips': yips,
  'hyena.whoops': whoops,
  'cuckoo': cuckoo,
  'dove': dove,
  'pigeon': pigeon,
  'curlew': curlew,
  'buzzard': buzzard,
  'marmot': marmot,
  'gull': gull,
  'crow': crow,
  'raven': raven,
  'woodpecker': woodpecker,
  'cricket': cricket,
  'cicada': cicada,
  'frog.peeps': peeps,
  'frog.croak': croaks,
  'frog.bull': bullfrog,
  'nightjar': nightjar,
  'mosquito': mosquito,
  'fly': fly,
} satisfies Record<string, Maker>;
