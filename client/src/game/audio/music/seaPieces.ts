// The sea's calm pieces out of danger, two for each sky, played in turn, once through with minutes of silence between:
// the open sea's Open Water, D Dorian in 6/8, a horn over the harp rolling, and the Long Swell, E Dorian, a fiddle over
// it; the still sea's Still Water, A minor at 56, a low flute over the piano's quarters, and Glass, F Aeolian at 52, a
// low clarinet over the harp; the night's Night Watch, G minor in 3/4, the cello over a soft piano, and the Lantern,
// C minor in 3/4, the oboe over it. Lonely, broad and weathered, never jolly; each closes on the world's leitmotif.

import { DRUMS, INSTRUMENTS, calmPiece, inRole } from './calm.ts';
import type { Song } from './score.ts';

const { pad, strings, bass, piano, harp, cello, horn, flute, fiddle, clarinet, oboe } = INSTRUMENTS;

function openWater(): Song {
  return calmPiece({
    name: 'sea-open',
    bpm: 84,
    beatsPerBar: 3,
    tracks: { pad, bass, arp: harp, lead: horn, counter: inRole(cello, 'lead') },
    chords: {
      Dm: { bass: 'D2', pad: 'F3 A3 D4', arp: 'D3 A3 D4 E4' },
      G: { bass: 'G2', pad: 'G3 B3 D4', arp: 'G2 D3 B3 D4' },
      C: { bass: 'C2', pad: 'G3 C4 E4', arp: 'C3 G3 C4 E4' },
      Am: { bass: 'A1', pad: 'E3 A3 C4', arp: 'A2 E3 A3 C4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F2 C3 A3 C4' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 Bb3 D4' },
      Asus: { bass: 'A1', pad: 'D3 E3 A3', arp: 'A2 E3 A3 D4' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 3, 2, 1], velocity: [58, 36, 44, 40, 42, 34] },
    bass: { step: 1.5, velocity: [74, 50] },
    kit: { keys: { frame: 41 }, drums: DRUMS, bar: [['frame', 0, 50]] },
    sections: [
      { bars: 'Dm | Dm | G | Dm', parts: ['pad', 'arp', 'bass'], level: 0.75 },
      {
        bars: 'Dm | G | Dm | C | F | C | G | Asus',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'D4:1.5 A3:1.5 | B3:1 D4:.5 G4:1.5 | F4:1 E4:.5 D4:1.5 | E4:3 | F4:1.5 A4:1.5 | G4:1 E4:.5 C4:1.5 | D4:1.5 B3:1.5 | A3:3',
      },
      {
        bars: 'Bb | F | C | Dm | Bb | F | Am | Asus',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead'],
        counter:
          'D3:1.5 F3:1.5 | C3:3 | E3:1.5 G3:1.5 | F3:1 E3:.5 D3:1.5 | D3:1.5 F3:1.5 | A3:3 | C4:1 B3:.5 A3:1.5 | A3:3',
        lead: 'F4:3 | A4:3 | G4:3 | F4:3 | F4:3 | C4:3 | E4:3 | E4:3',
        level: 0.9,
      },
      { bars: 'Dm | G | Dm | G', parts: ['pad', 'arp', 'drums'], level: 0.7 },
      {
        bars: 'Dm | G | Dm | C | F | C | G | Asus',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: 'D4:1.5 A3:1.5 | B3:1 D4:.5 G4:1.5 | F4:1 E4:.5 D4:1.5 | E4:3 | F4:1.5 A4:1.5 | G4:1 E4:.5 C4:1.5 | D4:1.5 B3:1.5 | A3:3',
        counter: 'D3:3 | B2:3 | A2:3 | C3:3 | F2:3 | E2:3 | D2:3 | A2:3',
      },
      {
        bars: 'Bb | F | C | Dm | Bb | F | Am | Asus',
        parts: ['pad', 'arp', 'bass', 'counter'],
        counter:
          'D3:1.5 F3:1.5 | C3:3 | E3:1.5 G3:1.5 | F3:1 E3:.5 D3:1.5 | D3:1.5 F3:1.5 | A3:3 | C4:1 B3:.5 A3:1.5 | A3:3',
        level: 0.8,
      },
      {
        bars: 'Dm | Bb | Asus | Dm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'D4:1.5 A4:1.5 | Bb4:3 | A4:3 | D4:3',
        level: 0.7,
      },
    ],
  });
}

function stillWater(): Song {
  return calmPiece({
    name: 'sea-calm',
    bpm: 56,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: piano, lead: flute, counter: inRole(cello, 'lead') },
    chords: {
      Am: { bass: 'A1', pad: 'E3 A3 C4', arp: 'A2 E3 B3 C4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F2 C3 G3 A3' },
      C: { bass: 'C2', pad: 'E3 G3 C4', arp: 'C3 G3 D4 E4' },
      G: { bass: 'G1', pad: 'D3 G3 B3', arp: 'G2 D3 A3 B3' },
      Dm: { bass: 'D2', pad: 'F3 A3 D4', arp: 'D3 A3 E4 F4' },
      Esus: { bass: 'E2', pad: 'E3 A3 B3', arp: 'E3 B3 E4 A4' },
    },
    arp: { step: 1, order: [0, 2, 1, 3], velocity: [48, 32, 38, 30] },
    bass: { step: null, velocity: [62] },
    kit: { keys: { deep: 36 }, drums: DRUMS, bar: [] },
    sections: [
      { bars: 'Am | F | Am | F', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Am | F | C | G | Am | Dm | F | Esus',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'E4:2 A4:2 | C5:3 r:1 | G4:1.5 E4:.5 C4:2 | D4:4 | E4:2 A4:2 | A4:1.5 G4:.5 F4:2 | F4:2 D4:2 | E4:4',
      },
      {
        bars: 'F | C | G | Am | Dm | Am | Dm | Esus',
        parts: ['pad', 'arp', 'bass', 'counter'],
        counter: 'F3:4 | C4:4 | G3:2 B3:2 | A3:4 | F3:2 A3:2 | E3:4 | D3:2 F3:2 | E3:4',
        level: 0.85,
      },
      {
        bars: 'Am | F | C | G | Am | Dm | F | Esus',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter'],
        lead: 'E4:2 A4:2 | C5:3 r:1 | G4:1.5 E4:.5 C4:2 | D4:4 | E4:2 A4:2 | A4:1.5 G4:.5 F4:2 | F4:2 D4:2 | E4:4',
        counter: 'A2:4 | F2:4 | C3:4 | B2:4 | A2:4 | A2:4 | D3:4 | E3:4',
      },
      {
        bars: 'Am | F | Esus | Am',
        parts: ['pad', 'arp', 'lead'],
        lead: 'A4:2 E5:2 | F5:4 | E5:4 | A4:4',
        level: 0.65,
      },
    ],
  });
}

