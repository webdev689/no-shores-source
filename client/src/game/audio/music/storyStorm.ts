// The story's dark songs. The storm: D minor driving in the low strings, the theme's sigh in the drive, the theme
// itself slowed on the horns, tense but no villain's, in layers the beats bring in as the storm grows and the Grey
// Tithe come. The ram: the Frigate coming out of the storm in Thule's own half step (the Boarding's E against F), swelling
// till the crash cuts it off. The deep: the theme slowed again on voices under the sea, a celesta glinting its first
// notes high above as the fires do through the surface.

import { chordAt, measured, roll } from './craft.ts';
import { type Song, lay, midiNote } from './score.ts';
import { type Chord, harmony, held, rootOver, roots, storySong } from './storyBand.ts';

const FOUR = 4;
/** D minor's notes as pitch classes: the drive's sigh is the one next above the chord's fifth, falling back to it. */
const D_MINOR: readonly number[] = [2, 4, 5, 7, 9, 10, 0];
const nextAbove = (key: number): number => {
  let up = key + 1;
  while (!D_MINOR.includes(up % 12)) up++;
  return up;
};

/** The theme slowed to twice its length on the horns, its answer under the fiddle an octave up. */
const STORM_THEME = measured(
  'D4:3 A4:1 | Bb4:2 A4:2 | G4:2 F4:2 | E4:4 | D4:3 A4:1 | Bb4:2 A4:2 | Bb4:2 D5:2 | A4:2 C#5:2',
  FOUR,
);
const STORM_ANSWER = measured(
  'F4:2 Bb4:2 | G4:2 C5:2 | D5:3 A4:1 | Bb4:2 F4:2 | G4:2 Bb4:2 | Bb4:2 G4:2 | A4:4 | E4:2 C#4:2',
  FOUR,
);

/** The storm: sixteen bars at 112. The bed is the pad, the low strings and the bass; the tension the high strings'
 *  tremolo on the chord's top, a bell tolling, a swell into each half and the taiko's heartbeat; the pulse the drive,
 *  eighths on the root with the sigh (the note over the fifth falling to it); the fight the timpani and the toms in
 *  3-3-2; the lead the theme slowed on the horns, the fiddle over it in the second half; the peak the choir and the
 *  brass's stabs. */
export function stormSong(): Song {
  const bars = harmony('Dm | Dm | Bb | C | Dm | Dm | Gm | A | Bb | C | Dm | Bb | Gm | Eb | A | A', FOUR);
  return storySong(
    'storm',
    {
      bpm: 112,
      bars: bars.length,
      beats: FOUR,
      level: 2.1,
      tracks: {
        pad: 'bed',
        strings: 'bed',
        bass: 'bed',
        trem: 'tension',
        bells: 'tension',
        swell: 'tension',
        drive: 'pulse',
        timpani: 'combat',
        horn: 'lead',
        fiddle: 'lead',
        choir: 'peak',
        brass: 'peak',
      },
      kit: 'combat',
      drums: { taiko: 'tension' },
    },
    (w) => {
      held(w, 'pad', 0, bars, FOUR, 50, 52);
      held(w, 'strings', 0, bars, FOUR, 50, 58);
      held(w, 'choir', 0, bars, FOUR, 57, 74);
      bars.forEach((bar, index) => {
        const chord: Chord = chordAt(bar, 0);
        const root = rootOver(chord, 38);
        const fifth = root + 7;
        w.note('bass', index, 0, 3.8, rootOver(chord, 28), 90);
        w.note('trem', index, 0, 4, rootOver(chord, 74) + 7, 48);
        const drive = [root, root, root + 12, root, fifth, root, nextAbove(fifth), fifth];
        drive.forEach((key, eighth) =>
          w.note('drive', index, eighth / 2, 0.45, key, eighth === 0 ? 96 : eighth === 4 ? 82 : 70),
        );
        w.note('timpani', index, 0, 1, rootOver(chord, 38), 96);
        w.note('timpani', index, 2, 1, rootOver(chord, 38), 78);
        for (const [beat, loud] of [
          [0, 90],
          [1.5, 76],
          [3, 84],
        ] as const)
          w.hit('lowTom', index, beat, loud);
        w.hit('tom', index, 3.5, 70);
        w.hit('kick', index, 0, 100);
        w.hit('taiko', index, 0, 86);
        w.hit('taiko', index, 0.5, 60);
        const low = rootOver(chord, 50);
        if (index % 2 === 1) for (const key of [low, low + 7]) w.note('brass', index, 2.5, 0.5, key, 92);
      });
      for (const [bar, key, loud] of [
        [0, 'D5', 70],
        [4, 'A4', 56],
        [8, 'D5', 70],
        [12, 'A4', 56],
      ] as const)
        w.note('bells', bar, 0, 4, key, loud);
      for (const bar of [7, 15]) {
        w.note('swell', bar, 0.5, 3.5, 'D5', 72);
        roll((beat, loud) => w.note('timpani', bar, beat, 0.25, 'A2', loud), 2, 2, 70, 112);
        const low = rootOver('A', 40);
        for (const key of [low, low + 7]) w.note('brass', bar, 0, 4, key, 96);
      }
      w.hit('crash', 0, 0, 96);
      w.hit('crash', 8, 0, 96);
      lay(w, 'horn', 0, STORM_THEME, 96, { legato: 0.96 });
      lay(w, 'horn', 8, STORM_ANSWER, 96, { legato: 0.96 });
      lay(w, 'fiddle', 8, STORM_ANSWER, 80, { octave: 1, legato: 0.94 });
    },
  );
}

