// The islands' calm pieces, four for each family of climates (the second pair in islandPiecesMore.ts), heard now and
// then while roaming with minutes of silence between them: weathered, never bright, each closing on the world's
// leitmotif in its key. The first pair here. Green: Moorlight, E Aeolian
// in 6/8 on a low whistle over a rolling harp; Cairn, E Dorian, horn calls over a pulsing piano. Dry: Sunscorch, A
// Phrygian dominant, an oud's ostinato under the oboe; Dust Road, F sharp Phrygian, a lone cello over a sparse harp.
// Wet: Mistwrack, F sharp Aeolian, a low marimba in three, three and two under the clarinet; Fen, C sharp minor, a
// bassoon over a kalimba dripping. Cold: Rime, B Aeolian, a horn over open fifths; Whiteout, B Phrygian, slowest of
// all, the cello over the piano's half notes.

import type { Family } from './directorLaw.ts';
import { DRUMS, INSTRUMENTS, calmPiece, inRole } from './calm.ts';
import { moreIslandPieces } from './islandPiecesMore.ts';
import type { Song } from './score.ts';

const { pad, strings, bass, piano, harp, oud, marimba, kalimba, cello, horn, flute, oboe, clarinet, bassoon } =
  INSTRUMENTS;

function moorlight(): Song {
  return calmPiece({
    name: 'moorlight',
    bpm: 78,
    beatsPerBar: 3,
    tracks: { pad, bass, arp: harp, lead: flute, counter: inRole(cello, 'lead') },
    chords: {
      Em: { bass: 'E2', pad: 'G3 B3 D4', arp: 'E3 B3 E4 F#4' },
      C: { bass: 'C2', pad: 'G3 C4 E4', arp: 'C3 G3 D4 E4' },
      Csus2: { bass: 'C2', pad: 'G3 C4 D4', arp: 'C3 G3 D4 G4' },
      G: { bass: 'G2', pad: 'G3 B3 D4', arp: 'G2 D3 B3 D4' },
      D: { bass: 'D2', pad: 'F#3 A3 D4', arp: 'D3 A3 E4 F#4' },
      Am: { bass: 'A2', pad: 'A3 C4 E4', arp: 'A2 E3 C4 E4' },
      Bm: { bass: 'B1', pad: 'F#3 B3 D4', arp: 'B2 F#3 D4 F#4' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 3, 2, 1], velocity: [58, 36, 44, 40, 42, 34] },
    bass: { step: null, velocity: [68] },
    kit: {
      keys: { frame: 41 },
      drums: DRUMS,
      bar: [
        ['frame', 0, 52],
        ['frame', 1.5, 34],
      ],
    },
    sections: [
      { bars: 'Em | Csus2 | Em | Csus2', parts: ['pad', 'arp', 'bass'], level: 0.75 },
      {
        bars: 'Em | C | G | D | Em | C | Am | Bm',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'E4:1 F#4:.5 G4:1.5 | E4:3 | D4:1 E4:.5 G4:1.5 | A4:3 | B4:1 A4:.5 G4:1.5 | E4:1.5 G4:1.5 | A4:1 G4:.5 E4:1.5 | F#4:3',
      },
      {
        bars: 'C | G | D | Em | C | G | Am | Bm',
        parts: ['pad', 'arp', 'bass', 'counter'],
        counter:
          'C4:1.5 B3:1.5 | D4:3 | A3:1 B3:.5 D4:1.5 | E4:3 | G4:1 E4:.5 C4:1.5 | B3:1.5 D4:1.5 | C4:1 B3:.5 A3:1.5 | B3:3',
        level: 0.9,
      },
      { bars: 'Em | Csus2 | Em | D', parts: ['pad', 'arp', 'drums'], level: 0.7 },
      {
        bars: 'Em | C | G | D | Em | C | Am | Bm',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: 'E4:1 F#4:.5 G4:1.5 | E4:3 | D4:1 E4:.5 G4:1.5 | A4:3 | B4:1 A4:.5 G4:1.5 | E4:1.5 G4:1.5 | A4:1 G4:.5 E4:1.5 | F#4:3',
        counter: 'E3:3 | C3:3 | B2:3 | A2:3 | G2:3 | C3:3 | A2:3 | B2:3',
      },
      {
        bars: 'C | G | D | Em | C | G | Am | Bm',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead'],
        counter:
          'C4:1.5 B3:1.5 | D4:3 | A3:1 B3:.5 D4:1.5 | E4:3 | G4:1 E4:.5 C4:1.5 | B3:1.5 D4:1.5 | C4:1 B3:.5 A3:1.5 | B3:3',
        lead: 'G4:3 | D4:3 | F#4:3 | G4:3 | E4:3 | D4:3 | E4:3 | F#4:3',
        level: 0.85,
      },
      {
        bars: 'Am | C | Bm | Em',
        parts: ['pad', 'arp', 'lead'],
        lead: 'E4:1.5 B4:1.5 | C5:3 | B4:3 | E4:3',
        level: 0.7,
      },
    ],
  });
}

