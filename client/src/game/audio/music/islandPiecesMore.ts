// The islands' second pair of calm pieces for each family, heard with the first pair (islandPieces.ts), each in its own
// key, metre, tempo and lead, weathered and never bright, each closing on the world's leitmotif in its key. Green:
// Bracken, A Dorian at 72, a fiddle over plucked strings and a pulsing bass; Barrow, D Aeolian in 3/4 at 58, the cello
// over a slow harp. Dry: Mirage, D Phrygian dominant in 7/8 (two, two, three) at 80, a low flute over the oud;
// Caravan, G harmonic minor in 3/4 at 63, a low clarinet over plucked strings, the horn answering. Wet: Mangrove,
// C Aeolian in 6/8 at 70, a low flute over the marimba, the bassoon under it; Peat, A Aeolian in 5/4 at 64, the oboe
// over a kalimba dripping. Cold: Floe, E Aeolian in 3/4 at 60, a flute over the harp and open fifths; Polar Night,
// C sharp Aeolian in 5/4 at 66, a fiddle over plucked strings, the cello low under it.

import type { Family } from './directorLaw.ts';
import { DRUMS, INSTRUMENTS, calmPiece, inRole } from './calm.ts';
import type { Song } from './score.ts';

const {
  pad,
  strings,
  bass,
  harp,
  oud,
  marimba,
  kalimba,
  pizzicato,
  cello,
  horn,
  flute,
  oboe,
  clarinet,
  bassoon,
  fiddle,
} = INSTRUMENTS;

function bracken(): Song {
  const tune =
    'A3:1 C4:1 E4:1.5 D4:.5 | F#4:3 E4:1 | E4:1 D4:1 C4:1.5 B3:.5 | B3:2 D4:2 | E4:1.5 G4:.5 E4:1 C4:1 | D4:3 B3:1 | A3:1 B3:1 D4:1 F#4:1 | E4:4';
  return calmPiece({
    name: 'bracken',
    bpm: 72,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: pizzicato, lead: fiddle, counter: inRole(cello, 'lead') },
    chords: {
      Am: { bass: 'A1', pad: 'A3 C4 E4', arp: 'A2 E3 C4 E4' },
      D: { bass: 'D2', pad: 'F#3 A3 D4', arp: 'D3 A3 D4 F#4' },
      G: { bass: 'G2', pad: 'G3 B3 D4', arp: 'G2 D3 B3 D4' },
      C: { bass: 'C2', pad: 'G3 C4 E4', arp: 'C3 G3 C4 E4' },
      Em: { bass: 'E2', pad: 'G3 B3 E4', arp: 'E3 B3 E4 G4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F2 C3 A3 C4' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 3, 2, 1, 2, 1], velocity: [56, 34, 44, 38, 46, 34, 42, 34] },
    bass: { step: 1, velocity: [72, 44, 60, 44] },
    kit: {
      keys: { frame: 41, tap: 45 },
      drums: DRUMS,
      bar: [
        ['frame', 0, 50],
        ['tap', 2.5, 30],
        ['frame', 3, 36],
      ],
    },
    sections: [
      { bars: 'Am | D | Am | D', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Am | D | Am | G | C | G | D | Em', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'C | G | D | Am | C | G | F | Em',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead'],
        counter: 'C3:2 E3:2 | D3:2 B2:2 | F#3:2 A3:2 | A3:4 | G3:2 E3:2 | D3:2 G3:2 | A3:2 F3:2 | E3:4',
        lead: 'E4:4 | D4:4 | D4:4 | C4:4 | E4:4 | D4:4 | C4:4 | B3:4',
        level: 0.9,
      },
      {
        bars: 'Am | D | Am | G | C | G | D | Em',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'A2:4 | F#2:4 | A2:4 | G2:4 | C3:4 | B2:4 | D3:4 | E3:4',
      },
      { bars: 'Am | F | Em | Am', parts: ['pad', 'arp', 'lead'], lead: 'A3:2 E4:2 | F4:4 | E4:4 | A3:4', level: 0.65 },
    ],
  });
}

