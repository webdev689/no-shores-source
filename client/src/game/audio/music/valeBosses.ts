// The Drowned Vale's two boss scores, in the boss format: three phases, each faster than the last and the third
// lifted to its flat second, a last stand, a wake, a fall and the player's end. The Scrivener's is in G, the Lattice's
// glass over the theme as it rewrites the living, at 112, 118 and 126, its last stand at 134. The Steward's is the
// raid's climax and its theme's fullest statement, in D where the theme lives: the horn doubling the choir, the bells
// of its two shores, at 120, 126 and 132, its last stand at 140; its fall is the Breach cleared, the theme in D major.

import type { BossScore } from './director.ts';
import { lay } from './score.ts';
import { CHORDS, line } from './valeParts.ts';
import { defeatOf, fightSections, sting } from './valeScore.ts';
import { type SectionSpec, type ValeSong, valeSong } from './valeTakes.ts';

/** The last stand: counting on the flat second, the theme at its height, and hammered. */
const LAST: Readonly<Record<string, SectionSpec>> = {
  count: { harmony: 'i | bII | i | bII | i | bII | i | bII', next: ['height', 'hammer'], opens: true, lead: 'none' },
  height: { harmony: 'i | iv | bII | i | III | bVI | bVII | i', next: ['hammer', 'count'], lead: 'theme' },
  hammer: { harmony: 'bII | bII | i | i | bVI | bII | v | i', next: ['height', 'count'], opens: true, lead: 'strain' },
};

interface Boss {
  readonly name: string;
  readonly key: number;
  readonly colour: ValeSong['colour'];
  readonly full: boolean;
  readonly tempos: readonly [number, number, number, number];
  readonly march: string;
  readonly down: string;
}
const SCRIVENER: Boss = {
  name: 'vale-scrivener',
  key: 5,
  colour: 'glass',
  full: false,
  tempos: [112, 118, 126, 134],
  march: 'i | i | bII | i | iv | iv | bII | v',
  down: 'i | bVI | i | bVI | bII | bII | i | i',
};
const STEWARD: Boss = {
  name: 'vale-steward',
  key: 0,
  colour: 'bells',
  full: true,
  tempos: [120, 126, 132, 140],
  march: 'i | bII | i | bVII | i | bII | bVI | bII',
  down: 'i | i | bII | bII | iv | iv | bII | i',
};

/** A boss's score: its phases and last stand in takes, its wake, its fall and the player's end. */
function bossScore(boss: Boss, fallen: (song: ValeSong) => ReturnType<typeof sting>): Required<BossScore> {
  const song = (part: string, bpm: number, key: number, drive: 0 | 1 | 2, sections: ValeSong['sections']) =>
    ({
      name: `${boss.name}-${part}`,
      bpm,
      key,
      colour: boss.colour,
      drums: true,
      drive,
      full: boss.full,
      sections,
    }) as const;
  const [one, two, three, last] = boss.tempos;
  const phases = [
    song('1', one, boss.key, 1, fightSections(boss.march, boss.down)),
    song('2', two, boss.key, 2, fightSections(boss.march, boss.down)),
    song('3', three, boss.key + 1, 2, fightSections(boss.march, boss.down)),
  ];
  const final = song('last', last, boss.key + 1, 2, LAST);
  // The wake: the boom under a riser and the choir's swell on the tonic, two bars, straight into the first phase.
  const wake = sting({ ...(phases[0] ?? final), name: boss.name }, 'wake', 'i | i', (w) => {
    for (let i = 0; i < 8; i++) w.note('timpani', 0, i * 0.5, 0.45, CHORDS.i.timp + boss.key, 56 + i * 8);
    w.hit('riser', 0, 2, 96);
    w.hit('boom', 1, 0, 118);
    w.hit('metal', 1, 0, 100);
  });
  return {
    phases: phases.map(valeSong),
    last: valeSong(final),
    wake,
    fallen: fallen({ ...(phases[2] ?? final), name: boss.name }),
    defeat: defeatOf({ ...(phases[0] ?? final), name: boss.name }),
  };
}

/** The Scrivener blotted out: the flat second resolving home, the glass and the high choir fading over the boom. */
const scrivenerFalls = (song: ValeSong) =>
  sting({ ...song, bpm: 84 }, 'fallen', 'bII | bII | i | i', (w) => {
    w.hit('boom', 0, 0, 114);
    w.hit('metal', 0, 0, 96);
    const map = (note: number) => note + song.key;
    lay(w, 'glass', 0, line('Bb4:4 | Bb4:4 | A4:4 | A4:4'), 70, { map });
    lay(w, 'high', 0, line('F5:4 | Eb5:4 | D5:4 | D5:4'), 72, { map });
  });

/** The Steward falls and the Breach is cleared: the theme in D major on the horn and the choir, the bells and the
 *  boom under it, rising through the flat sixth and seventh to the major tonic. */
const stewardFalls = (song: ValeSong) =>
  sting({ ...song, key: 0, bpm: 76 }, 'cleared', 'bVI | bVII | I | I | bVI/bVII | I', (w) => {
    const theme = 'D3:2 E3:1 F#3:1 | G3:3 F#3:1 | E3:2 D3:2 | A3:4 | G3:2 F#3:1 E3:1 | D3:4';
    lay(w, 'horn', 0, line(theme), 98, { octave: 1 });
    lay(w, 'cello', 0, line(theme), 90, { octave: 1 });
    lay(w, 'high', 0, line(theme), 76, { octave: 2 });
    lay(w, 'bells', 2, line('D4:2 F#4:2 | A4:4 | r:4 | D4:4'), 74);
    for (const bar of [0, 2, 5]) {
      w.hit('boom', bar, 0, 112);
      w.note('timpani', bar, 0, 1, bar === 0 ? CHORDS.bVI.timp : CHORDS.I.timp, 110);
    }
    w.hit('metal', 2, 0, 96);
  });

/** The Drowned Vale's boss scores, by the boss's name in BOSS_SCORES. */
export const valeBosses = (): { readonly scrivener: Required<BossScore>; readonly steward: Required<BossScore> } => ({
  scrivener: bossScore(SCRIVENER, scrivenerFalls),
  steward: bossScore(STEWARD, stewardFalls),
});