function cairn(): Song {
  return calmPiece({
    name: 'cairn',
    bpm: 66,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: piano, lead: horn, counter: inRole(cello, 'lead') },
    chords: {
      Em: { bass: 'E2', pad: 'E3 B3 F#4', arp: 'E3 B3 E4 F#4' },
      A: { bass: 'A1', pad: 'A3 C#4 E4', arp: 'A2 E3 C#4 E4' },
      G: { bass: 'G2', pad: 'G3 B3 D4', arp: 'G2 D3 B3 D4' },
      D: { bass: 'D2', pad: 'D3 A3 F#4', arp: 'D3 A3 D4 F#4' },
      Cmaj7: { bass: 'C2', pad: 'E3 G3 B3', arp: 'C3 G3 B3 E4' },
      Bm: { bass: 'B1', pad: 'D3 F#3 B3', arp: 'B2 F#3 B3 D4' },
    },
    arp: { step: 0.5, order: [0, 2, 1, 2, 0, 2, 1, 3], velocity: [56, 34, 42, 34, 50, 34, 42, 38] },
    bass: { step: 0.5, velocity: [78, 38, 50, 38, 68, 38, 50, 38] },
    kit: {
      keys: { taiko: 41 },
      drums: DRUMS,
      bar: [
        ['taiko', 0, 66],
        ['taiko', 3.5, 38],
      ],
    },
    sections: [
      { bars: 'Em | A | Em | A', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Em | A | Em | A | G | D | Cmaj7 | Bm',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'B3:3 E4:1 | C#4:2 E4:2 | F#4:2 G4:1 F#4:1 | E4:4 | D4:2 G4:2 | F#4:3 E4:1 | E4:1.5 D4:.5 B3:2 | B3:4',
      },
      {
        bars: 'Cmaj7 | G | D | Em | Cmaj7 | G | A | Bm',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead'],
        counter: 'G3:2 B3:2 | D4:4 | A3:2 F#3:2 | E3:4 | C4:2 B3:2 | G3:2 D4:2 | C#4:4 | B3:4',
        lead: 'E4:4 | D4:4 | D4:4 | B3:4 | E4:4 | D4:4 | E4:4 | F#4:4',
        level: 0.9,
      },
      {
        bars: 'Em | A | Em | A | G | D | Cmaj7 | Bm',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: 'B3:3 E4:1 | C#4:2 E4:2 | F#4:2 G4:1 F#4:1 | E4:4 | D4:2 G4:2 | F#4:3 E4:1 | E4:1.5 D4:.5 B3:2 | B3:4',
        counter: 'E3:4 | A2:4 | B2:4 | C#3:4 | G2:4 | A2:4 | C3:4 | B2:4',
      },
      {
        bars: 'Em | Cmaj7 | Bm | Em',
        parts: ['pad', 'arp', 'lead'],
        lead: 'E3:1 B3:3 | C4:4 | B3:4 | E3:4',
        level: 0.7,
      },
    ],
  });
}

