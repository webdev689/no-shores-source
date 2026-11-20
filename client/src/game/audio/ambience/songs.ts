// Overlook's songbirds, made from sines. A bird sings in its own register, in syllables: quick sweeps down or up, a
// rise and fall, a fluttering trill, a buzz; and most repeat a syllable or a motif before moving on, as real song
// does. Each species is its own arrangement of these: the warbler's run of repeated syllables, the thrush's motifs
// sung over, the finch's falling trill, the wren's rattles, the lark's long warble overhead. Each take is drawn
// afresh from its seeded die, so no two sing the same. Pure.

import type { Maker } from './calls.ts';
import { type Random, between, far, mixInto, swell, tone, unit } from './dsp.ts';

const length = (rate: number, seconds: number) => new Float32Array(Math.max(1, Math.round(seconds * rate)));

/** A syllable's shape: how its pitch moves through it. */
type Sweep = 'down' | 'up' | 'arch' | 'trill' | 'buzz' | 'whistle';
const SWEEPS: readonly Sweep[] = ['down', 'up', 'arch', 'trill', 'down', 'arch'];

/** A syllable: `seconds` long about `pitch` Hz, its pitch moving by `depth` (a share of it) in its sweep's way, a
 *  breath of its second harmonic in it. */
function syllable(rate: number, pitch: number, seconds: number, sweep: Sweep, depth: number, gain = 1): Float32Array {
  const flutter = 2 * Math.PI * 45 * seconds;
  const bend = (share: number): number => {
    switch (sweep) {
      case 'down':
        return 1 + depth * (1 - share) ** 2;
      case 'up':
        return 1 + depth * share ** 2;
      case 'arch':
        return 1 + depth * Math.sin(Math.PI * share);
      case 'trill':
        return 1 + depth * 0.35 * Math.sin(flutter * share);
      case 'buzz':
        return 1 - depth * 0.2 * share;
      case 'whistle':
        return 1 + 0.015 * Math.sin(Math.PI * 2 * share);
    }
  };
  const buzzing =
    sweep === 'buzz' ? (share: number) => 0.55 + 0.45 * Math.sin(2 * Math.PI * 70 * share * seconds) : () => 1;
  const edge = swell(0.12, 0.35);
  return tone(
    rate,
    seconds,
    (share) => pitch * bend(share),
    (share) => gain * edge(share) * buzzing(share),
    [1, 0.12, 0.03],
  );
}

/** A syllable drawn for a bird singing about `register` Hz. */
function drawn(rate: number, random: Random, register: number, seconds: readonly [number, number]): () => Float32Array {
  const pitch = register * between(random, [0.8, 1.25]);
  const sweep = SWEEPS[Math.floor(random() * SWEEPS.length)] ?? 'down';
  const depth = between(random, [0.15, 0.5]);
  const span = between(random, seconds as [number, number]);
  return () => syllable(rate, pitch * between(random, [0.98, 1.02]), span, sweep, depth, between(random, [0.7, 1]));
}

/** Lays syllables one after another from `from` seconds, each `gap` apart, and answers where they end. */
function laid(out: Float32Array, rate: number, from: number, notes: readonly Float32Array[], gap: number): number {
  let time = from;
  for (const each of notes) {
    mixInto(out, each, time * rate, 1);
    time += each.length / rate + gap;
  }
  return time;
}

/** A warbler: two to four syllables, each sung two to four times quickly, and a falling flourish to end. */
const warbler: Maker = (rate, random) => {
  const out = length(rate, 3);
  const register = between(random, [3000, 4600]);
  let time = 0.02;
  for (let motif = 0; motif < 2 + Math.floor(random() * 3) && time < 2.2; motif++) {
    const make = drawn(rate, random, register, [0.04, 0.09]);
    const times = 2 + Math.floor(random() * 3);
    time = laid(out, rate, time, Array.from({ length: times }, make), between(random, [0.02, 0.05])) + 0.03;
  }
  mixInto(out, syllable(rate, register * 0.9, 0.14, 'down', 0.5), time * rate, 0.9);
  return unit(out);
};

/** A thrush: a short motif of clear notes, sung two or three times over, then another. */
const thrush: Maker = (rate, random) => {
  const out = length(rate, 4);
  const register = between(random, [1900, 3200]);
  let time = 0.02;
  for (let motif = 0; motif < 2 && time < 2.4; motif++) {
    const notes = Array.from({ length: 2 + Math.floor(random() * 3) }, () => {
      const sweep: Sweep = random() < 0.5 ? 'whistle' : random() < 0.5 ? 'arch' : 'trill';
      return syllable(rate, register * between(random, [0.75, 1.35]), between(random, [0.08, 0.22]), sweep, 0.25);
    });
    const times = 2 + Math.floor(random() * 2);
    for (let again = 0; again < times && time < 3.3; again++) time = laid(out, rate, time, notes, 0.045) + 0.13;
    time += 0.3;
  }
  return unit(out);
};

