// The islands' second pair of calm pieces for each family, heard with the first pair (islandPieces.ts), each in a key,
// metre, tempo, lead, chord plan and opening of its own, weathered and never bright, closing on the world's leitmotif.
// Green: Bracken, A Dorian in 9/8 at 84, a slip jig on the fiddle over plucked strings; Barrow, D Aeolian in 3/2 at 72,
// a sarabande on the cello over a slow harp. Dry, each with its flat second and major third: Mirage, D Phrygian
// dominant in 7/8 (two, two, three) at 80, a low flute over the oud; Caravan, E Phrygian dominant in 3/4 at 63, a low
// clarinet over plucked strings, the horn answering. Wet: Mangrove, C Aeolian in 6/8 at 70, a low flute over the
// marimba, the bassoon under it; Peat, A Aeolian in 5/4 at 64, the oboe over a kalimba. Cold: Floe, F Aeolian in 3/4 at
// 60, a flute over the harp's open fifths; Polar Night, G Aeolian in 5/4 at 66, a fiddle over plucked strings.

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
    'E4:.5 A4:.5 A4:.5 B4:.5 A4:.5 G4:.5 A4:1.5 | D4:.5 G4:.5 G4:.5 B4:1 A4:.5 G4:1.5 | E4:.5 A4:.5 B4:.5 C5:1 B4:.5 A4:1.5' +
    ' | F#4:1 E4:.5 D4:1.5 A3:1.5 | G4:.5 E4:.5 G4:.5 C5:1.5 B4:.5 A4:.5 G4:.5 | D5:1 B4:.5 G4:1.5 B4:1.5' +
    ' | C5:.5 B4:.5 A4:.5 E4:1 G4:.5 A4:1.5 | B4:3 G4:1.5';
  return calmPiece({
    name: 'bracken',
    bpm: 84,
    beatsPerBar: 4.5,
    tracks: { pad, bass, arp: pizzicato, lead: fiddle, counter: inRole(cello, 'lead') },
    chords: {
      Am: { bass: 'A1', pad: 'A3 C4 E4', arp: 'A2 E3 A3 C4' },
      G: { bass: 'G1', pad: 'G3 B3 D4', arp: 'G2 D3 G3 B3' },
      D: { bass: 'D2', pad: 'F#3 A3 D4', arp: 'D3 A3 D4 F#4' },
      C: { bass: 'C2', pad: 'G3 C4 E4', arp: 'C3 G3 C4 E4' },
      Em: { bass: 'E2', pad: 'G3 B3 E4', arp: 'E3 B3 E4 G4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F2 C3 A3 C4' },
    },
    // Three groups of three eighths: the slip jig's lean on each group's first.
    arp: { step: 0.5, order: [0, 1, 2, 3, 2, 1, 2, 3, 1], velocity: [58, 30, 36, 50, 30, 36, 50, 30, 34] },
    bass: { step: 1.5, velocity: [72, 48, 56] },
    kit: {
      keys: { frame: 41, tap: 45 },
      drums: DRUMS,
      bar: [
        ['frame', 0, 50],
        ['tap', 1.5, 28],
        ['frame', 3, 40],
        ['tap', 4, 24],
      ],
    },
    sections: [
      { bars: 'Am | G | Am | G', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Am | G | Am | D | C | G | Am | Em', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'F | C | G | D | F | C | Em | Em',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead'],
        counter:
          'A3:1.5 C4:1.5 F3:1.5 | G3:3 E3:1.5 | D3:1.5 G3:1.5 B3:1.5 | A3:3 F#3:1.5 | F3:1.5 A3:1.5 C4:1.5 | E3:3 G3:1.5' +
          ' | B3:1.5 G3:1.5 E3:1.5 | E3:4.5',
        lead: 'C5:4.5 | E4:4.5 | D5:4.5 | F#4:4.5 | A4:4.5 | G4:4.5 | G4:4.5 | E4:4.5',
        level: 0.9,
      },
      {
        bars: 'Am | G | Am | D | C | G | Am | Em',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'A3:4.5 | B3:4.5 | C4:4.5 | A3:4.5 | E3:4.5 | D3:4.5 | E3:4.5 | E3:4.5',
      },
      {
        bars: 'Am | F | Em | Am',
        parts: ['pad', 'arp', 'lead'],
        lead: 'A3:3 E4:1.5 | F4:4.5 | E4:4.5 | A3:4.5',
        level: 0.65,
      },
    ],
  });
}