function sunscorch(): Song {
  return calmPiece({
    name: 'sunscorch',
    bpm: 76,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: oud, lead: oboe, counter: inRole(cello, 'lead') },
    chords: {
      A: { bass: 'A1', pad: 'E3 A3 C#4', arp: 'A2 E3 Bb3 C#4' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 Bb3 D4' },
      Gm: { bass: 'G2', pad: 'G3 Bb3 D4', arp: 'G2 D3 Bb3 D4' },
      Dm: { bass: 'D2', pad: 'F3 A3 D4', arp: 'D3 A3 D4 F4' },
      Asus: { bass: 'A1', pad: 'D3 E3 A3', arp: 'A2 E3 A3 D4' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 1, 3, 1, 2, 1], velocity: [72, 44, 54, 42, 64, 42, 52, 42] },
    bass: { step: null, velocity: [70] },
    kit: {
      keys: { frame: 41, tap: 45 },
      drums: DRUMS,
      bar: [
        ['frame', 0, 74],
        ['tap', 1, 38],
        ['tap', 1.5, 28],
        ['frame', 2, 56],
        ['tap', 3, 40],
        ['tap', 3.5, 30],
      ],
    },
    sections: [
      { bars: 'A | Bb | A | Asus', parts: ['pad', 'arp', 'bass'], level: 0.75 },
      {
        bars: 'A | Bb | A | Bb | Gm | A | Dm | Asus',
        parts: ['pad', 'arp', 'bass', 'lead', 'drums'],
        lead: 'A4:2 Bb4:1 A4:1 | Bb4:2 D5:2 | C#5:1.5 Bb4:.5 A4:2 | F4:3 G4:1 | G4:2 Bb4:2 | A4:4 | F4:1.5 E4:.5 D4:2 | E4:4',
      },
      {
        bars: 'Dm | Gm | A | A | Dm | Bb | Gm | A',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter'],
        counter: 'D3:4 | G3:4 | C#3:2 E3:2 | A2:4 | F3:2 D3:2 | Bb2:4 | G2:2 D3:2 | E3:4',
        lead: 'r:2 A4:2 | Bb4:4 | A4:4 | r:4 | r:2 D5:2 | F5:4 | D5:4 | C#5:4',
        level: 0.9,
      },
      {
        bars: 'A | Bb | A | Bb | Gm | A | Dm | Asus',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: 'A4:2 Bb4:1 A4:1 | Bb4:2 D5:2 | C#5:1.5 Bb4:.5 A4:2 | F4:3 G4:1 | G4:2 Bb4:2 | A4:4 | F4:1.5 E4:.5 D4:2 | E4:4',
        counter: 'A2:4 | Bb2:4 | A2:4 | D3:4 | G2:4 | A2:4 | D3:4 | A2:4',
      },
      {
        bars: 'A | Dm | Asus | A',
        parts: ['pad', 'arp', 'lead'],
        lead: 'A4:2 E5:2 | F5:4 | E5:4 | A4:4',
        level: 0.7,
      },
    ],
  });
}

function dustRoad(): Song {
  return calmPiece({
    name: 'dust-road',
    bpm: 60,
    beatsPerBar: 4,
    tracks: { pad: strings, bass, arp: harp, lead: cello, counter: inRole(oboe, 'lead') },
    chords: {
      'F#m': { bass: 'F#2', pad: 'C#3 F#3 A3', arp: 'F#2 C#3 A3 C#4' },
      'G': { bass: 'G2', pad: 'D3 G3 B3', arp: 'G2 D3 B3 D4' },
      'Em': { bass: 'E2', pad: 'E3 G3 B3', arp: 'E2 B2 G3 B3' },
      'D': { bass: 'D2', pad: 'D3 F#3 A3', arp: 'D2 A2 F#3 A3' },
      'Bm': { bass: 'B1', pad: 'D3 F#3 B3', arp: 'B1 F#2 D3 F#3' },
      'A': { bass: 'A1', pad: 'C#3 E3 A3', arp: 'A1 E2 C#3 E3' },
    },
    arp: { step: 1, order: [0, 1, 2, 3], velocity: [50, 30, 38, 30] },
    bass: { step: null, velocity: [66] },
    kit: { keys: { deep: 36 }, drums: DRUMS, bar: [['deep', 0, 40]] },
    sections: [
      { bars: 'F#m | G | F#m | G', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'F#m | G | Em | F#m | D | Bm | A | F#m',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'F#3:2 C#4:2 | D4:3 r:1 | B3:1.5 A3:.5 G3:2 | F#3:4 | A3:2 B3:2 | D4:1.5 C#4:.5 B3:2 | A3:2 G3:2 | F#3:4',
      },
      {
        bars: 'D | A | G | F#m | D | A | G | F#m',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter: 'F#4:2 A4:2 | E4:4 | D4:2 B4:2 | C#5:4 | D5:2 A4:2 | C#5:2 E4:2 | D4:2 B3:2 | C#4:4',
        level: 0.85,
      },
      {
        bars: 'F#m | G | Em | F#m | D | Bm | A | F#m',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter'],
        lead: 'F#3:2 C#4:2 | D4:3 r:1 | B3:1.5 A3:.5 G3:2 | F#3:4 | A3:2 B3:2 | D4:1.5 C#4:.5 B3:2 | A3:2 G3:2 | F#3:4',
        counter: 'A4:4 | B4:4 | G4:4 | A4:4 | F#4:4 | F#4:4 | E4:4 | C#4:4',
        level: 0.95,
      },
      {
        bars: 'F#m | G | F#m | F#m',
        parts: ['pad', 'arp', 'lead'],
        lead: 'F#3:2 C#4:2 | D4:4 | C#4:4 | F#3:4',
        level: 0.65,
      },
    ],
  });
}

