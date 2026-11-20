// Saltmere's theme: the home port, where players gather between voyages. G major in 3/4 at 126, a folk waltz with
// the lilt on its second beat. The tune climbs G, A, B, D in a dotted step and leans on the sixth; it passes from the
// flute to the fiddle, to the accordion with the fiddle's descant over it, to the cello in E minor for a quiet
// passage over the harp, a tide of harp and flute alone, a dance where whistle, fiddle, flute and accordion trade it
// two bars each, the accordion's tune again on the fiddle and flute with the horn under it, and the whole band. A
// lute strums the waltz, a plucked bass and a warm pad with a sub under it hold the floor, and hand drums keep it
// light: the harbour's sounds have the high end. About three minutes before it comes round.

import { chordAt, type Held, keys, measured, plan, progression, runsOf } from './craft.ts';
import { type Song, type Writer, lay, makeSong } from './score.ts';

const TRACKS = {
  lute: {
    program: 24,
    volume: 115,
    pan: 40,
    role: 'pulse',
    voice: { index: 2.2, idxDecay: 0.12, decay: 0.6, sustain: 0.06, release: 0.3 },
  },
  harp: { program: 46, volume: 115, pan: 86, role: 'bed', voice: { index: 2, idxDecay: 0.3, release: 0.8 } },
  bass: {
    program: 32,
    volume: 69,
    pan: 64,
    role: 'bed',
    voice: { decay: 0.6, sustain: 0.3, release: 0.25, index: 1.6, idxDecay: 0.2, sub: 0.2 },
  },
  pad: {
    program: 89,
    volume: 80,
    pan: 64,
    role: 'bed',
    voice: { attack: 0.6, release: 1, index: 0.8, unison: 2, cents: 10, spread: 0.5 },
  },
  strings: {
    program: 48,
    volume: 82,
    pan: 76,
    role: 'bed',
    voice: { attack: 0.3, release: 0.8, index: 1.1, idxDecay: 2, unison: 2, cents: 9, spread: 0.45 },
  },
  cello: {
    program: 42,
    volume: 106,
    pan: 52,
    role: 'lead',
    voice: { attack: 0.08, decay: 0.3, sustain: 0.85, release: 0.35, index: 1.6, idxDecay: 0.9, unison: 2, cents: 5 },
  },
  flute: {
    program: 73,
    volume: 112,
    pan: 70,
    role: 'lead',
    voice: { attack: 0.05, idxDecay: 0.6, unison: 2, cents: 4 },
  },
  fiddle: {
    program: 40,
    volume: 112,
    pan: 58,
    role: 'lead',
    voice: { attack: 0.03, decay: 0.25, sustain: 0.8, release: 0.22, index: 1.9, idxDecay: 0.7, unison: 2, cents: 5 },
  },
  whistle: { program: 78, volume: 96, pan: 80, role: 'lead', voice: { attack: 0.03, idxDecay: 0.4 } },
  clarinet: { program: 71, volume: 110, pan: 82, role: 'tension', voice: { attack: 0.06, index: 1.6, idxDecay: 0.7 } },
  accordion: {
    program: 21,
    volume: 100,
    pan: 46,
    role: 'lead',
    voice: { attack: 0.03, index: 1.4, unison: 2, cents: 13, spread: 0.3 },
  },
  horn: {
    program: 60,
    volume: 96,
    pan: 36,
    role: 'peak',
    voice: { attack: 0.07, index: 2, idxDecay: 0.7, unison: 2, cents: 6, spread: 0.2 },
  },
} as const;
type Track = keyof typeof TRACKS;