function nightWatch(): Song {
  return calmPiece({
    name: 'sea-night',
    bpm: 66,
    beatsPerBar: 3,
    tracks: { pad: strings, bass, arp: piano, lead: cello, counter: inRole(horn, 'lead') },
    chords: {
      Gm: { bass: 'G1', pad: 'D3 G3 Bb3', arp: 'G2 D3 A3 Bb3' },
      Eb: { bass: 'Eb2', pad: 'Eb3 G3 Bb3', arp: 'Eb2 Bb2 F3 G3' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 C4 D4' },
      F: { bass: 'F2', pad: 'F3 A3 C4', arp: 'F2 C3 G3 A3' },
      Cm: { bass: 'C2', pad: 'Eb3 G3 C4', arp: 'C3 G3 D4 Eb4' },
      D: { bass: 'D2', pad: 'D3 F#3 A3', arp: 'D3 A3 C4 F#4' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 3, 2, 1], velocity: [44, 28, 34, 30, 32, 26] },
    bass: { step: null, velocity: [62] },
    kit: { keys: { deep: 36 }, drums: DRUMS, bar: [] },
    sections: [
      { bars: 'Gm | Eb | Gm | D', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Gm | Eb | Bb | F | Gm | Eb | Eb | D',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'D4:2 Bb3:1 | G3:3 | F3:1.5 Bb3:.5 D4:1 | C4:3 | Bb3:1 A3:1 G3:1 | G3:2 Bb3:1 | C4:1.5 Bb3:.5 G3:1 | F#3:3',
      },
      {
        bars: 'Eb | Bb | F | Gm | Eb | Bb | Cm | D',
        parts: ['pad', 'arp', 'bass', 'counter'],
        counter: 'G3:3 | F3:3 | A3:2 C4:1 | Bb3:3 | G3:2 Eb4:1 | D4:3 | Eb4:1.5 D4:.5 C4:1 | A3:3',
        level: 0.85,
      },
      {
        bars: 'Gm | Eb | Bb | F | Gm | Eb | Eb | D',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter'],
        lead: 'D4:2 Bb3:1 | G3:3 | F3:1.5 Bb3:.5 D4:1 | C4:3 | Bb3:1 A3:1 G3:1 | G3:2 Bb3:1 | C4:1.5 Bb3:.5 G3:1 | F#3:3',
        counter: 'Bb3:3 | G3:3 | F3:3 | A3:3 | Bb3:3 | Bb3:3 | G3:3 | F#3:3',
      },
      {
        bars: 'Eb | Bb | F | Gm | Eb | Bb | Cm | D',
        parts: ['pad', 'arp', 'counter'],
        counter: 'G3:3 | F3:3 | A3:2 C4:1 | Bb3:3 | G3:2 Eb4:1 | D4:3 | Eb4:1.5 D4:.5 C4:1 | A3:3',
        level: 0.75,
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

/** The Long Swell, the open sea's second: E Dorian at 76, a fiddle over the harp rolling, the cello under it. */
function swell(): Song {
  const tune =
    'E5:1 B4:1 G4:2 | A4:1 F#4:1 D4:2 | C#5:1.5 B4:.5 E4:1 A4:1 | B4:4 | G4:2 C5:1 E5:1 | A4:1.5 B4:.5 A4:1 F#4:1' +
    ' | G4:2 E4:2 | F#4:4';
  return calmPiece({
    name: 'sea-swell',
    bpm: 76,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: harp, lead: fiddle, counter: inRole(cello, 'lead') },
    chords: {
      Em: { bass: 'E2', pad: 'G3 B3 E4', arp: 'E3 B3 E4 F#4' },
      A: { bass: 'A1', pad: 'A3 C#4 E4', arp: 'A2 E3 A3 C#4' },
      Am: { bass: 'A1', pad: 'A3 C4 E4', arp: 'A2 E3 A3 C4' },
      D: { bass: 'D2', pad: 'F#3 A3 D4', arp: 'D3 A3 D4 F#4' },
      G: { bass: 'G2', pad: 'G3 B3 D4', arp: 'G2 D3 G3 B3' },
      Bm: { bass: 'B1', pad: 'F#3 B3 D4', arp: 'B2 F#3 B3 D4' },
      B: { bass: 'B1', pad: 'F#3 B3 D#4', arp: 'B2 F#3 B3 D#4' },
      C: { bass: 'C2', pad: 'G3 C4 E4', arp: 'C3 G3 C4 E4' },
    },
    arp: { step: 0.5, order: [0, 1, 2, 3, 2, 1, 2, 1], velocity: [56, 34, 44, 40, 46, 34, 42, 34] },
    bass: { step: 1, velocity: [70, 40, 56, 40] },
    kit: {
      keys: { frame: 41 },
      drums: DRUMS,
      bar: [
        ['frame', 0, 48],
        ['frame', 2.5, 30],
      ],
    },
    sections: [
      { bars: 'Em | Bm | Em | Bm', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Em | D | A | Em | C | D | Em | B', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'G | A | Bm | Em | C | G | A | B',
        parts: ['pad', 'arp', 'bass', 'counter', 'lead'],
        counter: 'D4:2 B3:2 | C#4:2 E4:2 | D4:2 F#3:2 | G3:4 | G3:2 E4:2 | B3:2 D4:2 | C#4:2 E4:2 | D#4:4',
        lead: 'B4:4 | A4:4 | F#4:4 | G4:4 | E4:4 | D4:4 | C#5:4 | D#5:4',
        level: 0.9,
      },
      {
        bars: 'Em | D | A | Em | C | D | Em | B',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'G3:4 | F#3:4 | E3:4 | G3:4 | G3:4 | F#3:4 | G3:4 | F#3:4',
      },
      { bars: 'Em | Am | Em | Em', parts: ['pad', 'arp', 'lead'], lead: 'E4:2 B4:2 | C5:4 | B4:4 | E4:4', level: 0.65 },
    ],
  });
}

/** Glass, the still sea's second: B Aeolian at 52, a low clarinet falling over the harp, a flute far over it. */
function glass(): Song {
  return calmPiece({
    name: 'sea-glass',
    bpm: 52,
    beatsPerBar: 4,
    tracks: { pad: strings, bass, arp: harp, lead: clarinet, counter: inRole(flute, 'lead') },
    chords: {
      Bm: { bass: 'B1', pad: 'F#3 B3 D4', arp: 'B2 F#3 B3 D4' },
      A: { bass: 'A1', pad: 'A3 C#4 E4', arp: 'A2 E3 A3 C#4' },
      G: { bass: 'G1', pad: 'G3 B3 D4', arp: 'G2 D3 G3 B3' },
      'F#m': { bass: 'F#2', pad: 'F#3 A3 C#4', arp: 'F#2 C#3 F#3 A3' },
      Em: { bass: 'E2', pad: 'G3 B3 E4', arp: 'E3 B3 E4 G4' },
      'F#': { bass: 'F#2', pad: 'F#3 A#3 C#4', arp: 'F#2 C#3 F#3 A#3' },
      D: { bass: 'D2', pad: 'F#3 A3 D4', arp: 'D3 A3 D4 F#4' },
    },
    arp: { step: 1, order: [0, 2, 1, 3], velocity: [44, 30, 36, 28] },
    bass: { step: null, velocity: [62] },
    kit: { keys: { deep: 36 }, drums: DRUMS, bar: [['deep', 0, 36]] },
    sections: [
      { bars: 'Bm | G | Bm | G', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      {
        bars: 'Bm | A | G | F#m | Em | G | A | F#',
        parts: ['pad', 'arp', 'bass', 'lead'],
        lead: 'F#4:3 E4:1 | E4:2 C#4:2 | D4:1.5 B3:.5 G3:2 | A3:4 | G3:2 B3:1 E4:1 | D4:3 B3:1 | C#4:1.5 E4:.5 A3:2 | A#3:4',
      },
      {
        bars: 'G | D | Em | Bm | G | A | Em | F#',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        counter: 'B4:2 D5:2 | A4:2 F#4:2 | G4:2 B4:2 | F#4:4 | D5:2 B4:2 | C#5:2 E4:2 | G4:2 E4:2 | F#4:4',
        lead: 'B3:4 | A3:4 | G3:4 | D4:4 | B3:4 | C#4:4 | B3:4 | A#3:4',
        level: 0.9,
      },
      {
        bars: 'Bm | Em | Bm | Bm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'B3:2 F#4:2 | G4:4 | F#4:4 | B3:4',
        level: 0.65,
      },
    ],
  });
}

/** The Lantern, the night's second: C Aeolian at 62, the oboe rising over a soft piano, the horn low under it. */
function lantern(): Song {
  const tune =
    'Eb4:1 F4:1 G4:2 | Ab4:2 C5:1 Ab4:1 | F4:3 D4:1 | G4:2 Bb4:2 | C5:2 Eb5:1 C5:1 | Ab4:1.5 G4:.5 F4:2 | B4:2 D5:1 B4:1' +
    ' | C5:4';
  return calmPiece({
    name: 'sea-lantern',
    bpm: 62,
    beatsPerBar: 4,
    tracks: { pad, bass, arp: piano, lead: oboe, counter: horn },
    chords: {
      Cm: { bass: 'C2', pad: 'G3 C4 Eb4', arp: 'C3 G3 C4 Eb4' },
      Fm: { bass: 'F2', pad: 'F3 Ab3 C4', arp: 'F2 C3 F3 Ab3' },
      Bb: { bass: 'Bb1', pad: 'F3 Bb3 D4', arp: 'Bb2 F3 Bb3 D4' },
      Eb: { bass: 'Eb2', pad: 'G3 Bb3 Eb4', arp: 'Eb3 Bb3 Eb4 G4' },
      Ab: { bass: 'Ab1', pad: 'Ab3 C4 Eb4', arp: 'Ab2 Eb3 Ab3 C4' },
      G: { bass: 'G2', pad: 'G3 B3 D4', arp: 'G2 D3 G3 B3' },
    },
    arp: { step: 1, order: [0, 2, 1, 3], velocity: [46, 30, 36, 30] },
    bass: { step: null, velocity: [62] },
    kit: { keys: { deep: 36 }, drums: DRUMS, bar: [['deep', 0, 38]] },
    sections: [
      { bars: 'Cm | Ab | Cm | G', parts: ['pad', 'arp', 'bass'], level: 0.7 },
      { bars: 'Cm | Fm | Bb | Eb | Ab | Fm | G | Cm', parts: ['pad', 'arp', 'bass', 'lead'], lead: tune },
      {
        bars: 'Ab | Eb | Fm | G | Ab | Bb | Eb | G',
        parts: ['pad', 'arp', 'bass', 'counter', 'drums'],
        counter: 'Eb4:2 C4:2 | Bb3:2 G3:2 | Ab3:2 C4:2 | B3:4 | C4:2 Eb4:2 | D4:2 F4:2 | Eb4:2 G3:2 | B3:4',
        level: 0.85,
      },
      {
        bars: 'Cm | Fm | Bb | Eb | Ab | Fm | G | Cm',
        parts: ['pad', 'arp', 'bass', 'lead', 'counter', 'drums'],
        lead: tune,
        counter: 'G3:4 | Ab3:4 | Bb3:4 | Bb3:4 | Ab3:4 | Ab3:4 | G3:4 | G3:4',
      },
      {
        bars: 'Cm | Ab | Cm | Cm',
        parts: ['pad', 'arp', 'lead'],
        lead: 'C4:2 G4:2 | Ab4:4 | G4:4 | C4:4',
        level: 0.65,
      },
    ],
  });
}

/** The sea's calm pieces, two for each sky, played in turn. */
export const seaPieces = () => ({
  open: openWater(),
  swell: swell(),
  calm: stillWater(),
  glass: glass(),
  night: nightWatch(),
  lantern: lantern(),
});