function mistwrack(): Song {
  return calmPiece({
    name: 'mistwrack',
    bpm: 72,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: marimba, lead: clarinet, counter: inRole(flute, 'lead') },
    chords: {
      'F#m': { bass: 'F#1', pad: 'C#3 F#3 A3', arp: 'F#3 A3 C#4 E4' },
      'D': { bass: 'D2', pad: 'D3 F#3 A3', arp: 'D3 A3 E4 F#4' },
      'A': { bass: 'A1', pad: 'C#3 E3 A3', arp: 'A2 E3 A3 C#4' },
      'E': { bass: 'E2', pad: 'E3 G#3 B3', arp: 'E3 B3 E4 G#4' },
      'Bm': { bass: 'B1', pad: 'D3 F#3 B3', arp: 'B2 F#3 B3 D4' },
      'C#m': { bass: 'C#2', pad: 'E3 G#3 C#4', arp: 'C#3 G#3 C#4 E4' },
    },
    arp: {
      step: 0.25,
      order: [0, 1, 2, 0, 1, 2, 3, 1],
      velocity: [62, 34, 42, 56, 34, 42, 52, 36],
    },
    bass: { step: null, velocity: [70] },
    kit: {
      keys: { log: 45, deep: 36 },
      drums: DRUMS,
      bar: [
        ['deep', 0, 58],
        ['log', 0, 52],
        ['log', 0.75, 36],
        ['log', 1.5, 44],
        ['log', 3, 40],
      ],
    },
    sections: [
      { bars: 'F#m | D | F#m | E', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'F#m | D | A | C#m | F#m | D | Bm | C#m',
        parts: ['pad', 'arp', 'bass', 'lead', 'drums'],
        lead: 'F#3:1.5 G#3:.5 A3:2 | F#3:3 A3:1 | C#4:2 B3:1 A3:1 | G#3:4 | A3:1.5 B3:.5 C#4:2 | D4:2 C#4:1 A3:1 | B3:1.5 A3:.5 F#3:2 | G#3:4',
        level: 0.9,
      },
      {
        bars: 'D | E | A | F#m | A | E | D | F#m',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead'],
        counter: 'A4:2 C#5:2 | B4:4 | A4:2 E4:2 | F#4:4 | E4:1.5 F#4:.5 A4:2 | G#4:4 | F#4:2 E4:2 | F#4:4',
        lead: 'D3:4 | E3:4 | E3:4 | F#3:4 | E3:4 | E3:4 | D3:4 | F#3:4',
      },
      {
        bars: 'F#m | D | A | C#m | F#m | D | Bm | C#m',
        parts: ['pad', 'arp', 'bass', 'lead', 'drums'],
        lead: 'F#3:1.5 G#3:.5 A3:2 | F#3:3 A3:1 | C#4:2 B3:1 A3:1 | G#3:4 | A3:1.5 B3:.5 C#4:2 | D4:2 C#4:1 A3:1 | B3:1.5 A3:.5 F#3:2 | G#3:4',
      },
      {
        bars: 'F#m | D | C#m | F#m',
        parts: ['pad', 'arp', 'lead'],
        lead: 'F#3:3 C#4:1 | D4:4 | C#4:4 | F#3:4',
        level: 0.65,
      },
    ],
  });
}

