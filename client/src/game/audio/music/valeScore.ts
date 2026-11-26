// The Drowned Vale's fights: one theme for the whole raid (valeParts.ts), each encounter's song in a key, a tempo and
// a colour of its own, written as takes (valeTakes.ts). The Waking is the Lattice's glass over the gate's drums in D;
// the Mending drives hardest, in C, the seams' glass rubbing; the Choir is slow and heavy, in E, its bells tolling;
// the Unlit Ways is stealth, in B flat, with no drums: a drone, the waterphone, a heartbeat and a pulse, its peak the
// moment a Watcher sees; the Two Shores turns D minor against its flat second, in E flat, its bells struck from both
// shores. Each song has its cadence, its victory into the major and its defeat on the low cello.

import type { FightScore } from './director.ts';
import type { BreachSong } from './directorLaw.ts';
import { type Song, lay, makeSong } from './score.ts';
import { CHORDS, KIT, LEVEL, ONCE, PRESS, TRACKS, type Write, harmony, line } from './valeParts.ts';
import { type SectionSpec, type ValeSong, valeSong } from './valeTakes.ts';

/** A fight's or a boss's phase's four sections: a vamp (a march) to open on, the theme, its strain and a breakdown,
 *  each harmony its own. */
export const fightSections = (vamp: string, down: string): Readonly<Record<string, SectionSpec>> => ({
  vamp: { harmony: vamp, next: ['theme', 'strain'], opens: true, lead: 'none' },
  theme: {
    harmony: 'i | iv | bII | i | III | bVI | bVII | i',
    turn: 'i | bVI | bII | i | bVI | iv | bII | i',
    next: ['strain', 'down', 'vamp'],
    lead: 'theme',
  },
  strain: {
    harmony: 'v | bII | bVI | v | bVII | iv | bII | i',
    turn: 'v | bVI | i | V | III | iv | bII | i',
    next: ['theme', 'down'],
    lead: 'strain',
  },
  down: { harmony: down, next: ['theme', 'vamp', 'strain'], opens: true, lead: 'head', thin: true },
});

export const VALE_FIGHTS: Readonly<Record<BreachSong, ValeSong>> = {
  waking: {
    name: 'vale-waking',
    bpm: 92,
    key: 0,
    colour: 'glass',
    drums: true,
    drive: 1,
    sections: fightSections('i | i | bII | i | i | i | bVII | bII', 'i | i | bVI | bVI | i | i | bII | bII'),
  },
  mending: {
    name: 'vale-mending',
    bpm: 100,
    key: -2,
    colour: 'glass',
    drums: true,
    drive: 2,
    sections: fightSections('i | bII | i | bII | iv | bII | i | v', 'i | bVII | bVI | bVII | i | bVII | bII | i'),
  },
  choir: {
    name: 'vale-choir',
    bpm: 84,
    key: 2,
    colour: 'bells',
    drums: true,
    drive: 0,
    sections: fightSections('i | bVI | i | bVI | i | bVI | bII | bII', 'i | i | iv | iv | i | i | bII | v'),
  },
  ways: {
    name: 'vale-ways',
    bpm: 66,
    key: -4,
    colour: 'water',
    drums: false,
    drive: 0,
    level: LEVEL * 0.9,
    sections: {
      creep: {
        harmony: 'i | i | bII | i | i | i | bII | bII',
        next: ['hold', 'near', 'still'],
        opens: true,
        lead: 'none',
      },
      hold: { harmony: 'i | bVI | i | bII | i | bVI | iv | i', next: ['creep', 'near', 'still'], lead: 'none' },
      near: { harmony: 'bII | i | bII | i | v | bII | i | i', next: ['still', 'creep'], opens: true, lead: 'none' },
      still: { harmony: 'i | i | i | bVI | i | i | iv | bII', next: ['creep', 'hold', 'near'], lead: 'none' },
    },
  },
  shores: {
    name: 'vale-shores',
    bpm: 108,
    key: 1,
    colour: 'bells',
    drums: true,
    drive: 2,
    sections: fightSections('i | bII | i | bII | i | bII | bVII | bII', 'bII | i | bII | i | bVI | bVII | bII | i'),
  },
};

/** A sting: `bars` of chords on the organ, the bass and the choir, in the song's key and tempo. */
export function sting(song: ValeSong, kind: string, chords: string, write: (w: Write) => void): Song {
  const held = harmony(chords);
  return makeSong(
    {
      name: `${song.name}-${kind}`,
      bpm: song.bpm,
      bars: held.length,
      tracks: TRACKS,
      kit: KIT,
      level: LEVEL,
      press: PRESS,
      edge: ONCE,
    },
    (w) => {
      held.forEach((bar, number) =>
        bar.forEach(({ chord, beat, beats }) => {
          const tones = CHORDS[chord];
          for (const note of tones.pad) w.note('organ', number, beat, beats, note + song.key, 72);
          for (const note of tones.choir) w.note('choir', number, beat, beats, note + song.key, 70);
          w.note('bass', number, beat, beats, tones.bass + song.key, 84);
        }),
      );
      write(w);
    },
  );
}

/** A song's moments: its cadence (the minor four home, a timpani roll into the boom), its victory (rising through
 *  the flat sixth and seventh into D major, the theme's close on the choir high) and its defeat (the theme's head
 *  falling on the low cello, fading). */
export function valeStings(song: ValeSong): Required<Omit<ValeFight, 'song'>> {
  const key = song.key;
  const map = (note: number) => note + key;
  const cadence = sting(song, 'cadence', 'iv | i', (w) => {
    for (let i = 0; i < 8; i++) w.note('timpani', 0, 2 + i * 0.25, 0.24, CHORDS.i.timp + key, 60 + i * 6);
    w.note('timpani', 1, 0, 1, CHORDS.i.timp + key, 110);
    w.hit('boom', 1, 0, 108);
  });
  const victory = sting(song, 'victory', 'bVI | bVII | I | I', (w) => {
    lay(w, 'high', 0, line('F4:2 G4:2 | A4:2 C5:2 | D5:4 | D5:4'), 84, { map });
    lay(w, 'cello', 0, line('Bb3:4 | C4:4 | D4:4 | r:4'), 88, { map });
    w.note('timpani', 2, 0, 1, CHORDS.I.timp + key, 112);
    w.hit('boom', 2, 0, 112);
    w.hit('metal', 2, 0, 90);
  });
  return { cadence, victory, defeat: defeatOf(song) };
}

/** A song's defeat: the theme's head falling on the low cello over a slowing heart. */
export const defeatOf = (song: ValeSong): Song =>
  sting(song, 'defeat', 'i | bII | i', (w) => {
    lay(w, 'cello', 0, line('D3:2 Eb3:1 F3:1 | Eb3:2 D3:1 C3:1 | D3:4'), 76, {
      map: (note) => note + song.key,
      accent: 0,
    });
    w.hit('heart', 0, 0, 90);
    w.hit('heart', 1, 0, 70);
    w.hit('heart', 2, 0, 52);
  });

/** A Vale fight: its song, one cadence, one victory and one defeat. */
type ValeFight = Required<Pick<FightScore, 'song' | 'cadence' | 'victory' | 'defeat'>>;

/** Each of the Drowned Vale's fights, its song in takes and its moments. */
export function valeFights(): Readonly<Record<BreachSong, ValeFight>> {
  const scores = {} as Record<BreachSong, ValeFight>;
  for (const [name, song] of Object.entries(VALE_FIGHTS) as [BreachSong, ValeSong][])
    scores[name] = { song: valeSong(song), ...valeStings(song) };
  return scores;
}
