// The plaza band's tune: a jig in D (6/8) the four play together where they stand, the flute's tune over the lute's
// chords, the recorder under the flute (long thirds the first time through, a third below its tune the second), the
// tambourine on the beats. Each instrument is its own song cut from the one score, so each is heard from where its
// player stands (`band.ts`); all four are one length and begin together, so they keep in step.

import { PERCUSSION_CHANNEL } from './fmBank.ts';
import { type Song, type Writer, lay, makeSong, midiNote, tune } from './score.ts';

/** The band's instruments, as their players' moves name them (`play_lute` and the rest). */
export const INSTRUMENTS = ['lute', 'flute', 'recorder', 'tambourine'] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

type Track = Exclude<Instrument, 'tambourine'>;
type Drum = 'tambourine' | 'jingle';

/** The tune, twice eight bars: the first part, then the second, each closing home. */
const TUNE = tune(
  [
    'D5:1 F#5:.5 A5:1 F#5:.5',
    'G5:.5 F#5:.5 E5:.5 D5:1 B4:.5',
    'A4:1 D5:.5 F#5:1 D5:.5',
    'E5:1.5 E5:.5 F#5:.5 G5:.5',
    'A5:1 B5:.5 A5:1 F#5:.5',
    'G5:.5 F#5:.5 E5:.5 D5:1 B4:.5',
    'A4:.5 B4:.5 C#5:.5 D5:.5 E5:.5 C#5:.5',
    'D5:1.5 D5:1.5',
    'F#5:.5 G5:.5 A5:.5 B5:1 A5:.5',
    'G5:1 E5:.5 E5:1 F#5:.5',
    'G5:.5 A5:.5 G5:.5 F#5:1 D5:.5',
    'E5:1.5 A4:1.5',
    'F#5:.5 G5:.5 A5:.5 B5:1 A5:.5',
    'G5:1 B5:.5 A5:1 F#5:.5',
    'E5:.5 F#5:.5 E5:.5 C#5:1 A4:.5',
    'D5:1.5 r:1.5',
  ].join(' | '),
);
/** Each bar's chord, root first, then its third and fifth. */
const CHORDS: readonly (readonly [string, string, string])[] = [
  ['D3', 'F#3', 'A3'],
  ['G2', 'B3', 'D4'],
  ['D3', 'F#3', 'A3'],
  ['A2', 'C#4', 'E4'],
  ['D3', 'F#3', 'A3'],
  ['G2', 'B3', 'D4'],
  ['A2', 'C#4', 'E4'],
  ['D3', 'F#3', 'A3'],
  ['D3', 'F#3', 'A3'],
  ['E3', 'G3', 'B3'],
  ['G2', 'B3', 'D4'],
  ['A2', 'C#4', 'E4'],
  ['D3', 'F#3', 'A3'],
  ['G2', 'B3', 'D4'],
  ['A2', 'C#4', 'E4'],
  ['D3', 'F#3', 'A3'],
];
/** Every key of D major, low to high, for the note a third under another of the scale. */
const IN_D = new Set([1, 2, 4, 6, 7, 9, 11]);
const D_MAJOR = Array.from({ length: 128 }, (unused, key) => key).filter((key) => IN_D.has(key % 12));
const thirdUnder = (key: number): number => D_MAJOR[D_MAJOR.indexOf(key) - 2] ?? key - 3;
/** Each pitched instrument's General MIDI program: a nylon-strung guitar for the lute. */
const PROGRAMS: Readonly<Record<Track, number>> = { lute: 24, flute: 73, recorder: 74 };

function write(w: Writer<Track, Drum>): void {
  lay(w, 'flute', 0, TUNE, 86, { legato: 0.85, accent: 10 });
  lay(w, 'recorder', 8, TUNE, 66, { legato: 0.8, accent: 6, from: 8, to: 16, map: thirdUnder });
  CHORDS.forEach(([root, third, fifth], bar) => {
    // Oom-pa-pa twice a bar: the root, then the third and fifth plucked short; the fifth low, then the chord again.
    w.note('lute', bar, 0, 1.4, root, 84);
    w.note('lute', bar, 1.5, 1.4, midiNote(root) + 7, 74);
    for (const beat of [0.5, 1, 2, 2.5]) for (const key of [third, fifth]) w.note('lute', bar, beat, 0.4, key, 60);
    if (bar < 8) w.note('recorder', bar, 0, 2.8, third, 58);
    w.hit('tambourine', bar, 0, 92);
    w.hit('tambourine', bar, 1.5, 78);
    for (const beat of [0.5, 1, 2, 2.5]) w.hit('jingle', bar, beat, 44);
  });
}

/** The tune as the four play it, one song for each instrument, all of one length. */
export function bandParts(): Readonly<Record<Instrument, Song>> {
  const whole = makeSong<Track, Drum>(
    {
      name: 'the plaza band',
      bpm: 108,
      bars: CHORDS.length,
      beatsPerBar: 3,
      level: 2.4,
      tracks: {
        lute: {
          program: PROGRAMS.lute,
          volume: 104,
          pan: 64,
          role: 'bed',
          voice: { decay: 0.6, sustain: 0.1, release: 0.3 },
        },
        flute: {
          program: PROGRAMS.flute,
          volume: 100,
          pan: 64,
          role: 'bed',
          voice: { attack: 0.05, unison: 2, cents: 4 },
        },
        recorder: { program: PROGRAMS.recorder, volume: 92, pan: 64, role: 'bed', voice: { attack: 0.04 } },
      },
      kit: { volume: 84, role: 'bed', keys: { tambourine: 54, jingle: 54 } },
    },
    write,
  );
  const part = (name: Instrument, channel: number | null): Song => ({
    ...whole,
    name: `the plaza band's ${name}`,
    tracks: whole.tracks.filter((track) => track.channel === channel),
    notes: whole.notes.filter((note) =>
      channel === null ? note.channel === PERCUSSION_CHANNEL : note.channel === channel,
    ),
  });
  const channelOf = (name: Track) => whole.tracks.find((track) => track.program === PROGRAMS[name])?.channel ?? -1;
  return {
    lute: part('lute', channelOf('lute')),
    flute: part('flute', channelOf('flute')),
    recorder: part('recorder', channelOf('recorder')),
    tambourine: part('tambourine', null),
  };
}