/** A frame drum's low stroke and its tap, two bongos, a shaker and a tambourine, all soft. */
const KIT = {
  volume: 101,
  role: 'combat',
  keys: { frame: 41, tap: 45, bongoHigh: 60, bongoLow: 61, shaker: 82, tambourine: 54 },
  drums: {
    frame: { hz: 82, decay: 0.3, gain: 1, drop: 0.8, click: 0.25 },
    tap: { hz: 160, decay: 0.1, gain: 0.6, click: 0.3 },
    bongoHigh: { hz: 420, decay: 0.11, gain: 0.55, drop: 0.85, click: 0.25 },
    bongoLow: { hz: 300, decay: 0.15, gain: 0.6, drop: 0.85, click: 0.25 },
    shaker: { hz: 6400, q: 1.6, decay: 0.05, gain: 0.22 },
    tambourine: { hz: 7400, q: 1.4, decay: 0.1, gain: 0.24 },
  },
} as const;
type Drum = keyof typeof KIT.keys;
type Write = Writer<Track, Drum>;

const BPM = 126;
const BEATS = 3;
const PRESS = { threshold: -24, knee: 18, ratio: 2, attack: 0.02, release: 0.3, out: 1.75, ceiling: -3 } as const;
const LEVEL = 1.4;

/** Each chord's bass, the lute's three notes, the harp's four, the pad's and the strings'. */
const chord = (bass: string, lute: string, harp: string, pad: string, strings: string) => ({
  bass,
  lute: keys(lute),
  harp: keys(harp),
  pad: keys(pad),
  strings: keys(strings),
});
const CHORDS = {
  G: chord('G2', 'B3 D4 G4', 'G3 D4 G4 B4', 'G3 B3 D4', 'D4 G4 B4'),
  C: chord('C3', 'C4 E4 G4', 'C3 G3 C4 E4', 'G3 C4 E4', 'E4 G4 C5'),
  D: chord('D3', 'A3 D4 F#4', 'D3 A3 D4 F#4', 'A3 D4 F#4', 'D4 F#4 A4'),
  Em: chord('E2', 'B3 E4 G4', 'E3 B3 E4 G4', 'G3 B3 E4', 'E4 G4 B4'),
  Am: chord('A2', 'A3 C4 E4', 'A2 E3 A3 C4', 'A3 C4 E4', 'E4 A4 C5'),
  F: chord('F2', 'A3 C4 F4', 'F2 C3 F3 A3', 'A3 C4 F4', 'F4 A4 C5'),
  B: chord('B2', 'B3 D#4 F#4', 'B2 F#3 B3 D#4', 'B3 D#4 F#4', 'D#4 F#4 B4'),
};
type Chord = keyof typeof CHORDS;
const harmony = (text: string): Held<Chord>[][] => progression(text, CHORDS, BEATS, { 2: [0, 2] });
const tune = (text: string) => measured(text, BEATS);

type Section = 'intro' | 'a' | 'b' | 'quiet' | 'tide' | 'dance' | 'outro';
const HARMONY: Readonly<Record<Section, Held<Chord>[][]>> = {
  intro: harmony('G | C | G | D'),
  a: harmony('G | Em | Am | D | G | C | D | D | G | Em | C | D | C | G | Am/D | G'),
  b: harmony('C | Am | Em | Em | F | C | D | G | C | Am | G | D | F | C | D | G'),
  quiet: harmony('Em | C | D | Em | Em | Am | B | B | Em | Am | G | D | Em | Am | B | Em'),
  tide: harmony('Em | C | G | D | Em | C | Am | D'),
  dance: harmony('G | Em | C | D | G | C | Am | D | G | G | C | D | G | Am | Em/D | G'),
  outro: harmony('G | C | D | D'),
};
const PLAN = plan<Section>([
  ['intro', 4],
  ['a', 16],
  ['a', 16],
  ['b', 16],
  ['quiet', 16],
  ['tide', 8],
  ['dance', 16],
  ['b', 16],
  ['a', 16],
  ['outro', 4],
]);

/** The tune: G, A in a dotted step to B and D, the long E, the same climb a step down; its answer reaching the
 *  high G and coming home through A minor and D. */