function barrow(): Song {
  return calmPiece({
    name: 'barrow',
    bpm: 72,
    beatsPerBar: 6,
    tracks: { pad: strings, bass, arp: harp, lead: cello, counter: inRole(flute, 'lead') },
    chords: {
      Dm: { bass: 'D2', pad: 'F3 A3 D4', arp: 'D3 A3 D4 F4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F2 C3 A3 C4' },
      Gm: { bass: 'G2', pad: 'G3 Bb3 D4', arp: 'G2 D3 G3 Bb3' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 Bb3 D4' },
      C: { bass: 'C2', pad: 'G3 C4 E4', arp: 'C3 G3 C4 E4' },
      A: { bass: 'A1', pad: 'A3 C#4 E4', arp: 'A2 E3 A3 C#4' },
      Am: { bass: 'A1', pad: 'A3 C4 E4', arp: 'A2 E3 A3 C4' },
    },
    // Three half notes a bar, the sarabande's weight on the second.
    arp: { step: 1, order: [0, 2, 3, 1, 2, 3], velocity: [50, 30, 44, 30, 34, 28] },
    bass: { step: 2, velocity: [64, 52, 44] },
    kit: {
      keys: { deep: 36 },
      drums: DRUMS,
      bar: [
        ['deep', 0, 40],
        ['deep', 2, 30],
      ],
    },
    sections: [
      { bars: 'Dm | Gm | Dm | A', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Dm | F | Gm | F | Bb | Gm | C | A',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'A3:2 D4:3 C4:1 | A3:2 C4:3 A3:1 | Bb3:2 D4:3 Bb3:1 | A3:4 F3:2 | F3:2 Bb3:3 C4:1 | Bb3:2 D4:2 G3:2 | E3:2 G3:3 F3:1 | E3:6',
      },
      {
        bars: 'Bb | C | Dm | Am | Gm | Bb | C | A',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter:
          'D5:2 C5:3 Bb4:1 | G4:2 E4:3 C4:1 | F4:2 A4:3 D5:1 | C5:2 E4:4 | D4:2 G4:3 A4:1 | Bb4:2 D5:3 F4:1 | E4:2 G4:3 C5:1 | C#5:6',
      },
      {
        bars: 'Dm | Bb | Am | Dm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'D3:3 A3:3 | Bb3:6 | A3:6 | D3:6',
        level: 0.65,
      },
    ],
  });
}

function mirage(): Song {
  const tune =
    'A4:1.5 D4:1 F#4:1 | G4:1 Bb4:1 A4:1.5 | G4:1 C4:1 Eb4:1.5 | D4:1 Eb4:.5 F#4:2 | G4:1 Bb4:1 Eb5:1.5 | D5:1 C5:1 G4:1.5' +
    ' | Bb4:1 A4:1 G4:.5 F#4:1 | D4:3.5';
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
    // Seven eighths, two, two and three: the oud leans on the first of each.
    arp: { step: 0.5, order: [0, 1, 2, 1, 3, 1, 2], velocity: [70, 40, 60, 40, 62, 38, 44] },
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
      { bars: 'D | Cm | Eb | D', parts: ['pad', 'arp', 'bass'], level: 0.75 },
      { bars: 'D | Gm | Cm | D | Eb | Cm | Gm | D', parts: ['pad', 'arp', 'bass', 'lead', 'drums'], lead: tune },
      {
        bars: 'Cm | Bb | Eb | D | Gm | Eb | Cm | D',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter'],
        counter:
          'C4:2 Eb4:1.5 | D4:2 Bb3:1.5 | Eb4:2 G3:1.5 | F#3:3.5 | G3:2 Bb3:1.5 | G3:2 Eb3:1.5 | Eb3:2 C3:1.5 | D3:3.5',
        lead: 'r:2 Eb5:1.5 | D5:3.5 | Bb4:3.5 | F#4:3.5 | r:2 D5:1.5 | Eb5:3.5 | G4:3.5 | F#4:3.5',
        level: 0.9,
      },
      { bars: 'Gm | D | Gm | D', parts: ['pad', 'arp', 'drums'], level: 0.7 },
      {
        bars: 'D | Gm | Cm | D | Eb | Cm | Gm | D',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'D3:3.5 | G3:3.5 | G3:3.5 | F#3:3.5 | G3:3.5 | G3:3.5 | Bb3:3.5 | A3:3.5',
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
    'E3:1 G#3:1 B3:1 | F3:1 A3:1 D4:1 | C4:2 A3:1 | G#3:1 F3:1 E3:1 | E4:1.5 C4:.5 A3:1 | B3:1 D4:1 G3:1' +
    ' | F3:1.5 C4:.5 A3:1 | E3:3';
  return calmPiece({
    name: 'caravan',
    bpm: 63,
    beatsPerBar: 3,
    tracks: { pad, bass, arp: pizzicato, lead: clarinet, counter: horn },
    chords: {
      E: { bass: 'E2', pad: 'G#3 B3 E4', arp: 'E3 B3 E4 G#4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F2 C3 A3 C4' },
      Dm: { bass: 'D2', pad: 'F3 A3 D4', arp: 'D3 A3 D4 F4' },
      Am: { bass: 'A1', pad: 'A3 C4 E4', arp: 'A2 E3 A3 C4' },
      G: { bass: 'G2', pad: 'G3 B3 D4', arp: 'G2 D3 G3 B3' },
    },
    arp: { step: 0.5, order: [0, 2, 1, 3, 2, 1], velocity: [54, 32, 42, 36, 44, 30] },
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
      { bars: 'E | F | E | F', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'E | Dm | F | E | Am | G | F | E', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'Am | F | G | E | Dm | Am | F | E',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead'],
        counter: 'A3:2 C4:1 | A3:2 F3:1 | G3:1 B3:1 D4:1 | E4:3 | D4:2 F4:1 | E4:2 C4:1 | C4:1.5 A3:1.5 | G#3:3',
        lead: 'C4:3 | C4:3 | B3:3 | G#3:3 | F3:3 | E4:3 | A3:3 | G#3:3',
        level: 0.9,
      },
      {
        bars: 'E | Dm | F | E | Am | G | F | E',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'E4:3 | D4:3 | C4:3 | B3:3 | C4:3 | D4:3 | C4:3 | B3:3',
      },
      {
        bars: 'E | Am | E | E',
        parts: ['pad', 'arp', 'lead'],
        lead: 'E3:1.5 B3:1.5 | C4:3 | B3:3 | E3:3',
        level: 0.65,
      },
    ],
  });
}

function mangrove(): Song {
  const tune =
    'G4:1.5 Eb4:1 D4:.5 | D4:1 F4:.5 Bb4:1.5 | C5:1.5 Ab4:1 G4:.5 | F4:3 | Eb4:1 C5:.5 Bb4:1 G4:.5 | Ab4:1.5 F4:1.5' +
    ' | D4:1 G4:.5 B4:1.5 | C5:3';
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
      { bars: 'Cm | Bb | Cm | Bb', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Cm | Bb | Ab | Bb | Cm | Fm | G | Cm', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'Fm | Eb | Ab | G | Fm | Cm | Ab | G',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter:
          'Ab3:1.5 C4:1.5 | G3:1.5 Bb3:1.5 | Ab3:1 C4:.5 Eb4:1.5 | D4:3 | C4:1.5 Ab3:1.5 | G3:1 Eb3:.5 C3:1.5 | Eb3:1.5 Ab3:1.5 | B3:3',
        level: 0.9,
      },
      { bars: 'Cm | Ab | Cm | Bb', parts: ['pad', 'arp', 'drums'], level: 0.7 },
      {
        bars: 'Cm | Bb | Ab | Bb | Cm | Fm | G | Cm',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'Eb3:3 | D3:3 | C3:3 | D3:3 | Eb3:3 | F3:3 | D3:3 | Eb3:3',
      },
      {
        bars: 'Cm | Fm | Cm | Cm',
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
      Dm: { bass: 'D2', pad: 'F3 A3 D4', arp: 'D4 F4 A4 C5' },
      F: { bass: 'F1', pad: 'F3 A3 C4', arp: 'F4 A4 C5 E4' },
      C: { bass: 'C2', pad: 'G3 C4 E4', arp: 'C4 G4 E4 B4' },
      G: { bass: 'G1', pad: 'G3 B3 D4', arp: 'G4 B4 D5 D4' },
      Em: { bass: 'E2', pad: 'E3 G3 B3', arp: 'E4 G4 B4 D5' },
      E: { bass: 'E2', pad: 'E3 G#3 B3', arp: 'E4 G#4 B4 D5' },
    },
    // Five beats, three and two: the kalimba leans on the first of each.
    arp: { step: 1, order: [0, 2, 1, 3, 1], velocity: [42, 24, 30, 36, 24] },
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
      { bars: 'Am | Dm | Am | E', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Am | Dm | Am | F | C | G | Dm | E',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'C5:2 B4:1 A4:2 | F4:3 A4:2 | E5:2 D5:1 C5:2 | A4:3 F4:2 | G4:2 E4:1 G4:2 | B4:3 D5:2 | D5:2 C5:1 A4:2 | G#4:5',
      },
      {
        bars: 'F | G | Em | Am | Dm | G | C | E',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        counter: 'A3:3 C4:2 | B3:3 D4:2 | G3:3 B3:2 | A3:3 E3:2 | F3:3 A3:2 | D3:3 G3:2 | E3:3 G3:2 | G#3:5',
        lead: 'A4:5 | D5:5 | G4:5 | C5:5 | A4:5 | B4:5 | E5:5 | B4:5',
        level: 0.9,
      },
      { bars: 'Am | F | Em | Am', parts: ['pad', 'arp', 'lead'], lead: 'A4:3 E5:2 | F5:5 | E5:5 | A4:5', level: 0.65 },
    ],
  });
}