/** The ram, played once: five bars at 96, the Frigate's coming in the Boarding's E against F. The low brass and the
 *  bass hold the half step, struck louder each bar; the tremolo climbs a half step a bar; the timpani and the taiko
 *  quicken to a roll; a swell runs into the last bar, where the hit and the choir would land if the crash had not
 *  already cut it off. */
export function ramSong(): Song {
  const bars = 5;
  const louder = [48, 62, 78, 98, 116] as const;
  return storySong(
    'ram',
    {
      bpm: 96,
      bars,
      beats: FOUR,
      level: 1.9,
      tracks: {
        bass: 'bed',
        brass: 'bed',
        horn: 'bed',
        trem: 'tension',
        swell: 'tension',
        timpani: 'combat',
        choir: 'peak',
        hit: 'peak',
      },
      kit: 'combat',
      edge: { wrap: false, clip: true, hold: true, restrike: false },
    },
    (w) => {
      louder.forEach((loud, bar) => {
        w.note('bass', bar, 0, 4, 'E1', loud);
        for (const key of ['E2', 'F2', 'B2']) w.note('brass', bar, 0, 4, key, loud);
        if (bar >= 2) for (const key of ['E3', 'F3']) w.note('horn', bar, 0, 4, key, loud - 8);
        for (const step of [0, 1]) w.note('trem', bar, 0, 4, midiNote('E4') + bar + step, loud - 6);
        if (bar >= 2 && bar < 4) for (const key of ['E3', 'F3', 'B3']) w.note('choir', bar, 0, 4, key, loud - 20);
      });
      const strokes = [2, 4, 8, 16] as const;
      strokes.forEach((count, bar) => {
        for (let stroke = 0; stroke < count; stroke++) {
          const beat = (stroke * FOUR) / count;
          const loud = (louder[bar] ?? 100) + (stroke * 12) / count;
          w.note('timpani', bar, beat, FOUR / count, 'E2', loud);
          w.hit('taiko', bar, beat, loud + 6);
        }
      });
      w.note('swell', 1, 0.5, 3.5, 'E4', 70);
      w.note('swell', 3, 0.5, 3.5, 'E4', 104);
      w.note('timpani', 4, 0, 2, 'E2', 127);
      w.hit('taiko', 4, 0, 127);
      w.hit('crash', 4, 0, 120);
      for (const key of ['E2', 'B2', 'E3', 'F3']) w.note('hit', 4, 0, 1, key, 120);
      for (const key of ['E3', 'F3', 'B3']) w.note('choir', 4, 0, 4, key, 104);
    },
  );
}

/** The deep: eight bars at 54. The pad and the bass hold the chord low; the voices sing the theme slowed (its B flat
 *  over the B flat chord's major seventh, the deep's own colour); the celesta glints its first four notes high, with
 *  an echo; the harp falls slowly on the root and the fifth; the high strings hold D and A in its second half. */
export function deepSong(): Song {
  const bars = harmony('Dm | Bb | Gm | A | Dm | Bb | Gm/A | Dm', FOUR);
  const glint = measured('D6:1 A6:1 Bb6:1 A6:1', FOUR);
  return storySong(
    'deep',
    {
      bpm: 54,
      bars: bars.length,
      beats: FOUR,
      level: 4.1,
      tracks: { pad: 'bed', bass: 'bed', harp: 'pulse', celesta: 'tension', voices: 'lead', strings: 'peak' },
      kit: 'combat',
    },
    (w) => {
      held(w, 'pad', 0, bars, FOUR, 50, 50, 4);
      roots(w, 'bass', 0, bars, FOUR, 28, 58);
      bars.forEach((bar, index) => {
        const root = rootOver(chordAt(bar, 0), 38);
        w.note('harp', index, 0, 3, root, 48);
        w.note('harp', index, 2, 3, rootOver(chordAt(bar, 2), 38) + 7, 40);
      });
      for (const bar of [0, 2, 4, 6]) {
        lay(w, 'celesta', bar, glint, 44, { legato: 1 });
        lay(w, 'celesta', bar, glint, 28, { legato: 1, late: 0.5, accent: 0 });
      }
      lay(
        w,
        'voices',
        0,
        measured('D4:3 A4:1 | Bb4:2 A4:2 | G4:2 F4:2 | E4:4 | D4:3 A4:1 | C5:2 A4:2 | Bb4:2 E4:2 | D4:4', FOUR),
        70,
        { legato: 0.98, accent: 4 },
      );
      for (const key of ['D5', 'A5']) w.note('strings', 4, 0, 16, key, 36);
    },
  );
}