const THEME = tune(
  'G4:.75 A4:.25 B4:1 D5:1 | E5:1.5 D5:.5 B4:1 | C5:.75 B4:.25 A4:1 C5:1 | A4:1.5 G4:.5 F#4:1' +
    ' | G4:.75 A4:.25 B4:1 D5:1 | G5:1.5 F#5:.5 E5:1 | D5:.75 C5:.25 B4:1 A4:1 | A4:3' +
    ' | G4:.75 A4:.25 B4:1 D5:1 | E5:1.5 D5:.5 B4:1 | C5:.75 D5:.25 E5:1 G5:1 | F#5:1.5 E5:.5 D5:1' +
    ' | E5:.75 F#5:.25 G5:1 E5:1 | D5:1.5 B4:.5 G4:1 | A4:.75 B4:.25 C5:1 A4:.5 F#4:.5 | G4:3',
);
/** Under it, for the cello and later the horn: moving where the tune holds, falling where it climbs. */
const COUNTER = tune(
  'D4:2 B3:1 | G3:1.5 A3:.5 B3:1 | E4:2 C4:1 | D4:1 C4:1 A3:1 | B3:3 | C4:1.5 D4:.5 E4:1 | F#3:1 A3:1 D4:1 | C4:1 B3:1 A3:1' +
    ' | D4:2 B3:1 | G3:1.5 A3:.5 B3:1 | C4:2 E4:1 | D4:1.5 E4:.5 F#4:1 | G4:1 E4:1 C4:1 | B3:1.5 C4:.5 D4:1 | C4:2 D4:1 | B3:1 A3:1 G3:1',
);
/** The accordion's tune: down from E over C and A minor, a turn through F, the old seventh, home by C and D. */
const SECOND = tune(
  'E5:2 D5:1 | C5:1 B4:1 A4:1 | B4:2 G4:1 | E4:1.5 F#4:.5 G4:1 | A4:2 C5:1 | G4:1 E4:1 C5:1 | D5:1.5 C5:.5 A4:1 | B4:3' +
    ' | E5:2 D5:1 | C5:1 B4:1 A4:1 | B4:1 D5:1 G5:1 | F#5:3 | F5:1.5 E5:.5 D5:1 | C5:1.5 B4:.5 A4:1 | B4:1 A4:1 F#4:1 | G4:3',
);
/** The fiddle's descant over the accordion. */
const DESCANT = tune(
  'G5:2 A5:.5 G5:.5 | E5:3 | G5:2 F#5:.5 E5:.5 | E5:1 G5:1 B5:1 | C6:2 A5:1 | G5:3 | F#5:1.5 E5:.5 F#5:1 | G5:1 F#5:1 D5:1' +
    ' | G5:2 C6:1 | A5:3 | B5:3 | A5:1.5 B5:.5 A5:1 | A5:3 | G5:2 E5:1 | D5:1.5 E5:.5 F#5:1 | G5:3',
);
/** The horn under the accordion's tune when the fiddle and flute have it. */
const HORN_SECOND = tune(
  'G3:2 A3:1 | A3:2 G3:1 | G3:3 | B3:1.5 A3:.5 G3:1 | A3:2 C4:1 | C4:2 E4:1 | A3:3 | D4:1.5 C4:.5 B3:1' +
    ' | G3:2 A3:1 | C4:3 | D4:3 | D4:1.5 E4:.5 F#4:1 | C4:3 | E4:1.5 D4:.5 C4:1 | D4:1 C4:1 A3:1 | B3:3',
);
/** The quiet passage: the tune's climb in E minor on the cello, the clarinet's long notes over it. */
const QUIET = tune(
  'E4:.75 F#4:.25 G4:1 B4:1 | C5:1.5 B4:.5 G4:1 | A4:.75 G4:.25 F#4:1 A4:1 | G4:1.5 F#4:.5 E4:1' +
    ' | E4:.75 F#4:.25 G4:1 B4:1 | E5:1.5 D5:.5 C5:1 | B4:.75 A4:.25 G4:1 F#4:1 | F#4:3' +
    ' | E4:.75 F#4:.25 G4:1 B4:1 | E5:1.5 D5:.5 C5:1 | B4:.75 C5:.25 D5:1 B4:1 | A4:1.5 G4:.5 F#4:1' +
    ' | G4:.75 A4:.25 B4:1 G4:1 | C5:1.5 B4:.5 A4:1 | A4:.75 G4:.25 F#4:1 D#4:1 | E4:3',
);
const QUIET_OVER = tune(
  'B4:3 | G4:3 | A4:2 F#4:1 | B4:3 | B4:3 | C5:2 E5:1 | D#5:3 | B4:3 | G4:3 | A4:3 | B4:1.5 D5:1.5 | A4:3' +
    ' | B4:3 | E5:1.5 C5:1.5 | B4:2 A4:1 | G4:3',
);
/** The tide: the flute's few notes over the harp, the way home to G. */
const TIDE = tune('E5:3 | r:3 | D5:1.5 B4:1.5 | r:3 | E5:1.5 G5:1.5 | E5:3 | r:3 | A4:1.5 F#4:1.5');
/** The dance: the climb traded two bars at a time, each answer a step higher. */
const DANCE = tune(
  'G4:.75 A4:.25 B4:1 D5:1 | E5:1.5 D5:.5 B4:1 | C5:.75 D5:.25 E5:1 G5:1 | F#5:1.5 E5:.5 D5:1' +
    ' | G4:.75 A4:.25 B4:1 D5:1 | G5:1.5 F#5:.5 E5:1 | C5:.75 B4:.25 A4:1 C5:1 | D5:3' +
    ' | B4:.75 C5:.25 D5:1 G5:1 | B4:.75 C5:.25 D5:1 G5:1 | E5:.75 F#5:.25 G5:1 E5:1 | D5:1.5 C5:.5 A4:1' +
    ' | B4:.75 A4:.25 G4:1 B4:1 | C5:.75 B4:.25 A4:1 C5:1 | B4:1.5 A4:.5 F#4:1 | G4:3',
);
const OUTRO = tune('G4:.75 A4:.25 B4:1 D5:1 | E5:3 | D5:1.5 C5:1.5 | A4:3');
/** Who has the dance's two bars, in turn: the whistle an octave up. */
const TRADE: readonly (readonly [Track, number])[] = [
  ['whistle', 1],
  ['fiddle', 0],
  ['flute', 0],
  ['accordion', 0],
  ['whistle', 1],
  ['fiddle', 0],
  ['flute', 0],
  ['accordion', 0],
];

