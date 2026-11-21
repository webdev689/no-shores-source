// The calm pieces' writing: what the social space's, the islands' and the sea's pieces out of danger share. Each piece
// is its own data (its chords voiced by hand, its sections, its tunes, its ostinato and its drums) laid here by one
// hand: a pad swelling under the harmony, a bass held under it or pulsing in the modern way (struck, then let go
// before the next, as if pressed down by the beat), an ostinato over the chords' own tones, the tune and its
// counter-line, and soft drums. A piece plays once through, whole; the world's leitmotif closes each, in its key: a
// rise of a fifth and a sigh from the minor sixth (the story's D, A, B flat, A).

import { chordAt, keys, measured, progression, runsOf } from './craft.ts';
import { type KitDrum, type Song, type TrackSpec, lay, makeSong } from './score.ts';

/** The parts a section may play. */
export type Part = 'pad' | 'bass' | 'arp' | 'lead' | 'counter' | 'drums';

/** A chord as a calm piece voices it, by hand: its bass, the pad's notes, and the ostinato's notes from low to high. */
export interface CalmChord {
  readonly bass: string;
  readonly pad: string;
  readonly arp: string;
}

/** A section: its progression (`|` between bars, `/` within one), the parts playing, the tune and the counter-line
 *  laid from its first bar (each a `measured` line), and how loud it plays, 0 to 1. */
export interface CalmSection {
  readonly bars: string;
  readonly parts: readonly Part[];
  readonly lead?: string;
  readonly counter?: string;
  readonly level?: number;
}

/** The ostinato: which of a chord's notes each step plays, a step `step` beats long, and each step's velocity. */
export interface Ostinato {
  readonly step: number;
  readonly order: readonly number[];
  readonly velocity: readonly number[];
}

/** The bass: held under each chord (`step` null), or struck each `step` beats at these velocities in turn. */
export interface Pulse {
  readonly step: number | null;
  readonly velocity: readonly number[];
}

/** The drums: each name's key, the sounds to draw them from (DRUMS), and what a bar plays where `drums` is on:
 *  [name, beat, velocity]. */
export interface CalmKit<D extends string> {
  readonly keys: Readonly<Record<D, number>>;
  readonly drums: Readonly<Record<string, KitDrum>>;
  readonly bar: readonly (readonly [D, number, number])[];
}

export interface CalmSpec<C extends string, D extends string> {
  readonly name: string;
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly tracks: Readonly<Record<Exclude<Part, 'drums'>, TrackSpec>>;
  readonly chords: Readonly<Record<C, CalmChord>>;
  readonly sections: readonly CalmSection[];
  readonly arp: Ostinato;
  readonly bass: Pulse;
  readonly kit: CalmKit<D>;
}

/** The instruments the calm pieces draw on, each with its own voice: soft, warm and low, none that rings. */
export const INSTRUMENTS = {
  pad: {
    program: 89,
    volume: 78,
    pan: 64,
    role: 'bed',
    voice: { attack: 1.4, release: 2.2, index: 0.6, idxDecay: 2, unison: 2, cents: 9, spread: 0.5 },
  },
  strings: {
    program: 49,
    volume: 82,
    pan: 70,
    role: 'bed',
    voice: { attack: 0.9, release: 1.6, index: 0.9, idxDecay: 2, unison: 2, cents: 8, spread: 0.45 },
  },
  bass: {
    program: 32,
    volume: 74,
    pan: 64,
    role: 'bed',
    voice: { attack: 0.01, decay: 0.7, sustain: 0.35, release: 0.35, index: 1, idxDecay: 0.2, sub: 0.35 },
  },
  piano: {
    program: 0,
    volume: 96,
    pan: 54,
    role: 'pulse',
    voice: { index: 1.5, idxDecay: 0.22, decay: 1.4, sustain: 0.04, release: 0.9, unison: 2, cents: 3, spread: 0.2 },
  },
  harp: { program: 46, volume: 104, pan: 80, role: 'pulse', voice: { index: 1.6, idxDecay: 0.25, release: 0.9 } },
  oud: {
    program: 24,
    volume: 104,
    pan: 44,
    role: 'pulse',
    voice: { index: 2, idxDecay: 0.1, decay: 0.5, sustain: 0.05, release: 0.25 },
  },
  marimba: {
    program: 12,
    volume: 100,
    pan: 72,
    role: 'pulse',
    voice: { mod: 4, index: 1.3, idxDecay: 0.06, decay: 0.3, sustain: 0.01, release: 0.2 },
  },
  kalimba: {
    program: 108,
    volume: 90,
    pan: 84,
    role: 'pulse',
    voice: { mod: 3, index: 1.2, idxDecay: 0.08, decay: 0.7, sustain: 0.01, release: 0.5 },
  },
  pizzicato: { program: 45, volume: 100, pan: 50, role: 'pulse', voice: { index: 2, idxDecay: 0.1 } },
  cello: {
    program: 42,
    volume: 104,
    pan: 48,
    role: 'lead',
    voice: { attack: 0.12, decay: 0.3, sustain: 0.85, release: 0.5, index: 1.4, idxDecay: 0.9, unison: 2, cents: 5 },
  },
  horn: {
    program: 60,
    volume: 92,
    pan: 36,
    role: 'lead',
    voice: { attack: 0.12, index: 1.6, idxDecay: 0.8, release: 0.5, unison: 2, cents: 5, spread: 0.2 },
  },
  flute: {
    program: 73,
    volume: 100,
    pan: 70,
    role: 'lead',
    voice: { attack: 0.08, index: 0.5, idxDecay: 0.6, release: 0.4, unison: 2, cents: 4 },
  },
  oboe: { program: 68, volume: 94, pan: 62, role: 'lead', voice: { attack: 0.06, index: 1.6, idxDecay: 0.7 } },
  clarinet: { program: 71, volume: 100, pan: 58, role: 'lead', voice: { attack: 0.06, index: 1.2, idxDecay: 0.7 } },
  bassoon: { program: 70, volume: 104, pan: 46, role: 'lead', voice: { attack: 0.06, index: 1.4, idxDecay: 0.6 } },
  fiddle: {
    program: 40,
    volume: 96,
    pan: 60,
    role: 'lead',
    voice: { attack: 0.06, decay: 0.3, sustain: 0.8, release: 0.4, index: 1.4, idxDecay: 0.8, unison: 2, cents: 5 },
  },
} as const satisfies Readonly<Record<string, TrackSpec>>;