function floe(): Song {
  const tune =
    'C5:2 Ab4:1 | C5:1 Eb5:1 Ab4:1 | Bb4:3 | Bb4:1 C5:.5 Db5:1.5 | F4:1 G4:1 Ab4:1 | F4:2 Ab4:1 | G4:1.5 Bb4:.5 Eb5:1 | C5:3';
  return calmPiece({
    name: 'floe',
    bpm: 60,
    beatsPerBar: 3,
    tracks: { pad, bass, arp: harp, lead: flute, counter: horn },
    chords: {
      Fm: { bass: 'F1', pad: 'C3 F3 C4', arp: 'F2 C3 G3 Ab3' },
      Ab: { bass: 'Ab1', pad: 'Eb3 Ab3 Eb4', arp: 'Ab2 Eb3 Bb3 C4' },
      Eb: { bass: 'Eb2', pad: 'Bb2 Eb3 Bb3', arp: 'Eb3 Bb3 F4 G4' },
      Bbm: { bass: 'Bb1', pad: 'F3 Bb3 F4', arp: 'Bb2 F3 C4 Db4' },
      Db: { bass: 'Db2', pad: 'Ab2 Db3 Ab3', arp: 'Db3 Ab3 Eb4 F4' },
      C: { bass: 'C2', pad: 'G2 C3 G3', arp: 'C3 G3 D4 E4' },
      Cm: { bass: 'C2', pad: 'G2 C3 G3', arp: 'C3 G3 D4 Eb4' },
    },
    arp: { step: 1, order: [0, 1, 3], velocity: [44, 30, 34] },
    bass: { step: null, velocity: [62] },
    kit: { keys: { frame: 41 }, drums: DRUMS, bar: [['frame', 0, 40]] },
    sections: [
      { bars: 'Fm | Eb | Fm | Eb', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Fm | Ab | Eb | Bbm | Fm | Db | Eb | Fm', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'Db | Ab | Bbm | C | Db | Eb | Cm | C',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter: 'F4:2 Db4:1 | Eb4:2 C4:1 | Db4:2 F4:1 | E4:3 | F4:1 Ab4:1 F4:1 | G4:2 Eb4:1 | Eb4:2 G4:1 | E4:3',
        level: 0.85,
      },
      {
        bars: 'Fm | Ab | Eb | Bbm | Fm | Db | Eb | Fm',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'Ab3:3 | C4:3 | G3:3 | F3:3 | Ab3:3 | Ab3:3 | G3:3 | Ab3:3',
      },
      {
        bars: 'Fm | Db | Cm | Fm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'F4:1.5 C5:1.5 | Db5:3 | C5:3 | F4:3',
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
      Gm: { bass: 'G1', pad: 'D3 G3 D4', arp: 'G2 D3 G3 Bb3' },
      Eb: { bass: 'Eb2', pad: 'Bb2 Eb3 G3', arp: 'Eb3 Bb3 Eb4 G4' },
      Dm: { bass: 'D2', pad: 'A2 D3 A3', arp: 'D3 A3 D4 F4' },
      Cm: { bass: 'C2', pad: 'G2 C3 G3', arp: 'C3 G3 C4 Eb4' },
      Bb: { bass: 'Bb1', pad: 'F2 Bb2 F3', arp: 'Bb2 F3 Bb3 D4' },
      D: { bass: 'D2', pad: 'A2 D3 F#3', arp: 'D3 A3 D4 F#4' },
    },
    // Ten eighths, three beats and two: the plucked strings lean where the bass does.
    arp: { step: 0.5, order: [0, 1, 2, 1, 3, 1, 0, 2, 3, 2], velocity: [56, 30, 36, 30, 38, 30, 48, 30, 36, 30] },
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
      { bars: 'Gm | Dm | Gm | Dm', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Gm | Eb | Gm | Dm | Cm | Bb | Eb | D',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'D4:2 Bb3:2 A3:1 | G3:3 Bb3:2 | D4:3 C4:1 Bb3:1 | A3:3 D4:2 | G4:2 Eb4:3 | F4:3 D4:2 | Bb4:2 G4:1 Eb4:2 | A4:5',
      },
      {
        bars: 'Cm | Gm | Eb | Bb | Cm | Dm | Eb | D',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        counter: 'G3:3 Eb3:2 | D3:3 G3:2 | G3:3 Bb3:2 | F3:3 D3:2 | Eb3:3 G3:2 | F3:3 A3:2 | G3:3 Eb3:2 | F#3:5',
        lead: 'Eb4:5 | D4:5 | Bb3:5 | D4:5 | G4:5 | F4:5 | G4:5 | F#4:5',
        level: 0.9,
      },
      {
        bars: 'Gm | Eb | Dm | Gm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'G3:3 D4:2 | Eb4:5 | D4:5 | G3:5',
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