/** The hand drums for a bar: `busy` 0 the frame drum's stroke alone, 1 its taps, 2 the tambourine on the lilt and the
 *  shaker, 3 the bongos too. */
function drums(w: Write, bar: number, busy: number): void {
  const hit = (drum: Drum, beat: number, velocity: number) => w.hit(drum, bar, beat, velocity);
  hit('frame', 0, busy ? 92 : 74);
  if (busy >= 1) {
    hit('tap', 1, 58);
    hit('tap', 2, 50);
    hit('tap', 2.5, 40);
  }
  if (busy >= 2) {
    hit('tambourine', 1, 54);
    for (let i = 0; i < 6; i++) hit('shaker', i * 0.5, i % 2 ? 30 : 42);
  }
  if (busy >= 3)
    for (const [drum, beat, velocity] of [
      ['bongoLow', 0.5, 56],
      ['bongoHigh', 1.5, 62],
      ['bongoHigh', 2, 48],
      ['bongoLow', 2.5, 60],
    ] as const)
      hit(drum, beat, velocity);
}

/** The floor and the strumming: the bass, the pad and strings, the lute's waltz (or the dance's eighths) and the harp
 *  rolling where the lute rests. */
function underneath(w: Write): void {
  const bars = PLAN.map(({ section, inBar }) => HARMONY[section][inBar] ?? []);
  const quietly = (bar: number) => ['quiet', 'tide', 'intro', 'outro'].includes(PLAN[bar]?.section ?? '');
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    for (const n of CHORDS[name].pad) w.note('pad', bar, beat, beats, n, quietly(bar) ? 62 : 52);
    const section = PLAN[bar]?.section;
    if (section === 'b' || section === 'dance' || (section === 'a' && (PLAN[bar]?.pass ?? 0) > 0))
      for (const n of CHORDS[name].strings) w.note('strings', bar, beat, beats, n, 50);
  }
  PLAN.forEach(({ section, pass }, bar) => {
    const held = bars[bar] ?? [];
    const lively = section === 'dance' || (section === 'a' && pass === 2);
    for (const { chord: name, beat, beats } of held) {
      w.note('bass', bar, beat, Math.min(beats, 2), CHORDS[name].bass, 96);
      if (lively && beats > 2) w.note('bass', bar, 2, 0.9, CHORDS[name].bass, 76);
    }
    if (quietly(bar)) {
      [0, 1, 2, 3, 2, 1].forEach((index, i) =>
        w.note('harp', bar, i * 0.5, 1.6, CHORDS[chordAt(held, i * 0.5)].harp[index] ?? 0, i ? 58 : 72),
      );
      return;
    }
    const strums = lively ? [0.5, 1, 1.5, 2, 2.5] : pass > 0 || section === 'b' ? [1, 2, 2.5] : [1, 2];
    for (const beat of strums)
      for (const n of CHORDS[chordAt(held, beat)].lute) w.note('lute', bar, beat, 0.45, n, beat % 1 ? 52 : 66);
    drums(w, bar, section === 'dance' ? 3 : lively ? 2 : section === 'b' || pass > 0 ? 2 : 1);
  });
}

