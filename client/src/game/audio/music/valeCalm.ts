// The Drowned Vale's calm pieces, for the run's quiet stretches (the Descent, the Broken Stair, after an encounter):
// sparse, low, on felt piano, harp, cello, a singing bowl and the choir, each recording played once its pick has come.
// The Descent states the raid's theme on the cello in D; the Broken Stair climbs in A on the piano over the harp; After
// the Bells sets the theme on the choir in G. Each closes on the world's leitmotif in its key.

import { type CalmKit, DRUMS, INSTRUMENTS, calmPiece, inRole } from './calm.ts';
import type { Sample, Song, TrackSpec } from './score.ts';
import { THEME_TEXT, TRACKS } from './valeParts.ts';

const played = (track: TrackSpec, sample: Sample): TrackSpec => ({ ...track, sample });
const pad = played(INSTRUMENTS.pad, { cue: 'music.bowl', attack: 1.2, release: 2.2, gain: 0.6 });
const bass = played(INSTRUMENTS.bass, { cue: 'music.bass', attack: 0.05, release: 0.5 });
const piano = played(INSTRUMENTS.piano, { cue: 'music.piano', attack: 0.003, release: 0.9 });
const harp = played(INSTRUMENTS.harp, { cue: 'music.harp', attack: 0.003, release: 0.9 });
const cello = played(INSTRUMENTS.cello, { cue: 'music.cello', attack: 0.12, release: 0.6 });
const choir = { ...TRACKS.choir, volume: 92 };
/** One deep stroke, far off, where a section plays its drums. */
const KIT: CalmKit<'deep'> = { keys: { deep: 41 }, drums: DRUMS, bar: [['deep', 0, 44]] };

function descent(): Song {
  return calmPiece({
    name: 'vale-descent',
    bpm: 60,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: piano, lead: cello, counter: choir },
    chords: {
      Dm: { bass: 'D2', pad: 'D3 A3 F4', arp: 'D3 A3 D4 F4' },
      Bb: { bass: 'Bb1', pad: 'D3 F3 Bb3', arp: 'Bb2 F3 D4 F4' },
      Eb: { bass: 'Eb2', pad: 'Eb3 G3 Bb3', arp: 'Eb3 Bb3 Eb4 G4' },
      C: { bass: 'C2', pad: 'E3 G3 C4', arp: 'C3 G3 E4 G4' },
      Gm: { bass: 'G1', pad: 'D3 G3 Bb3', arp: 'G2 D3 Bb3 D4' },
      A: { bass: 'A1', pad: 'E3 A3 C#4', arp: 'A2 E3 C#4 E4' },
    },
    arp: { step: 1, order: [0, 2, 1, 3], velocity: [48, 30, 38, 30] },
    bass: { step: null, velocity: [62] },
    kit: KIT,
    sections: [
      { bars: 'Dm | Eb | Dm | Eb', parts: ['pad', 'arp'], level: 0.7 },
      {
        bars: 'Dm | Gm | Eb | Dm | Bb | Gm | Eb | Dm',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: THEME_TEXT,
      },
      {
        bars: 'Bb | C | Dm | A | Bb | Gm | Eb | Dm',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter: 'F4:4 | E4:4 | D4:2 F4:2 | E4:4 | D4:4 | D4:2 Bb3:2 | Bb3:4 | A3:4',
        level: 0.85,
      },
      {
        bars: 'Dm | Eb | Dm | Dm',
        parts: ['pad', 'bass', 'lead'],
        lead: 'D3:2 A3:2 | Bb3:2 A3:2 | D3:4 | r:4',
        level: 0.7,
      },
    ],
  });
}

