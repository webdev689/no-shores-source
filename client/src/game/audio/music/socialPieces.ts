// The social space's calm pieces: Saltmere, where players gather between voyages, under the Grey Tithe's levy. Three,
// one at a time with minutes of silence between them, none of them happy: the port's own theme turned to G Dorian,
// its climb G, A, B flat, D in a dotted step leaning on the sixth, over a harp and a pulsing bass; Lamplight, a
// nocturne in D minor on the world's leitmotif; and the Tithe, E Phrygian over low strings ticking a half step, a
// bassoon and a far taiko.

import { DRUMS, INSTRUMENTS, calmPiece, inRole } from './calm.ts';
import type { Song } from './score.ts';

const { pad, strings, bass, piano, harp, pizzicato, cello, horn, flute, bassoon, fiddle } = INSTRUMENTS;

/** Saltmere's theme, the port's own: G Dorian in 3/4 at 76, its tune on the cello, then the fiddle. */
function saltmere(): Song {
  return calmPiece({
    name: 'saltmere',
    bpm: 76,
    beatsPerBar: 3,
    tracks: { pad, bass, arp: harp, lead: cello, counter: inRole(fiddle, 'lead', 74) },
    chords: {
      Gm: { bass: 'G2', pad: 'D3 G3 Bb3 D4', arp: 'G3 D4 A4 Bb4' },
      C: { bass: 'C3', pad: 'E3 G3 C4', arp: 'C4 G4 D4 E4' },
      Dsus: { bass: 'D2', pad: 'D3 G3 A3', arp: 'D4 A4 G4 A4' },
      D: { bass: 'D2', pad: 'D3 F#3 A3 C4', arp: 'D4 A4 F#4 C5' },
      Eb: { bass: 'Eb2', pad: 'Eb3 G3 Bb3 D4', arp: 'Eb4 Bb4 D5 G4' },
      Bb: { bass: 'Bb2', pad: 'D3 F3 Bb3', arp: 'Bb3 F4 C5 D5' },
      F: { bass: 'F2', pad: 'C3 F3 A3', arp: 'F3 C4 G4 A4' },
      Cm: { bass: 'C3', pad: 'Eb3 G3 C4', arp: 'C4 Eb4 G4 D5' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 3, 2, 1], velocity: [60, 38, 46, 44, 44, 36] },
    bass: { step: 1, velocity: [78, 44, 52] },
    kit: {
      keys: { frame: 41, tap: 45 },
      drums: DRUMS,
      bar: [
        ['frame', 0, 58],
        ['tap', 2, 34],
      ],
    },
    sections: [
      { bars: 'Gm | Gm | Eb | Dsus', parts: ['pad', 'arp', 'bass'], level: 0.75 },
      {
        bars: 'Gm | C | Gm | Dsus | Eb | Bb | Cm | D',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'G3:1.5 A3:.5 Bb3:1 | D4:2 E4:1 | D4:1.5 C4:.5 Bb3:1 | A3:3 | Bb3:1.5 C4:.5 D4:1 | F4:2 Eb4:1 | D4:1 C4:1 Bb3:1 | A3:2 r:1',
      },
      {
        bars: 'Eb | Bb | F | Gm | Eb | Bb | Cm | Dsus',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter'],
        counter:
          'G4:2 F4:1 | D4:1.5 F4:.5 Bb4:1 | A4:2 G4:1 | D4:3 | Eb4:1.5 F4:.5 G4:1 | F4:2 D4:1 | Eb4:1 D4:1 C4:1 | D4:3',
        lead: 'Eb3:3 | D3:3 | C3:3 | Bb2:3 | C3:3 | D3:3 | Eb3:3 | D3:3',
        level: 0.9,
      },
      {
        bars: 'Gm | C | Gm | Dsus | Eb | Bb | Cm | D',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead', 'drums'],
        counter:
          'G4:1.5 A4:.5 Bb4:1 | D5:2 E5:1 | D5:1.5 C5:.5 Bb4:1 | A4:3 | Bb4:1.5 C5:.5 D5:1 | F5:2 Eb5:1 | D5:1 C5:1 Bb4:1 | A4:2 r:1',
        lead: 'G2:3 | C3:3 | Bb2:3 | A2:3 | G2:3 | F2:3 | Eb2:3 | D3:3',
      },
      { bars: 'Eb | Cm | Gm | Dsus', parts: ['pad', 'arp'], level: 0.7 },
      {
        bars: 'Eb | Bb | F | Gm | Eb | Bb | Cm | Dsus',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'G3:2 F3:1 | D3:1.5 F3:.5 Bb3:1 | A3:2 G3:1 | D3:3 | Eb3:1.5 F3:.5 G3:1 | F3:2 D3:1 | Eb3:1 D3:1 C3:1 | D3:3',
        level: 0.85,
      },
      {
        bars: 'Eb | Cm | Dsus | Gm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'G3:1.5 D4:1.5 | Eb4:3 | D4:3 | G3:3',
        level: 0.7,
      },
    ],
  });
}