function fen(): Song {
  return calmPiece({
    name: 'fen',
    bpm: 60,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: kalimba, lead: bassoon, counter: inRole(cello, 'lead') },
    chords: {
      'C#m': { bass: 'C#2', pad: 'E3 G#3 C#4', arp: 'G#4 C#5 E4 B4' },
      'A': { bass: 'A1', pad: 'E3 A3 C#4', arp: 'A4 E4 C#5 B4' },
      'E': { bass: 'E2', pad: 'E3 G#3 B3', arp: 'B4 E4 G#4 F#4' },
      'B': { bass: 'B1', pad: 'D#3 F#3 B3', arp: 'B4 F#4 D#4 C#5' },
      'F#m': { bass: 'F#2', pad: 'F#3 A3 C#4', arp: 'C#5 F#4 A4 E4' },
      'G#m': { bass: 'G#1', pad: 'D#3 G#3 B3', arp: 'G#4 D#4 B4 F#4' },
    },
    arp: { step: 0.75, order: [1, 3, 0, 2], velocity: [44, 28, 36, 24] },
    bass: { step: null, velocity: [66] },
    kit: {
      keys: { deep: 36 },
      drums: DRUMS,
      bar: [
        ['deep', 0, 46],
        ['deep', 0.75, 28],
      ],
    },
    sections: [
      { bars: 'C#m | A | C#m | A', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'C#m | A | E | B | C#m | F#m | E | G#m',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'C#3:2 E3:1 G#3:1 | A3:3 r:1 | G#3:1.5 F#3:.5 E3:2 | D#3:4 | E3:1.5 F#3:.5 G#3:2 | A3:2 C#4:2 | B3:1.5 A3:.5 F#3:2 | G#3:4',
      },
      {
        bars: 'E | B | F#m | C#m | A | E | B | C#m',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter: 'E3:2 G#3:2 | F#3:2 D#3:2 | A3:3 F#3:1 | G#3:4 | A3:2 C#4:2 | B3:2 G#3:2 | F#3:2 D#3:2 | E3:4',
        level: 0.9,
      },
      {
        bars: 'C#m | A | E | B | C#m | F#m | E | G#m',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: 'C#3:2 E3:1 G#3:1 | A3:3 r:1 | G#3:1.5 F#3:.5 E3:2 | D#3:4 | E3:1.5 F#3:.5 G#3:2 | A3:2 C#4:2 | B3:1.5 A3:.5 F#3:2 | G#3:4',
        counter: 'G#3:4 | E3:4 | B3:4 | F#3:4 | E3:4 | C#4:4 | B3:4 | B3:4',
      },
      {
        bars: 'C#m | A | G#m | C#m',
        parts: ['pad', 'arp', 'lead'],
        lead: 'C#3:2 G#3:2 | A3:4 | G#3:4 | C#3:4',
        level: 0.65,
      },
    ],
  });
}

function rime(): Song {
  return calmPiece({
    name: 'rime',
    bpm: 64,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: piano, lead: horn, counter: inRole(cello, 'lead') },
    chords: {
      'Bm': { bass: 'B1', pad: 'B2 F#3 C#4', arp: 'B2 F#3 C#4 D4' },
      'G': { bass: 'G1', pad: 'G2 D3 A3', arp: 'G2 D3 A3 B3' },
      'D': { bass: 'D2', pad: 'A2 D3 A3', arp: 'D3 A3 E4 F#4' },
      'A': { bass: 'A1', pad: 'A2 E3 B3', arp: 'A2 E3 B3 C#4' },
      'Em': { bass: 'E2', pad: 'B2 E3 B3', arp: 'E3 B3 D4 G4' },
      'F#': { bass: 'F#2', pad: 'C#3 F#3 A#3', arp: 'F#2 C#3 A#3 C#4' },
    },
    arp: { step: 1, order: [0, 2, 1, 3], velocity: [52, 34, 40, 30] },
    bass: { step: null, velocity: [68] },
    kit: { keys: { taiko: 41 }, drums: DRUMS, bar: [['taiko', 0, 62]] },
    sections: [
      { bars: 'Bm | G | Bm | G', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Bm | G | D | A | Bm | Em | Em | F#',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'B3:2 F#4:2 | D4:3 r:1 | A3:2 D4:2 | E4:4 | F#4:1.5 E4:.5 D4:2 | B3:4 | E4:2 G4:2 | F#4:4',
      },
      {
        bars: 'G | D | A | Bm | G | D | Em | F#',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead', 'drums'],
        counter: 'G3:2 B3:2 | A3:2 F#3:2 | E3:2 C#4:2 | D4:4 | B3:2 G3:2 | F#3:2 A3:2 | G3:1.5 F#3:.5 E3:2 | F#3:4',
        lead: 'D4:4 | D4:4 | C#4:4 | B3:4 | D4:4 | D4:4 | B3:4 | A#3:4',
        level: 0.9,
      },
      {
        bars: 'Bm | G | D | A | Bm | Em | Em | F#',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: 'B3:2 F#4:2 | D4:3 r:1 | A3:2 D4:2 | E4:4 | F#4:1.5 E4:.5 D4:2 | B3:4 | E4:2 G4:2 | F#4:4',
        counter: 'B2:4 | G2:4 | A2:4 | C#3:4 | D3:4 | B2:4 | G2:4 | F#2:4',
      },
      {
        bars: 'Bm | G | F# | Bm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'B3:2 F#4:2 | G4:4 | F#4:4 | B3:4',
        level: 0.65,
      },
    ],
  });
}