/** A calm piece's track in its place: a melodic instrument as the tune's or the counter-line's, at its own role. */
export const inRole = (track: TrackSpec, role: TrackSpec['role'], pan = track.pan): TrackSpec => ({
  ...track,
  role,
  pan,
});

/** The drums the calm pieces draw on, soft and low: a distant taiko, a frame drum's low stroke and its tap, a log
 *  drum, a deep heartbeat, a brush. */
export const DRUMS = {
  taiko: { hz: 58, decay: 0.9, gain: 1, drop: 0.72, click: 0.08 },
  frame: { hz: 92, decay: 0.32, gain: 0.85, drop: 0.8, click: 0.2 },
  tap: { hz: 170, decay: 0.08, gain: 0.45, click: 0.3 },
  log: { hz: 190, decay: 0.16, gain: 0.6, drop: 0.92, click: 0.15 },
  deep: { hz: 52, decay: 0.5, gain: 0.9, drop: 0.7 },
  brush: { hz: 3200, q: 0.8, decay: 0.09, gain: 0.16 },
} as const satisfies Readonly<Record<string, KitDrum>>;

/** How loud each part plays before its section's level: the pad under all, the tune over all. */
const VELOCITY = { pad: 58, lead: 92, counter: 74 } as const;

/** How the calm pieces are pressed: gently, their peaks held a little and the whole raised. */
const PRESS = { threshold: -24, knee: 18, ratio: 2, attack: 0.02, release: 0.3, out: 1.75, ceiling: -3 } as const;

/** A calm piece, laid from its spec. */
export function calmPiece<C extends string, D extends string>(spec: CalmSpec<C, D>): Song {
  const { beatsPerBar } = spec;
  const sections = spec.sections.map((section) => ({
    ...section,
    held: progression(section.bars, spec.chords, beatsPerBar),
  }));
  const bars = sections.reduce((sum, section) => sum + section.held.length, 0);
  return makeSong(
    {
      name: spec.name,
      bpm: spec.bpm,
      bars,
      beatsPerBar,
      tracks: spec.tracks,
      kit: {
        volume: 96,
        role: 'combat',
        keys: spec.kit.keys,
        // Only the drums the piece names, each its own sound.
        drums: Object.fromEntries(
          Object.keys(spec.kit.keys).map((drum) => [drum, spec.kit.drums[drum] ?? {}]),
        ) as Partial<Record<D, KitDrum>>,
      },
      // As loud as Saltmere's old theme, about 3.7 dB under a fight.
      level: 2,
      press: PRESS,
      edge: { wrap: false, clip: true, hold: true, restrike: true },
    },
    (w) => {
      let first = 0;
      for (const section of sections) {
        const level = section.level ?? 1;
        const playing = new Set(section.parts);
        for (const run of runsOf(section.held, beatsPerBar)) {
          const chord = spec.chords[run.chord];
          const bar = first + run.bar;
          if (playing.has('pad'))
            for (const note of keys(chord.pad)) w.note('pad', bar, run.beat, run.beats, note, VELOCITY.pad * level);
          if (!playing.has('bass')) continue;
          const { step, velocity } = spec.bass;
          if (step === null) w.note('bass', bar, run.beat, run.beats, chord.bass, (velocity[0] ?? 80) * level);
          else
            for (let beat = 0, nth = 0; beat < run.beats - 1e-9; beat += step, nth++)
              w.note(
                'bass',
                bar,
                run.beat + beat,
                step * 0.8,
                chord.bass,
                (velocity[nth % velocity.length] ?? 60) * level,
              );
        }
        section.held.forEach((held, inBar) => {
          const bar = first + inBar;
          if (playing.has('arp'))
            for (let beat = 0, nth = 0; beat < beatsPerBar - 1e-9; beat += spec.arp.step, nth++) {
              const notes = keys(spec.chords[chordAt(held, beat)].arp);
              const note = notes[(spec.arp.order[nth % spec.arp.order.length] ?? 0) % notes.length];
              const velocity = (spec.arp.velocity[nth % spec.arp.velocity.length] ?? 40) * level;
              if (note !== undefined) w.note('arp', bar, beat, spec.arp.step * 1.6, note, velocity);
            }
          if (playing.has('drums'))
            for (const [drum, beat, velocity] of spec.kit.bar) w.hit(drum, bar, beat, velocity * level);
        });
        if (section.lead && playing.has('lead'))
          lay(w, 'lead', first, measured(section.lead, beatsPerBar), VELOCITY.lead * level, {
            legato: 0.96,
            accent: 4,
          });
        if (section.counter && playing.has('counter'))
          lay(w, 'counter', first, measured(section.counter, beatsPerBar), VELOCITY.counter * level, {
            legato: 0.98,
            accent: 2,
          });
        first += section.held.length;
      }
    },
  );
}