/** Lamplight: a nocturne in D minor at 62, the piano's ostinato under a low flute, the horn answering. */
function lamplight(): Song {
  return calmPiece({
    name: 'lamplight',
    bpm: 62,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: piano, lead: flute, counter: inRole(horn, 'lead') },
    chords: {
      Dm: { bass: 'D2', pad: 'F3 A3 D4', arp: 'D3 A3 E4 F4' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 C4 D4' },
      Bbmaj7: { bass: 'Bb1', pad: 'D3 F3 A3', arp: 'Bb2 F3 A3 D4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F3 C4 G4 A4' },
      C: { bass: 'C2', pad: 'E3 G3 C4', arp: 'C3 G3 D4 E4' },
      Gm: { bass: 'G2', pad: 'G3 Bb3 D4', arp: 'G3 D4 A4 Bb4' },
      A: { bass: 'A1', pad: 'E3 A3 C#4', arp: 'A2 E3 C#4 E4' },
      Asus: { bass: 'A1', pad: 'D3 E3 A3', arp: 'A2 E3 A3 D4' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 3, 2, 1, 2, 1], velocity: [54, 32, 40, 36, 42, 30, 36, 28] },
    bass: { step: null, velocity: [70] },
    kit: {
      keys: { deep: 36 },
      drums: DRUMS,
      bar: [
        ['deep', 0, 48],
        ['deep', 0.75, 30],
      ],
    },
    sections: [
      { bars: 'Dm | Bbmaj7 | Dm | Asus', parts: ['pad', 'arp', 'bass'], level: 0.75 },
      {
        bars: 'Dm | Bb | F | C | Dm | Bb | Gm | Asus/A',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'D4:1.5 A4:2.5 | Bb4:2 A4:2 | F4:1.5 G4:.5 A4:2 | G4:2 E4:2 | D4:1.5 A4:2.5 | Bb4:1 C5:1 D5:2 | C5:1.5 Bb4:.5 A4:1 G4:1 | A4:3 r:1',
      },
      {
        bars: 'Bbmaj7 | F | Gm | Dm | Bbmaj7 | F | Gm | A',
        parts: ['pad', 'arp', 'bass', 'counter'],
        counter:
          'F3:2 A3:2 | C4:3 r:1 | Bb3:1.5 A3:.5 G3:2 | A3:4 | D4:2 C4:1 A3:1 | C4:2 F4:2 | E4:1.5 D4:.5 Bb3:2 | C#4:4',
        level: 0.9,
      },
      {
        bars: 'Dm | Bb | F | C | Dm | Bb | Gm | Asus/A',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: 'D4:1.5 A4:2.5 | Bb4:2 A4:2 | F4:1.5 G4:.5 A4:2 | G4:2 E4:2 | D4:1.5 A4:2.5 | Bb4:1 C5:1 D5:2 | C5:1.5 Bb4:.5 A4:1 G4:1 | A4:3 r:1',
        counter: 'D3:4 | D3:4 | C3:4 | C3:4 | Bb2:4 | Bb2:4 | G2:2 A2:2 | A2:4',
      },
      {
        bars: 'Gm | Bbmaj7 | Asus | Dm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'D4:2 A4:2 | Bb4:4 | A4:4 | D4:4',
        level: 0.7,
      },
    ],
  });
}

