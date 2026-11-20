// The story's six songs, each telling its one theme (storyBand.ts): the title over the cloud and the islands, the
// theme on the horn and then the strings, broadening into Saltmere; the calm, the theme alone on a flute after the
// fight; the shore, the theme raised to D major, coming in a layer at a time as the stranger comes and the two rise
// together, ending on D, which leads into Saltmere's G. The storm, the ram and the deep are in storyStorm.ts.

import { measured } from './craft.ts';
import { type Song, lay } from './score.ts';
import {
  ANSWER,
  RAISED,
  RAISED_ANSWER,
  THEME,
  UNDER,
  type Write,
  harmony,
  held,
  rolled,
  rootOver,
  roots,
  storySong,
} from './storyBand.ts';
import { deepSong, ramSong, stormSong } from './storyStorm.ts';

export type StorySong = 'theme' | 'storm' | 'calm' | 'ram' | 'deep' | 'shore';

/** Every song of the story. */
export function storyScores(): Readonly<Record<StorySong, Song>> {
  return {
    theme: themeSong(),
    storm: stormSong(),
    calm: calmSong(),
    ram: ramSong(),
    deep: deepSong(),
    shore: shoreSong(),
  };
}

const FOUR = 4;
/** Under the theme's answer, moving where the tune holds: the cello's in D minor, the horn's in D major. */
const COUNTER = measured(
  'D3:2 F3:2 | A3:2 C4:2 | Bb3:2 D4:2 | C#4:4 | D4:2 F3:2 | Bb3:2 G3:2 | A3:2 E3:2 | D3:4',
  FOUR,
);
const RAISED_COUNTER = measured(
  'D4:2 F#4:2 | A3:2 C#4:2 | B3:2 D4:2 | C#4:4 | D4:2 F#3:2 | B3:2 G3:2 | A3:2 E3:2 | D3:4',
  FOUR,
);

/** The theme's first notes high on the flute, over the title. */
const TITLE = measured('D5:1.5 A5:.5 Bb5:1 A5:1 | F5:4 | E5:2 C#5:2 | D5:4', FOUR);

/** The title: first light (two bars of the pad and a bell, the intro's 6 s over the cloud), then, as the camera goes
 *  down through the cloud, the theme on the horn and the fiddle an octave apart with the choir, the brass and the
 *  drums, rising to the title over Saltmere; then, as the game waits to begin, its answer on the flute with the cello
 *  under it and the choir, and the title's bars, the theme's first notes high on the flute, quiet. About 67 s before
 *  it comes round, so it never begins again under a title the player has only just reached. */
function themeSong(): Song {
  const sections = [
    ['dawn', harmony('Dm | Dm', FOUR)],
    ['full', harmony(UNDER.theme, FOUR)],
    ['answer', harmony(UNDER.answer, FOUR)],
    ['title', harmony('Dm | Bb | A | Dm', FOUR)],
  ] as const;
  const starts = sections.map((unused, index) =>
    sections.slice(0, index).reduce((sum, [, bars]) => sum + bars.length, 0),
  );
  const startOf = (name: (typeof sections)[number][0]) => starts[sections.findIndex(([named]) => named === name)] ?? 0;
  return storySong(
    'theme',
    {
      bpm: 79,
      bars: sections.reduce((sum, [, bars]) => sum + bars.length, 0),
      beats: FOUR,
      level: 2.7,
      tracks: {
        pad: 'bed',
        bass: 'bed',
        strings: 'bed',
        bells: 'tension',
        trem: 'tension',
        cello: 'tension',
        harp: 'pulse',
        timpani: 'combat',
        horn: 'lead',
        flute: 'lead',
        fiddle: 'lead',
        choir: 'peak',
        brass: 'peak',
      },
      kit: 'combat',
    },
    (w) => {
      for (const [name, bars] of sections) {
        const first = startOf(name);
        const quiet = name === 'dawn' || name === 'title';
        held(w, 'pad', first, bars, FOUR, 50, quiet ? 46 : 54);
        if (name !== 'dawn') roots(w, 'bass', first, bars, FOUR, 28, name === 'full' ? 86 : 74);
        if (name !== 'dawn') rolled(w, 'harp', first, bars, FOUR, 50, name === 'full' ? 70 : 62);
        if (name === 'answer' || name === 'full') held(w, 'strings', first, bars, FOUR, 62, name === 'full' ? 60 : 50);
        if (name === 'answer') held(w, 'choir', first + 4, bars.slice(4), FOUR, 57, 56);
        if (name === 'full') held(w, 'choir', first, bars, FOUR, 57, 70);
      }
      dawn(w, startOf('dawn'));
      lay(w, 'horn', startOf('full'), THEME, 100, { legato: 0.95 });
      lay(w, 'fiddle', startOf('full'), THEME, 90, { octave: 1, legato: 0.93 });
      broaden(w, startOf('full'));
      lay(w, 'flute', startOf('answer'), ANSWER, 84, { legato: 0.94 });
      lay(w, 'cello', startOf('answer'), COUNTER, 68, { legato: 0.97, accent: 4 });
      lay(w, 'flute', startOf('title'), TITLE, 72, { legato: 0.96 });
      w.note('bells', startOf('title'), 0, 4, 'D5', 54);
    },
  );
}

