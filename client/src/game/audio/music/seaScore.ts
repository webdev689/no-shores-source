// The sea's nine songs. Three are the band's (seaBand.ts): the storm (D Aeolian, the low strings driving in eighths under
// stabs in open fifths: tense, never a villain's), landfall (3/4, D Mixolydian, broad: the fiddle over held strings
// and horn) and the sea fight (D minor, a snare's march, a swashbuckler's turns on the minor four and the falling
// i-VII-VI-V). Landfall is played once through; the storm and the fight are written as takes (seaFights.ts). The
// still sea, the open sea and the sea at night have two calm pieces each (seaPieces.ts), played once through out
// of danger.

import { type BandSong, HARMONY, TUNES, bandSpec, floored, stack, voicing } from './seaBand.ts';
import { seaFight, seaStorm } from './seaFights.ts';
import { seaPieces } from './seaPieces.ts';
import { type Song, lay, makeSong } from './score.ts';

export type SeaSong = 'calm' | 'open' | 'night' | 'swell' | 'glass' | 'lantern' | BandSong;

/** Landfall, the coast sighted and home: broad, in D with its flat seventh. The fiddle's tune over held strings, cello
 *  and horn, the harp rolling each chord up, the bodhran soft on the bar; the whistle's tune over the fiddle's; the
 *  first tune again with the flute on it, the horn an octave under, the choir, and the harbour's bell. */
const landfall = () =>
  makeSong({ ...bandSpec('landfall'), bars: 48 }, (w) => {
    [...HARMONY.landA, ...HARMONY.landB, ...HARMONY.landA].forEach((name, bar) => {
      const [root = 0, , fifth = 0, octave = 0, tenth = 0] = stack(name, 3);
      const home = bar >= 32;
      w.note('bass', bar, 0, 2.9, floored(root - 12), 58);
      w.note('cello', bar, 0, 2.9, root, 58);
      for (const n of voicing(name, 57)) w.note('strings', bar, 0, 2.9, n, home ? 62 : 54);
      if (!home) for (const n of voicing(name, 57).slice(0, 2)) w.note('horn', bar, 0, 2.9, n, 48);
      if (home) for (const n of voicing(name, 57)) w.note('choir', bar, 0, 2.9, n, 46);
      w.note('harp', bar, 0, 2.8, root, 66);
      w.note('harp', bar, 1, 1.8, fifth, 52);
      w.note('harp', bar, 1, 1.8, tenth, 50);
      w.note('harp', bar, 2, 0.9, octave, 48);
      w.hit('bodhran', bar, 0, home ? 84 : 74);
      w.hit('bodhranTop', bar, 2, home ? 46 : 38);
      if (bar % 16 === 15) for (let i = 0; i < 8; i++) w.note('timpani', bar, 1 + i * 0.25, 0.24, 'D2', 40 + i * 6);
    });
    lay(w, 'fiddle', 0, TUNES.landA, 88, { legato: 0.97, accent: 4 });
    lay(w, 'whistle', 16, TUNES.landB, 92, { legato: 0.96, accent: 4 });
    lay(w, 'fiddle', 16, TUNES.landUnder, 70, { legato: 0.98, accent: 2 });
    lay(w, 'fiddle', 32, TUNES.landA, 92, { legato: 0.97, accent: 4 });
    lay(w, 'flute', 32, TUNES.landA, 74, { legato: 0.97, accent: 2 });
    lay(w, 'horn', 32, TUNES.landA, 72, { octave: -1, legato: 0.97, accent: 2 });
    w.note('timpani', 32, 0, 0.9, 'D2', 88);
    w.note('bells', 32, 0, 6, 'D4', 74);
    w.note('bells', 0, 0, 6, 'A3', 62);
  });

/** The nine songs: the band's three, and the six calm pieces. */
export const seaSongs = (): Readonly<Record<SeaSong, Song>> => ({
  ...seaPieces(),
  storm: seaStorm(),
  landfall: landfall(),
  fight: seaFight(),
});