/** The tune passed round: who has it in each section, and who goes with them. */
function tunes(w: Write): void {
  PLAN.forEach(({ section, inBar, pass }, bar) => {
    if (inBar !== 0) return;
    if (section === 'a' && pass === 0) lay(w, 'flute', bar, THEME, 92, { legato: 0.94 });
    if (section === 'a' && pass === 1) {
      lay(w, 'fiddle', bar, THEME, 94, { legato: 0.92 });
      lay(w, 'cello', bar, COUNTER, 76, { legato: 0.96, accent: 4 });
    }
    if (section === 'a' && pass === 2) {
      lay(w, 'whistle', bar, THEME, 84, { octave: 1, legato: 0.9 });
      lay(w, 'fiddle', bar, THEME, 92, { legato: 0.92 });
      lay(w, 'flute', bar + 8, THEME, 80, { legato: 0.94, from: 8 });
      lay(w, 'horn', bar, COUNTER, 80, { legato: 0.96, accent: 4 });
    }
    if (section === 'b' && pass === 0) {
      lay(w, 'accordion', bar, SECOND, 90, { legato: 0.93 });
      lay(w, 'fiddle', bar, DESCANT, 72, { legato: 0.95, accent: 4 });
    }
    if (section === 'b' && pass === 1) {
      lay(w, 'fiddle', bar, SECOND, 92, { legato: 0.93 });
      lay(w, 'flute', bar, SECOND, 78, { octave: 1, legato: 0.94, accent: 4 });
      lay(w, 'horn', bar, HORN_SECOND, 78, { legato: 0.96, accent: 4 });
    }
    if (section === 'quiet') {
      lay(w, 'cello', bar, QUIET, 84, { octave: -1, legato: 0.97 });
      lay(w, 'clarinet', bar, QUIET_OVER, 66, { legato: 0.97, accent: 2 });
    }
    if (section === 'tide') lay(w, 'flute', bar, TIDE, 68, { legato: 0.97, accent: 2 });
    if (section === 'dance')
      TRADE.forEach(([track, octave], turn) =>
        lay(w, track, bar + turn * 2, DANCE, 90, { octave, legato: 0.9, from: turn * 2, to: turn * 2 + 2 }),
      );
    if (section === 'outro') lay(w, 'flute', bar, OUTRO, 74, { legato: 0.96 });
  });
}

/** Saltmere's theme, every layer at once, round and round while the player stays. */
export const saltmereScore = (): Song =>
  makeSong(
    {
      name: 'saltmere',
      bpm: BPM,
      bars: PLAN.length,
      beatsPerBar: BEATS,
      tracks: TRACKS,
      kit: KIT,
      level: LEVEL,
      press: PRESS,
    },
    (w) => {
      underneath(w);
      tunes(w);
    },
  );