/** A finch: a falling, quickening trill and its flourish. */
const finch: Maker = (rate, random) => {
  const out = length(rate, 2.4);
  const register = between(random, [3600, 4600]);
  const count = 8 + Math.floor(random() * 6);
  const notes = Array.from({ length: count }, (unused, nth) =>
    syllable(rate, register * (1.1 - (0.35 * nth) / count), 0.05 - (0.018 * nth) / count, 'down', 0.3),
  );
  const end = laid(out, rate, 0.02, notes, 0.055);
  mixInto(out, syllable(rate, register * 0.6, 0.24, 'arch', 0.45), (end + 0.04) * rate, 1);
  return unit(out);
};

/** A wren: loud, quick rattles high up, two or three of them. */
const wren: Maker = (rate, random) => {
  const out = length(rate, 2.8);
  let time = 0.02;
  for (let run = 0; run < 2 + Math.floor(random() * 2); run++) {
    const make = drawn(rate, random, between(random, [4400, 6200]), [0.025, 0.035]);
    time = laid(out, rate, time, Array.from({ length: 6 + Math.floor(random() * 8) }, make), 0.012) + 0.08;
  }
  return unit(out);
};

/** A lark high overhead: a long unbroken warble, fluttering, now and then repeating itself. */
const lark: Maker = (rate, random) => {
  const out = length(rate, 6);
  const register = between(random, [3000, 4200]);
  let time = 0.05;
  let make = drawn(rate, random, register, [0.03, 0.08]);
  while (time < 5.6) {
    if (random() < 0.35) make = drawn(rate, random, register, [0.03, 0.08]);
    const each = make();
    mixInto(out, each, time * rate, 1);
    time += each.length / rate + between(random, [0.006, 0.03]);
  }
  return unit(far(rate, out, 7000, 6, false));
};

/** A chiffchaff's two notes, back and forth, never quite evenly. */
const chiff: Maker = (rate, random) => {
  const out = length(rate, 3.4);
  const count = 6 + Math.floor(random() * 5);
  for (let nth = 0; nth < count; nth++) {
    const high = nth % 2 === 0 || random() < 0.2;
    mixInto(
      out,
      syllable(rate, high ? 4900 : 4150, 0.07, 'down', 0.15),
      (0.02 + nth * 0.32 + random() * 0.04) * rate,
      1,
    );
  }
  return unit(out);
};

/** A sparrow's plain, rough cheeps, a few at a time. */
const sparrow: Maker = (rate, random) => {
  const out = length(rate, 1.8);
  const count = 3 + Math.floor(random() * 5);
  for (let nth = 0; nth < count; nth++) {
    const pitch = between(random, [2900, 3600]);
    const cheep = tone(
      rate,
      0.075,
      (share) => pitch * (1 + 0.25 * Math.sin(Math.PI * share)),
      swell(0.15, 0.4),
      [1, 0.35, 0.15],
    );
    mixInto(out, cheep, (0.02 + nth * between(random, [0.18, 0.3])) * rate, between(random, [0.6, 1]));
  }
  return unit(out);
};

/** A forest's fluting whistles: long rising and falling glides, and now and then a bell's ping, far in the canopy. */
const fluter: Maker = (rate, random) => {
  const out = length(rate, 3);
  const register = between(random, [1400, 2400]);
  let time = 0.02;
  for (let nth = 0; nth < 2 + Math.floor(random() * 2); nth++) {
    const seconds = between(random, [0.3, 0.7]);
    const sweep: Sweep = random() < 0.5 ? 'arch' : 'up';
    mixInto(out, syllable(rate, register * between(random, [0.85, 1.2]), seconds, sweep, 0.35), time * rate, 1);
    time += seconds + between(random, [0.1, 0.3]);
  }
  if (random() < 0.5)
    mixInto(
      out,
      tone(
        rate,
        0.6,
        () => 1250,
        (share) => Math.exp(-share * 7),
        [1, 0, 0.3],
      ),
      time * rate,
      0.7,
    );
  return unit(far(rate, out, 5000, 3, false));
};

/** A weaver colony's buzzing chatter. */
const weaver: Maker = (rate, random) => {
  const out = length(rate, 1.8);
  let time = 0.02;
  while (time < 1.6) {
    const seconds = between(random, [0.04, 0.12]);
    const sweep: Sweep = random() < 0.6 ? 'buzz' : 'down';
    mixInto(
      out,
      syllable(rate, between(random, [3000, 5000]), seconds, sweep, 0.3),
      time * rate,
      between(random, [0.4, 1]),
    );
    time += seconds + between(random, [0.01, 0.07]);
  }
  return unit(far(rate, out, 6000, 1.8, false));
};

export const SONGS = {
  'song.warbler': warbler,
  'song.thrush': thrush,
  'song.finch': finch,
  'song.wren': wren,
  'song.lark': lark,
  'song.chiff': chiff,
  'song.sparrow': sparrow,
  'song.fluter': fluter,
  'song.weaver': weaver,
} satisfies Record<string, Maker>;