/** The Tithe: E Phrygian at 70, low strings ticking E against F under a bassoon, a far taiko, the levy's weight. */
function tithe(): Song {
  return calmPiece({
    name: 'tithe',
    bpm: 70,
    beatsPerBar: 4,
    tracks: { pad: strings, bass, arp: pizzicato, lead: bassoon, counter: inRole(horn, 'lead') },
    chords: {
      Em: { bass: 'E2', pad: 'E3 G3 B3', arp: 'E3 F3 G3 B3' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F3 E3 A3 C4' },
      Dm: { bass: 'D2', pad: 'D3 F3 A3', arp: 'D3 E3 F3 A3' },
      G: { bass: 'G2', pad: 'G3 B3 D4', arp: 'G3 F3 B3 D4' },
      Am: { bass: 'A1', pad: 'E3 A3 C4', arp: 'A2 B2 C3 E3' },
      C: { bass: 'C2', pad: 'E3 G3 C4', arp: 'C3 B2 E3 G3' },
      Esus: { bass: 'E2', pad: 'E3 A3 B3', arp: 'E3 F3 A3 B3' },
    },
    arp: { step: 0.5, order: [0, 1, 0, 1, 0, 2, 0, 3], velocity: [68, 46, 56, 44, 62, 46, 56, 48] },
    bass: { step: 0.5, velocity: [86, 42, 58, 42, 76, 42, 58, 42] },
    kit: {
      keys: { taiko: 41, frame: 45 },
      drums: DRUMS,
      bar: [
        ['taiko', 0, 84],
        ['taiko', 2.5, 52],
        ['frame', 3, 36],
      ],
    },
    sections: [
      { bars: 'Em | F | Em | F', parts: ['pad', 'arp', 'bass', 'drums'], level: 0.7 },
      {
        bars: 'Em | F | Em | F | Dm | Em | F | Esus',
        parts: ['pad', 'arp', 'bass', 'lead', 'drums'],
        lead: 'E3:3 F3:1 | G3:2 F3:2 | E3:2 B2:2 | C3:4 | D3:1.5 E3:.5 F3:2 | G3:2 B3:2 | A3:1.5 G3:.5 F3:2 | E3:4',
        level: 0.85,
      },
      {
        bars: 'Am | G | F | Em | Am | C | F | Esus',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter'],
        counter: 'A3:2 C4:2 | B3:2 D4:2 | C4:3 A3:1 | B3:4 | C4:2 E4:2 | E4:1.5 D4:.5 C4:2 | A3:2 F3:2 | E3:4',
        lead: 'A2:4 | G2:4 | F2:4 | E2:4 | A2:4 | C3:4 | F2:4 | E2:4',
      },
      {
        bars: 'Em | F | Em | F | Dm | Em | F | Esus',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: 'E3:3 F3:1 | G3:2 F3:2 | E3:2 B2:2 | C3:4 | D3:1.5 E3:.5 F3:2 | G3:2 B3:2 | A3:1.5 G3:.5 F3:2 | E3:4',
        counter: 'B3:4 | C4:4 | B3:4 | A3:4 | A3:4 | B3:4 | C4:4 | B3:4',
      },
      {
        bars: 'F | Em | F | Em',
        parts: ['pad', 'arp', 'lead'],
        lead: 'E3:2 B3:2 | C4:4 | B3:4 | E3:4',
        level: 0.65,
      },
    ],
  });
}

/** The social space's pieces, played one at a time, never the same twice running. */
export const socialPieces = (): Song[] => [saltmere(), lamplight(), tithe()];