/** First light: a bell's A over the pad, and the high strings shimmering on D and A. */
function dawn(w: Write, first: number): void {
  w.note('bells', first, 0, 4, 'A4', 60);
  for (const key of ['A5', 'D6']) w.note('trem', first, 1, 7, key, 34);
}

/** First light's last bar rolls on the timpani into the full theme, which the brass swells into and the drums keep. */
function broaden(w: Write, full: number): void {
  for (let step = 0; step < 8; step++) w.note('timpani', full - 1, 2 + step * 0.25, 0.25, 'A2', 60 + step * 6);
  w.hit('crash', full, 0, 92);
  const chords = harmony(UNDER.theme, FOUR);
  chords.forEach((bar, index) => {
    const root = bar[0]?.chord ?? 'Dm';
    w.note('timpani', full + index, 0, 1, rootOver(root, 38), 92);
    w.hit('taiko', full + index, 0, 82);
    w.hit('taiko', full + index, 2.5, 58);
    const low = rootOver(root, 50);
    if (index % 4 === 0) for (const key of [low, low + 7, low + 12]) w.note('brass', full + index, 0, 3, key, 84);
  });
}

/** The calm after the fight: the theme on one flute over the harp, its answer on the fiddle with the cello under it,
 *  the horn's soft line closing it. The wind has dropped; nothing drives. */
function calmSong(): Song {
  const bars = [...harmony(UNDER.theme, FOUR), ...harmony(UNDER.answer, FOUR)];
  return storySong(
    'calm',
    {
      bpm: 66,
      bars: bars.length,
      beats: FOUR,
      level: 3.2,
      tracks: {
        pad: 'bed',
        bass: 'bed',
        strings: 'bed',
        harp: 'pulse',
        cello: 'tension',
        flute: 'lead',
        fiddle: 'lead',
        horn: 'peak',
      },
      kit: 'combat',
    },
    (w) => {
      held(w, 'pad', 0, bars, FOUR, 50, 48);
      held(w, 'strings', 8, bars.slice(8), FOUR, 62, 36);
      roots(w, 'bass', 0, bars, FOUR, 28, 66);
      rolled(w, 'harp', 0, bars, FOUR, 50, 60, { ring: 2 });
      lay(w, 'flute', 0, THEME, 84, { legato: 0.96 });
      lay(w, 'fiddle', 8, ANSWER, 80, { legato: 0.95 });
      lay(w, 'cello', 8, COUNTER, 66, { legato: 0.97, accent: 2 });
      lay(w, 'horn', 12, measured('F4:4 | D4:4 | E4:4 | D4:4', FOUR), 54, { legato: 0.98, accent: 2 });
    },
  );
}

/** The shore: four bars of waking (the pad, the voices and a bell), then the theme raised to D major on the flute
 *  over the harp and a frame drum as she comes, then its answer on the fiddle with the horn's line and the choir as
 *  the two rise and walk up the shore. Each comes in as its layer does. */
function shoreSong(): Song {
  const waking = harmony('D | G | D | A', FOUR);
  const bars = [...waking, ...harmony(UNDER.raised, FOUR), ...harmony(UNDER.raisedAnswer, FOUR)];
  return storySong(
    'shore',
    {
      bpm: 76,
      bars: bars.length,
      beats: FOUR,
      level: 3,
      tracks: {
        pad: 'bed',
        strings: 'bed',
        bass: 'bed',
        voices: 'tension',
        bells: 'tension',
        harp: 'pulse',
        flute: 'lead',
        fiddle: 'lead',
        horn: 'peak',
        choir: 'peak',
      },
      kit: 'combat',
    },
    (w) => {
      held(w, 'pad', 0, bars, FOUR, 50, 50);
      held(w, 'voices', 0, waking, FOUR, 69, 44, 2);
      held(w, 'strings', 4, bars.slice(4), FOUR, 62, 46);
      roots(w, 'bass', 4, bars.slice(4), FOUR, 28, 72);
      rolled(w, 'harp', 0, bars, FOUR, 50, 60);
      for (const [bar, key] of [
        [0, 'A4'],
        [2, 'D5'],
        [12, 'A4'],
      ] as const)
        w.note('bells', bar, 0, 4, key, 54);
      for (let bar = 4; bar < bars.length; bar++) {
        w.hit('frame', bar, 0, 56);
        w.hit('frame', bar, 2, 40);
        if (bar >= 12) w.hit('frame', bar, 3.5, 34);
      }
      lay(w, 'flute', 4, RAISED, 86, { legato: 0.95 });
      lay(w, 'fiddle', 12, RAISED_ANSWER, 88, { legato: 0.94 });
      lay(w, 'horn', 12, RAISED_COUNTER, 70, { legato: 0.97, accent: 4 });
      held(w, 'choir', 12, bars.slice(12), FOUR, 57, 64);
    },
  );
}