function whiteout(): Song {
  return calmPiece({
    name: 'whiteout',
    bpm: 56,
    beatsPerBar: 4,
    tracks: { pad: strings, bass, arp: piano, lead: cello, counter: inRole(flute, 'lead') },
    chords: {
      Bm: { bass: 'B1', pad: 'F#3 B3 D4', arp: 'B2 F#3 C4 D4' },
      C: { bass: 'C2', pad: 'E3 G3 C4', arp: 'C3 G3 B3 E4' },
      Am: { bass: 'A1', pad: 'E3 A3 C4', arp: 'A2 E3 A3 C4' },
      G: { bass: 'G1', pad: 'D3 G3 B3', arp: 'G2 D3 G3 B3' },
      Em: { bass: 'E2', pad: 'E3 G3 B3', arp: 'E3 B3 D4 G4' },
      D: { bass: 'D2', pad: 'D3 F#3 A3', arp: 'D3 A3 D4 F#4' },
    },
    arp: { step: 2, order: [0, 2, 1, 3], velocity: [46, 32, 38, 28] },
    bass: { step: null, velocity: [64] },
    kit: { keys: { deep: 36 }, drums: DRUMS, bar: [] },
    sections: [
      { bars: 'Bm | C | Bm | C', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Bm | C | Am | G | Em | Bm | C | Bm',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'B3:3 D4:1 | C4:2 E4:2 | C4:1.5 B3:.5 A3:2 | G3:2 B3:2 | E3:2 G3:1 B3:1 | F#3:4 | G3:2 E3:2 | B2:4',
      },
      {
        bars: 'G | D | Em | Bm | C | Am | C | Bm',
        parts: ['pad', 'arp', 'bass', 'counter'],
        counter: 'G4:2 D4:2 | A4:2 F#4:2 | G4:2 E4:2 | F#4:4 | E4:2 G4:2 | E4:2 C4:2 | G4:1.5 E4:.5 C4:2 | D4:4',
        level: 0.85,
      },
      {
        bars: 'Bm | C | Am | G | Em | Bm | C | Bm',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter'],
        lead: 'B3:3 D4:1 | C4:2 E4:2 | C4:1.5 B3:.5 A3:2 | G3:2 B3:2 | E3:2 G3:1 B3:1 | F#3:4 | G3:2 E3:2 | B2:4',
        counter: 'F#4:4 | G4:4 | E4:4 | D4:4 | G4:4 | D4:4 | E4:4 | D4:4',
      },
      {
        bars: 'Bm | Em | Bm | Bm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'B2:3 F#3:1 | G3:4 | F#3:4 | B2:4',
        level: 0.65,
      },
    ],
  });
}

/** Each family's calm pieces, these two and the two of islandPiecesMore.ts, one at a time, never the same twice
 *  running. */
export const islandPieces = (): Readonly<Record<Family, readonly Song[]>> => {
  const more = moreIslandPieces();
  return {
    green: [moorlight(), cairn(), ...more.green],
    dry: [sunscorch(), dustRoad(), ...more.dry],
    wet: [mistwrack(), fen(), ...more.wet],
    cold: [rime(), whiteout(), ...more.cold],
  };
};