function stair(): Song {
  return calmPiece({
    name: 'vale-stair',
    bpm: 56,
    beatsPerBar: 3,
    tracks: { pad, bass, arp: harp, lead: inRole(piano, 'lead'), counter: cello },
    chords: {
      Am: { bass: 'A1', pad: 'E3 A3 C4', arp: 'A2 E3 C4 E4' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 D4 F4' },
      Dm: { bass: 'D2', pad: 'D3 F3 A3', arp: 'D3 A3 D4 F4' },
      F: { bass: 'F1', pad: 'F3 A3 C4', arp: 'F2 C3 A3 C4' },
      G: { bass: 'G1', pad: 'D3 G3 B3', arp: 'G2 D3 B3 D4' },
      E: { bass: 'E2', pad: 'E3 G#3 B3', arp: 'E2 B2 G#3 B3' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 3, 2, 1], velocity: [52, 30, 38, 34, 36, 28] },
    bass: { step: null, velocity: [60] },
    kit: KIT,
    sections: [
      { bars: 'Am | Bb | Am | Bb', parts: ['pad', 'arp'], level: 0.6 },
      {
        bars: 'Am | Dm | Bb | Am | F | G | Bb | Am',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'A4:2 Bb4:1 | C5:3 | D5:1.5 C5:1.5 | A4:3 | C5:2 D5:1 | E5:2 D5:1 | C5:1 Bb4:1 A4:1 | A4:3',
      },
      {
        bars: 'F | G | Am | E | F | Dm | Bb | Am',
        parts: ['pad', 'arp', 'bass', 'counter'],
        counter: 'C4:3 | B3:3 | A3:1.5 C4:1.5 | B3:3 | A3:3 | F3:3 | F3:1.5 D3:1.5 | E3:3',
        level: 0.85,
      },
      {
        bars: 'Am | Dm | Bb | Am | F | G | Bb | Am',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: 'A4:2 Bb4:1 | C5:3 | D5:1.5 C5:1.5 | A4:3 | C5:2 D5:1 | E5:2 D5:1 | C5:1 Bb4:1 A4:1 | A4:3',
        counter: 'A2:3 | D3:3 | D3:3 | C3:3 | C3:3 | B2:3 | D3:3 | C3:3',
      },
      {
        bars: 'Am | Bb | Am | Am',
        parts: ['pad', 'arp', 'lead'],
        lead: 'A4:1.5 E5:1.5 | F5:2 E5:1 | A4:3 | r:3',
        level: 0.6,
      },
    ],
  });
}

function afterBells(): Song {
  return calmPiece({
    name: 'vale-after-bells',
    bpm: 54,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: piano, lead: choir, counter: inRole(cello, 'lead') },
    chords: {
      Gm: { bass: 'G1', pad: 'D3 G3 Bb3', arp: 'G2 D3 Bb3 D4' },
      Ab: { bass: 'Ab1', pad: 'Eb3 Ab3 C4', arp: 'Ab2 Eb3 C4 Eb4' },
      Eb: { bass: 'Eb2', pad: 'Eb3 G3 Bb3', arp: 'Eb3 Bb3 Eb4 G4' },
      Cm: { bass: 'C2', pad: 'Eb3 G3 C4', arp: 'C3 G3 C4 Eb4' },
      D: { bass: 'D2', pad: 'D3 F#3 A3', arp: 'D3 A3 D4 F#4' },
      F: { bass: 'F1', pad: 'F3 A3 C4', arp: 'F2 C3 A3 C4' },
    },
    arp: { step: 1, order: [0, 1, 2, 1], velocity: [44, 28, 34, 28] },
    bass: { step: 2, velocity: [60, 40] },
    kit: KIT,
    sections: [
      { bars: 'Gm | Ab | Gm | Ab', parts: ['pad', 'arp'], level: 0.6 },
      {
        bars: 'Gm | Cm | Ab | Gm | Eb | Cm | D | Gm',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'G3:2 Ab3:1 Bb3:1 | C4:3 Bb3:1 | Ab3:1.5 G3:.5 F3:1 Ab3:1 | G3:4 | Bb3:2 C4:1 D4:1 | Eb4:2 D4:1 C4:1 | Bb3:1 A3:1 G3:1 F#3:1 | G3:4',
      },
      {
        bars: 'Eb | F | Gm | D | Eb | Cm | Ab | Gm',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter: 'G3:4 | F3:4 | D3:2 G3:2 | F#3:4 | G3:4 | Eb3:4 | Eb3:4 | D3:4',
        level: 0.85,
      },
      {
        bars: 'Gm | Ab | Gm | Gm',
        parts: ['pad', 'bass', 'lead', 'counter'],
        lead: 'G3:2 D4:2 | Eb4:3 D4:1 | G3:4 | r:4',
        counter: 'G2:4 | Ab2:4 | G2:4 | r:4',
        level: 0.75,
      },
    ],
  });
}

/** The Drowned Vale's calm pieces. */
export const valeCalm = (): readonly Song[] => [descent(), stair(), afterBells()];