function barrow(): Song {
  const tune =
    'D3:2 F3:1 | Bb3:2 A3:1 | A3:1.5 G3:.5 F3:1 | E3:3 | D3:1 F3:1 A3:1 | D4:2 C4:1 | Bb3:1.5 A3:.5 G3:1 | A3:3';
  return calmPiece({
    name: 'barrow',
    bpm: 58,
    beatsPerBar: 3,
    tracks: { pad: strings, bass, arp: harp, lead: cello, counter: inRole(flute, 'lead') },
    chords: {
      Dm: { bass: 'D2', pad: 'F3 A3 D4', arp: 'D3 A3 D4 F4' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 Bb3 D4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F2 C3 A3 C4' },
      C: { bass: 'C2', pad: 'G3 C4 E4', arp: 'C3 G3 C4 E4' },
      Gm: { bass: 'G2', pad: 'G3 Bb3 D4', arp: 'G2 D3 G3 Bb3' },
      A: { bass: 'A1', pad: 'A3 C#4 E4', arp: 'A2 E3 A3 C#4' },
      Am: { bass: 'A1', pad: 'A3 C4 E4', arp: 'A2 E3 A3 C4' },
    },
    arp: { step: 1, order: [0, 2, 3], velocity: [48, 32, 36] },
    bass: { step: null, velocity: [64] },
    kit: { keys: { deep: 36 }, drums: DRUMS, bar: [['deep', 0, 40]] },
    sections: [
      { bars: 'Dm | Bb | Dm | C', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Dm | Bb | F | C | Dm | Gm | Bb | A', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'Bb | F | C | Dm | Gm | Dm | Bb | A',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter: 'D5:2 C5:1 | A4:3 | G4:2 E4:1 | F4:3 | Bb4:2 A4:1 | F4:2 D4:1 | D4:1.5 E4:.5 F4:1 | E4:3',
        level: 0.85,
      },
      {
        bars: 'Dm | Bb | F | C | Dm | Gm | Bb | A',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'F4:3 | D4:3 | C4:3 | E4:3 | F4:3 | Bb4:3 | F4:3 | E4:3',
      },
      {
        bars: 'Dm | Bb | Am | Dm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'D3:1.5 A3:1.5 | Bb3:3 | A3:3 | D3:3',
        level: 0.65,
      },
    ],
  });
}

function mirage(): Song {
  const tune =
    'D4:1 Eb4:1 F#4:1.5 | G4:1 F#4:.5 Eb4:2 | D4:1.5 A4:2 | G4:1 F#4:.5 Eb4:1 C4:1 | D4:1 G4:1 Bb4:1.5 | A4:1 G4:1 F#4:.5 Eb4:1 | F#4:2 Eb4:.5 D4:1 | D4:3.5';
  return calmPiece({
    name: 'mirage',
    bpm: 80,
    beatsPerBar: 3.5,
    tracks: { pad, bass, arp: oud, lead: flute, counter: inRole(cello, 'lead') },
    chords: {
      D: { bass: 'D2', pad: 'F#3 A3 D4', arp: 'D3 A3 Eb4 F#4' },
      Eb: { bass: 'Eb2', pad: 'G3 Bb3 Eb4', arp: 'Eb3 Bb3 Eb4 G4' },
      Cm: { bass: 'C2', pad: 'G3 C4 Eb4', arp: 'C3 G3 C4 Eb4' },
      Gm: { bass: 'G2', pad: 'G3 Bb3 D4', arp: 'G2 D3 G3 Bb3' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 Bb3 D4' },
      Dsus: { bass: 'D2', pad: 'G3 A3 D4', arp: 'D3 A3 D4 G4' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 1, 3, 1, 2], velocity: [70, 42, 52, 40, 60, 44, 50] },
    bass: { step: null, velocity: [70] },
    kit: {
      keys: { frame: 41, tap: 45 },
      drums: DRUMS,
      bar: [
        ['frame', 0, 66],
        ['tap', 1, 36],
        ['frame', 2, 50],
        ['tap', 2.5, 30],
        ['tap', 3, 34],
      ],
    },
    sections: [
      { bars: 'D | Eb | D | Dsus', parts: ['pad', 'arp', 'bass'], level: 0.75 },
      { bars: 'D | Eb | D | Cm | Gm | Eb | D | D', parts: ['pad', 'arp', 'bass', 'lead', 'drums'], lead: tune },
      {
        bars: 'Gm | Cm | D | D | Gm | Eb | Cm | D',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter'],
        counter:
          'G3:2 Bb3:1.5 | C4:2 Eb4:1.5 | D4:3.5 | A3:2 F#3:1.5 | G3:2 D3:1.5 | Eb3:2 G3:1.5 | C3:2 Eb3:1.5 | D3:3.5',
        lead: 'r:2 D5:1.5 | C5:3.5 | A4:3.5 | r:3.5 | r:2 Bb4:1.5 | G4:3.5 | Eb4:3.5 | F#4:3.5',
        level: 0.9,
      },
      { bars: 'D | Eb | D | Eb', parts: ['pad', 'arp', 'drums'], level: 0.7 },
      {
        bars: 'D | Eb | D | Cm | Gm | Eb | D | D',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'D3:3.5 | Eb3:3.5 | D3:3.5 | C3:3.5 | G2:3.5 | Eb3:3.5 | A2:3.5 | D3:3.5',
      },
      {
        bars: 'D | Bb | Dsus | D',
        parts: ['pad', 'arp', 'lead'],
        lead: 'D4:2 A4:1.5 | Bb4:3.5 | A4:3.5 | D4:3.5',
        level: 0.7,
      },
    ],
  });
}

function caravan(): Song {
  const tune =
    'G3:1 Bb3:1 D4:1 | Eb4:2 D4:1 | C4:1.5 Bb3:.5 A3:1 | F#3:3 | G3:1 D4:1 G4:1 | F4:2 D4:1 | Eb4:1.5 D4:.5 C4:1 | D4:3';
  return calmPiece({
    name: 'caravan',
    bpm: 63,
    beatsPerBar: 3,
    tracks: { pad, bass, arp: pizzicato, lead: clarinet, counter: horn },
    chords: {
      Gm: { bass: 'G2', pad: 'G3 Bb3 D4', arp: 'G2 D3 G3 Bb3' },
      Cm: { bass: 'C2', pad: 'G3 C4 Eb4', arp: 'C3 G3 C4 Eb4' },
      D: { bass: 'D2', pad: 'F#3 A3 D4', arp: 'D3 A3 D4 F#4' },
      Eb: { bass: 'Eb2', pad: 'G3 Bb3 Eb4', arp: 'Eb3 Bb3 Eb4 G4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F2 C3 A3 C4' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 Bb3 D4' },
    },
    arp: { step: 0.5, order: [0, 2, 1, 3, 2, 1], velocity: [54, 34, 42, 38, 44, 32] },
    bass: { step: 1, velocity: [70, 40, 48] },
    kit: {
      keys: { deep: 36, tap: 45 },
      drums: DRUMS,
      bar: [
        ['deep', 0, 50],
        ['tap', 1, 26],
        ['tap', 2, 32],
      ],
    },
    sections: [
      { bars: 'Gm | Cm | Gm | D', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Gm | Eb | Cm | D | Gm | Bb | Eb | D', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'Cm | Gm | Eb | D | Cm | F | Bb | D',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead'],
        counter: 'Eb4:2 G4:1 | D4:3 | G4:2 Eb4:1 | F#4:3 | G4:2 Eb4:1 | F4:2 C4:1 | D4:2 Bb3:1 | A3:3',
        lead: 'C4:3 | Bb3:3 | Bb3:3 | A3:3 | C4:3 | A3:3 | Bb3:3 | F#3:3',
        level: 0.9,
      },
      {
        bars: 'Gm | Eb | Cm | D | Gm | Bb | Eb | D',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'G3:3 | G3:3 | G3:3 | F#3:3 | G3:3 | F3:3 | G3:3 | F#3:3',
      },
      {
        bars: 'Gm | Eb | D | Gm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'G3:1.5 D4:1.5 | Eb4:3 | D4:3 | G3:3',
        level: 0.65,
      },
    ],
  });
}

function mangrove(): Song {
  const tune =
    'C4:1 Eb4:.5 G4:1.5 | Ab4:1.5 G4:1.5 | G4:1 F4:.5 Eb4:1.5 | D4:3 | C4:1 Eb4:.5 G4:1 Bb4:.5 | Ab4:1.5 F4:1.5 | Eb4:1 D4:.5 C4:1.5 | D4:3';
  return calmPiece({
    name: 'mangrove',
    bpm: 70,
    beatsPerBar: 3,
    tracks: { pad, bass, arp: marimba, lead: flute, counter: inRole(bassoon, 'lead') },
    chords: {
      Cm: { bass: 'C2', pad: 'G3 C4 Eb4', arp: 'C3 G3 C4 Eb4' },
      Ab: { bass: 'Ab1', pad: 'Ab3 C4 Eb4', arp: 'Ab2 Eb3 Ab3 C4' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 Bb3 D4' },
      Fm: { bass: 'F2', pad: 'F3 Ab3 C4', arp: 'F2 C3 F3 Ab3' },
      Eb: { bass: 'Eb2', pad: 'G3 Bb3 Eb4', arp: 'Eb3 Bb3 Eb4 G4' },
      G: { bass: 'G2', pad: 'G3 B3 D4', arp: 'G2 D3 G3 B3' },
      Gm: { bass: 'G2', pad: 'G3 Bb3 D4', arp: 'G2 D3 G3 Bb3' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 0, 1, 3], velocity: [60, 34, 42, 54, 34, 44] },
    bass: { step: null, velocity: [66] },
    kit: {
      keys: { deep: 36, log: 45 },
      drums: DRUMS,
      bar: [
        ['deep', 0, 50],
        ['log', 1, 30],
        ['log', 1.5, 38],
        ['log', 2.5, 28],
      ],
    },
    sections: [
      { bars: 'Cm | Ab | Cm | Bb', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Cm | Ab | Eb | Bb | Cm | Fm | Ab | G', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'Ab | Eb | Bb | Cm | Fm | Cm | Ab | G',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter:
          'Ab2:1.5 C3:1.5 | Bb2:3 | D3:1.5 F3:1.5 | Eb3:3 | F3:1.5 Ab3:1.5 | G3:1 Eb3:.5 C3:1.5 | C3:1.5 Eb3:1.5 | D3:3',
        level: 0.9,
      },
      { bars: 'Cm | Ab | Cm | Ab', parts: ['pad', 'arp', 'drums'], level: 0.7 },
      {
        bars: 'Cm | Ab | Eb | Bb | Cm | Fm | Ab | G',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'C3:3 | Ab2:3 | Eb3:3 | Bb2:3 | C3:3 | F2:3 | Ab2:3 | G2:3',
      },
      {
        bars: 'Cm | Ab | Gm | Cm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'C4:1.5 G4:1.5 | Ab4:3 | G4:3 | C4:3',
        level: 0.65,
      },
    ],
  });
}

function peat(): Song {
  return calmPiece({
    name: 'peat',
    bpm: 64,
    beatsPerBar: 5,
    tracks: { pad, bass, arp: kalimba, lead: oboe, counter: inRole(cello, 'lead') },
    chords: {
      Am: { bass: 'A1', pad: 'E3 A3 C4', arp: 'E4 A4 C5 B4' },
      F: { bass: 'F1', pad: 'F3 A3 C4', arp: 'F4 A4 C5 E4' },
      G: { bass: 'G1', pad: 'G3 B3 D4', arp: 'G4 B4 D5 D4' },
      Em: { bass: 'E2', pad: 'E3 G3 B3', arp: 'E4 G4 B4 D5' },
      Dm: { bass: 'D2', pad: 'F3 A3 D4', arp: 'D4 F4 A4 C5' },
      C: { bass: 'C2', pad: 'G3 C4 E4', arp: 'C4 G4 E4 B4' },
    },
    arp: { step: 1.25, order: [0, 2, 1, 3], velocity: [42, 26, 34, 24] },
    bass: { step: null, velocity: [62] },
    kit: {
      keys: { deep: 36, log: 45 },
      drums: DRUMS,
      bar: [
        ['deep', 0, 44],
        ['log', 3, 26],
      ],
    },
    sections: [
      { bars: 'Am | F | Am | F', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Am | F | C | G | Am | Dm | F | Em',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'A4:3 C5:1 B4:1 | A4:3 F4:2 | G4:2 E4:1 C4:2 | D4:3 G4:2 | A4:2 C5:1 E5:2 | D5:3 C5:1 A4:1 | C5:2 A4:1 F4:2 | E4:5',
      },
      {
        bars: 'F | C | G | Am | F | C | Dm | Em',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        counter: 'F3:3 A3:2 | G3:3 E3:2 | D3:3 B2:2 | C3:3 E3:2 | A2:3 C3:2 | E3:3 G3:2 | F3:3 D3:2 | E3:5',
        lead: 'C5:5 | E5:5 | D5:5 | C5:5 | A4:5 | G4:5 | A4:5 | B4:5',
        level: 0.9,
      },
      { bars: 'Am | F | Em | Am', parts: ['pad', 'arp', 'lead'], lead: 'A4:3 E5:2 | F5:5 | E5:5 | A4:5', level: 0.65 },
    ],
  });
}

function floe(): Song {
  const tune = 'E4:2 G4:1 | E4:3 | D4:2 G4:1 | A4:3 | B4:1.5 A4:.5 G4:1 | E4:3 | G4:1 A4:1 C5:1 | B4:3';
  return calmPiece({
    name: 'floe',
    bpm: 60,
    beatsPerBar: 3,
    tracks: { pad, bass, arp: harp, lead: flute, counter: horn },
    chords: {
      Em: { bass: 'E2', pad: 'B2 E3 B3', arp: 'E3 B3 E4 F#4' },
      C: { bass: 'C2', pad: 'G2 C3 G3', arp: 'C3 G3 D4 E4' },
      G: { bass: 'G1', pad: 'G2 D3 B3', arp: 'G2 D3 B3 D4' },
      D: { bass: 'D2', pad: 'A2 D3 A3', arp: 'D3 A3 E4 F#4' },
      Am: { bass: 'A1', pad: 'A2 E3 C4', arp: 'A2 E3 A3 C4' },
      Bm: { bass: 'B1', pad: 'B2 F#3 D4', arp: 'B2 F#3 B3 D4' },
    },
    arp: { step: 1, order: [0, 2, 3], velocity: [46, 30, 36] },
    bass: { step: null, velocity: [62] },
    kit: { keys: { frame: 41 }, drums: DRUMS, bar: [['frame', 0, 40]] },
    sections: [
      { bars: 'Em | C | Em | C', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Em | C | G | D | Em | Am | C | Bm', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'C | G | D | Em | C | G | Am | Bm',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter: 'E4:2 C4:1 | D4:3 | F#4:2 A4:1 | G4:3 | E4:2 G4:1 | B3:3 | C4:2 A3:1 | B3:3',
        level: 0.85,
      },
      {
        bars: 'Em | C | G | D | Em | Am | C | Bm',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'B3:3 | G3:3 | B3:3 | A3:3 | G3:3 | A3:3 | G3:3 | F#3:3',
      },
      {
        bars: 'Em | C | Bm | Em',
        parts: ['pad', 'arp', 'lead'],
        lead: 'E4:1.5 B4:1.5 | C5:3 | B4:3 | E4:3',
        level: 0.65,
      },
    ],
  });
}

function polarNight(): Song {
  return calmPiece({
    name: 'polar-night',
    bpm: 66,
    beatsPerBar: 5,
    tracks: { pad: strings, bass, arp: pizzicato, lead: fiddle, counter: inRole(cello, 'lead') },
    chords: {
      'C#m': { bass: 'C#2', pad: 'G#2 C#3 G#3', arp: 'C#3 G#3 C#4 E4' },
      'A': { bass: 'A1', pad: 'A2 E3 C#4', arp: 'A2 E3 A3 C#4' },
      'E': { bass: 'E2', pad: 'B2 E3 G#3', arp: 'E3 B3 E4 G#4' },
      'B': { bass: 'B1', pad: 'F#2 B2 F#3', arp: 'B2 F#3 B3 D#4' },
      'F#m': { bass: 'F#2', pad: 'F#3 A3 C#4', arp: 'F#2 C#3 F#3 A3' },
      'G#m': { bass: 'G#1', pad: 'G#2 D#3 B3', arp: 'G#2 D#3 G#3 B3' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 1, 0, 2, 3, 2, 1, 2], velocity: [54, 30, 38, 30, 46, 32, 40, 30, 34, 30] },
    bass: { step: 1, velocity: [70, 36, 44, 54, 36] },
    kit: {
      keys: { deep: 36, tap: 45 },
      drums: DRUMS,
      bar: [
        ['deep', 0, 48],
        ['tap', 3, 30],
      ],
    },
    sections: [
      { bars: 'C#m | A | C#m | A', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'C#m | A | E | B | C#m | F#m | A | G#m',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'C#4:3 E4:1 G#4:1 | A4:3 G#4:2 | E4:2 F#4:1 G#4:2 | F#4:3 D#4:2 | E4:3 G#4:1 C#5:1 | C#5:2 B4:1 A4:2 | A4:3 E4:2 | G#4:5',
      },
      {
        bars: 'A | E | B | C#m | F#m | C#m | A | G#m',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        counter: 'A2:3 C#3:2 | B2:3 G#2:2 | F#2:3 B2:2 | C#3:5 | F#2:3 A2:2 | G#2:3 E2:2 | A2:3 C#3:2 | D#3:5',
        lead: 'E4:5 | E4:5 | D#4:5 | E4:5 | F#4:5 | G#4:5 | E4:5 | D#4:5',
        level: 0.9,
      },
      {
        bars: 'C#m | A | G#m | C#m',
        parts: ['pad', 'arp', 'lead'],
        lead: 'C#4:3 G#4:2 | A4:5 | G#4:5 | C#4:5',
        level: 0.65,
      },
    ],
  });
}

/** Each family's second pair of calm pieces. */
export const moreIslandPieces = (): Readonly<Record<Family, readonly Song[]>> => ({
  green: [bracken(), barrow()],
  dry: [mirage(), caravan()],
  wet: [mangrove(), peat()],
  cold: [floe(), polarNight()],
});
