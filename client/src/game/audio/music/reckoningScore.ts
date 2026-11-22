// The Reckoning: a boss's score in C minor and a clock. Its motif is a quarter chime struck in the minor and broken:
// its fourth change ends on F sharp, the tritone of home, where the hour should strike. A harpsichord ticks an
// escapement over the chord, wood blocks tick and tock, tubular bells toll the chime; the harmony turns on the
// augmented triad and the Neapolitan D-flat; the theme is on the brass and the horns, low (reckoningParts.ts). Three
// phases at 136, 142 and 152, the second a canon, and a last stand at 160, each written in takes of eight bars
// (form.ts): the clock alone, the theme, the theme answered, the theme in full, the theme over turned chords, the
// clock stopped to its woods and its chime; each in one of the clock's three feels. When the boss falls the chime is
// mended: the quarters in C major, ending home.

import { type TakeSpec, makeForm } from './form.ts';
import {
  BROKEN,
  CANON,
  CHORDS,
  type ChordName,
  type Drum,
  FALL_HARP,
  FIRST,
  LAST,
  MENDED,
  SPEC,
  THEME_ONE,
  THEME_THREE,
  THEME_TWO,
  THIRD,
  type Track,
  type Write,
  chimeBar,
  escapement,
  floorBar,
  notes,
  press,
  progression,
  theme,
  warKit,
} from './reckoningParts.ts';
import { type Song, type Tune, makeSong, midiNote } from './score.ts';

type Section = 'tick' | 'theme' | 'answer' | 'full' | 'turn' | 'stop';
/** The sections a take may lead to, those a phase may open on (the clock alone, or the clock stopped), and the
 *  change of the chime each tolls first: the stopped clock's is not the theme's, whose feels it shares. */
const SECTIONS: Readonly<
  Record<Section, { readonly next: readonly Section[]; readonly opens?: boolean; readonly change: number }>
> = {
  tick: { next: ['theme', 'answer', 'turn'], opens: true, change: 0 },
  theme: { next: ['answer', 'full', 'turn', 'stop'], change: 1 },
  answer: { next: ['theme', 'full', 'stop'], change: 2 },
  full: { next: ['theme', 'turn', 'stop'], change: 3 },
  turn: { next: ['answer', 'full', 'stop'], change: 0 },
  stop: { next: ['tick', 'theme', 'answer'], opens: true, change: 2 },
};
/** Each phase's takes: a section, the clock's feel it keeps (no two of a section in one), and which of its leads. */
const PHASE_TAKES: readonly (readonly [Section, number, number])[] = [
  ['tick', 0, 0],
  ['tick', 2, 1],
  ['theme', 1, 0],
  ['theme', 2, 1],
  ['answer', 0, 0],
  ['answer', 1, 1],
  ['full', 2, 0],
  ['full', 0, 1],
  ['turn', 1, 0],
  ['turn', 0, 1],
  ['stop', 2, 0],
  ['stop', 1, 1],
];

/** A phase: its tempo, level and press, its progression and the same turned under its theme, and its own theme. */
interface Phase {
  readonly number: 1 | 2 | 3;
  readonly bpm: number;
  readonly level: number;
  readonly out: number;
  readonly harmony: readonly ChordName[];
  readonly turn: readonly ChordName[];
  readonly theme: Tune;
}
const PHASES: readonly Phase[] = [
  {
    number: 1,
    bpm: 136,
    level: 1.42,
    out: 5.2,
    harmony: FIRST,
    turn: progression('Cm Aaug Db G Ab Bbm G G'),
    theme: THEME_ONE,
  },
  {
    number: 2,
    bpm: 142,
    level: 1.55,
    out: 5.2,
    harmony: CANON,
    turn: progression('Ab E Cm Fm Db Bbm G G'),
    theme: THEME_TWO,
  },
  {
    number: 3,
    bpm: 152,
    level: 1.62,
    out: 5.6,
    harmony: THIRD,
    turn: progression('Ab Bbm Db Fm Fm Aaug G G'),
    theme: THEME_THREE,
  },
];

/** The broken chime in a feel: a change at the take's head (each half's in the third phase), the same half a take
 *  later, or its four notes tolled slowly, a bar each. */
function tolled(w: Write, bar: number, number: number, feel: number, change: number): void {
  const [track, octave, every] =
    number === 2 ? (['chime', 0, 8] as const) : (['bells', -1, number === 3 ? 4 : 8] as const);
  const notesOf = BROKEN[(change + Math.floor(bar / every)) % 4] ?? [];
  if ((feel === 0 && bar % every === 0) || (feel === 1 && bar % every === every / 2))
    chimeBar(w, bar, notesOf, track, 98, octave);
  if (feel === 2) w.note(track, bar, 0, 2, midiNote(notesOf[bar % 4] ?? 'G4') + 12 * octave, 90);
}

/** The leads over a take: the clock alone, or the brass striking the chime into it; the phase's theme on the brass
 *  (its canon on the strings in the second), or the first theme with the horn over it; the theme answered, half and
 *  half; in full; over the turned chords, on the brass or the horn; the stopped clock's chime, or the theme's head. */
function leads(w: Write, { number, theme: own }: Phase, section: Section, lead: number): void {
  const low = number === 3 ? -1 : 0;
  const echo = number === 2 ? 2 : 0;
  if (section === 'tick') {
    if (lead) [0, 1].forEach((change) => chimeBar(w, 4 + change * 2, BROKEN[change] ?? [], 'brass', 108, -1));
  } else if (section === 'stop') {
    if (lead) theme(w, 4, own, 'horn', 96, { octave: low, to: 2 });
    else for (const bar of [0, 4]) chimeBar(w, bar, BROKEN[3] ?? [], 'brass', 100 + bar, -1);
  } else if (section === 'theme' && lead) {
    theme(w, 0, THEME_ONE, 'brass', 114);
    theme(w, 0, THEME_ONE, 'horn', 102, { octave: 1, late: echo });
  } else if (section === 'theme') {
    theme(w, 0, own, 'brass', 112, { octave: low });
    if (number === 2) theme(w, 0, own, 'strings', 92, { octave: -1, late: 2 });
  } else if (section === 'answer' && number === 2) {
    theme(w, 0, own, lead ? 'strings' : 'brass', 116, { octave: -lead });
    theme(w, 0, own, lead ? 'brass' : 'strings', 96, { octave: lead - 1, late: 2 });
  } else if (section === 'answer') {
    const [call, reply] = lead
      ? (['strings', 'brass'] as const)
      : (['brass', number === 3 ? 'strings' : 'horn'] as const);
    theme(w, 0, own, call, 116, { octave: call === 'brass' ? low : number === 1 ? 1 : 0, to: 4 });
    theme(w, 4, own, reply, 110, { octave: reply === 'brass' ? low : number === 1 ? 1 : 0, from: 4 });
  } else if (section === 'full') {
    theme(w, 0, own, lead ? 'horn' : 'brass', 120, { octave: low });
    theme(w, 0, own, lead ? 'brass' : 'horn', 104, { octave: lead ? -1 : low, late: echo });
    if (number === 3) theme(w, 0, own, 'strings', 100, { from: lead ? 4 : 0 });
    else theme(w, 0, own, 'choir', 98, { octave: number === 2 ? -1 : 0 });
  } else {
    theme(w, 0, own, lead ? 'horn' : 'brass', 114, { octave: lead && number === 1 ? 1 : low });
    if (number === 2) theme(w, 0, own, 'strings', 94, { octave: -1, late: 2 });
  }
}

/** A take of a phase: the floor in the feel, the escapement (racing more as the phases climb), the timpani, the
 *  stabs, the hits and the third's choir on the beat, the bells and the chime, the war's drums (stopped to the woods
 *  and the surdo in the breakdown); and its leads. */
function phaseTake(w: Write, phase: Phase, section: Section, feel: number, lead: number): void {
  const { number } = phase;
  const chords = section === 'turn' ? phase.turn : phase.harmony;
  const stop = section === 'stop';
  // The organ follows the section: lowest with the clock stopped or alone, fullest under the theme in full.
  const swell = { tick: 0.85, theme: 1, answer: 0.92, full: 1.12, turn: 1.05, stop: 0.75 }[section];
  for (let bar = 0; bar < 8; bar++) {
    const name: ChordName = chords[bar] ?? 'Cm';
    const tones = CHORDS[name];
    if (number === 1)
      floorBar(w, bar, name, {
        strings: true,
        choir: !['stop', 'tick', 'theme'].includes(section),
        organ: swell,
        feel,
      });
    else if (number === 2) floorBar(w, bar, name, { choir: !stop, organ: 1.1 * swell, feel });
    else floorBar(w, bar, name, { strings: true, organ: 1.2 * swell, vel: 1.05, feel });
    const fast = !stop && (number === 3 || (number === 2 ? bar % 2 === 1 : bar % 4 === 3 || section === 'full'));
    escapement(w, bar, name, { fast, vel: number === 3 ? 1.05 : 1, feel });
    if (stop) {
      if (bar % 2 === 0) w.note('timpani', bar, 0, 1, tones.timp, 88);
    } else if (number === 3)
      for (let i = 0; i < 8; i++)
        w.note('timpani', bar, i * 0.5, 0.4, i % 4 === 3 ? 'G2' : tones.timp, i === 0 ? 110 : 96);
    else
      for (const [beat, beats, velocity] of number === 2
        ? [
            [0, 1, 110],
            [1.5, 0.5, 94],
            [2, 1, 104],
          ]
        : [
            [0, 1, 110],
            [1.5, 0.5, 94],
          ])
        w.note('timpani', bar, beat ?? 0, beats ?? 1, tones.timp, velocity ?? 100);
    if (!stop && (section === 'tick' || (number === 1 && bar % 2 === 0)))
      for (const n of tones.stab) {
        w.note('brass', bar, 0, 0.9, n, 112);
        w.note('brass', bar, 1.5, 0.45, n, 98);
      }
    if (!stop && (number > 1 || bar % 4 === 0))
      for (const n of tones.stab) {
        w.note('hit', bar, 0, 1, n, 102);
        if (number === 3 || (number === 2 && bar % 2 === 1)) w.note('hit', bar, 2.5, 0.5, n, 96);
      }
    if (!stop && number === 3)
      for (let beat = 0; beat < 4; beat++)
        for (const n of tones.choir) w.note('choir', bar, beat, 0.9, n, beat === 0 ? 106 : 92);
    if (number === 2 && bar % 4 === 0) {
      w.note('bells', bar, 0, 2, tones.pad[0] ?? 'C3', 94);
      w.note('bells', bar, 0.5, 2, tones.pad[1] ?? 'G3', 86);
    }
    tolled(w, bar, number, feel, SECTIONS[section].change);
    const gears = number === 2 || (number === 1 && section !== 'tick');
    warKit(w, bar, { full: number === 2, every: number === 3, gears, racing: number === 3, stopped: stop, feel });
    if (!stop && number === 2 && bar === 7) w.hit('chinese', bar, 3, 96);
    if (!stop && number === 3 && bar % 2 === 0) w.hit('crash', bar, 0, 96);
  }
  leads(w, phase, section, lead);
}

/** A phase, in takes. */
const phaseSong = (phase: Phase): Song =>
  makeForm(
    { ...SPEC, name: `reckoning-${phase.number}`, bpm: phase.bpm, level: phase.level, press: press(phase.out) },
    PHASE_TAKES.map(([section, feel, lead]): TakeSpec<Track, Drum> => {
      const { next, opens } = SECTIONS[section];
      return { section, bars: 8, next, opens, write: (w) => phaseTake(w, phase, section, feel, lead) };
    }),
  );

type Stand = 'count' | 'toll' | 'hammer';
/** The last stand's sections: C minor and D-flat counted, the same with the bell louder and the changes struck in
 *  turn, and the half step hammered from D-flat. */
const STAND: Readonly<Record<Stand, { harmony: readonly ChordName[]; next: readonly Stand[]; opens?: boolean }>> = {
  count: { harmony: LAST, next: ['toll', 'hammer'], opens: true },
  toll: { harmony: LAST, next: ['count', 'hammer'] },
  hammer: { harmony: progression('Db Cm Db Cm Bbm Db G G'), next: ['count', 'toll'], opens: true },
};

/** A take of the last stand: the floor and the escapement racing in the feel, the bell counting every bar (louder
 *  in the toll, twice a bar in the hammer, F sharp in the last two), the timpani in eighths, a change of the chime
 *  hammered on the brass and the horns every other bar and stabs between, the drums at their hardest. */
function standTake(w: Write, section: Stand, feel: number): void {
  const { harmony } = STAND[section];
  for (let bar = 0; bar < 8; bar++) {
    const name: ChordName = harmony[bar] ?? 'Cm';
    const tones = CHORDS[name];
    // The toll voices the strings a feel on: in its own feel, its danger's layers would be the count's.
    floorBar(w, bar, name, {
      strings: true,
      choir: true,
      organ: 1.2,
      vel: 1.05,
      feel,
      voicingShift: section === 'toll' ? 1 : 0,
    });
    escapement(w, bar, name, { fast: true, vel: 1.1, feel });
    const bell = bar >= 6 ? 'F#4' : 'C4';
    if (section === 'hammer') for (const beat of [0, 2]) w.note('bells', bar, beat, 1.8, beat ? 'F#4' : 'C4', 104);
    else w.note('bells', bar, 0, 3.5, bell, section === 'toll' ? 108 + bar : 100 + bar);
    for (let i = 0; i < 8; i++) w.note('timpani', bar, i * 0.5, 0.4, tones.timp, i === 0 ? 114 : 96);
    if (bar % 2 === (section === 'hammer' ? 1 : 0)) {
      const change = BROKEN[section === 'toll' ? (bar / 2) % 4 : 3] ?? [];
      chimeBar(w, bar, change, 'brass', 118, -1);
      chimeBar(w, bar, change, 'horn', 108, -2);
    } else
      for (const n of tones.stab) {
        w.note('brass', bar, 0, 0.9, n, 114);
        w.note('brass', bar, 2, 0.9, n, 108);
        w.note('hit', bar, 0, 1, n, 106);
      }
    warKit(w, bar, { every: true, racing: true, feel });
    w.hit('crash', bar, 0, bar % 2 === 0 ? 100 : 86);
  }
}

/** The last stand, in takes. */
const lastStand = (): Song =>
  makeForm(
    { ...SPEC, name: 'reckoning-last', bpm: 160, level: 1.66, press: press(5.8) },
    (['count', 'toll', 'hammer'] as const).flatMap((section, nth) =>
      [0, 1, 2].map((shift): TakeSpec<Track, Drum> => {
        const { next, opens } = STAND[section];
        return { section, bars: 8, next, opens, write: (w) => standTake(w, section, (nth + shift) % 3) };
      }),
    ),
  );

/** The fall: a timpani roll into C major, the mended chime on the brass and the strings over the bells' four
 *  quarters, the choir; five bars, the hour struck at last, then quiet. */
function fallen(): Song {
  return makeSong({ ...SPEC, name: 'reckoning-fallen', bpm: 88, bars: 12, level: 1.7, press: press(5.6) }, (w) => {
    for (let i = 0; i < 16; i++) w.note('timpani', 0, i * 0.25, 0.24, 'C2', 56 + i * 4);
    for (const n of notes('G3 C4 E4')) w.note('choir', 0, 2, 2, n, 82);
    const major = CHORDS.C;
    for (const n of major.stab) w.note('hit', 1, 0, 1.5, n, 112);
    w.note('timpani', 1, 0, 1, 'C2', 112);
    w.hit('crash', 1, 0, 104);
    w.hit('kick', 1, 0, 112);
    w.hit('surdo', 1, 0, 104);
    for (const [bar, change] of [
      [1, MENDED[0]],
      [2, MENDED[3]],
    ] as const) {
      chimeBar(w, bar, change ?? [], 'brass', 122, -1);
      chimeBar(w, bar, change ?? [], 'strings', 100);
    }
    w.note('brass', 3, 0, 4, 'C4', 122);
    w.note('horn', 3, 0, 4, 'G3', 112);
    MENDED.forEach((change, quarter) => chimeBar(w, 1 + quarter, change, 'bells', 100 - quarter * 2));
    for (const n of major.pad) {
      w.note('organ', 1, 0, 16, n, 94);
      w.note('strings', 3, 0, 6, midiNote(n) + 12, 100);
    }
    for (const n of major.choir) w.note('choir', 1, 0, 16, n, 108);
    w.note('bass', 1, 0, 16, 'C2', 118);
    FALL_HARP.forEach((n, i) => {
      w.note('harp', 3, i * 0.5, 0.45, n, 86);
      w.note('harp', 4, i * 0.5, 0.45, midiNote(n) + 12, 80);
    });
    w.note('timpani', 3, 0, 1, 'C2', 116);
    for (let i = 0; i < 8; i++) w.note('timpani', 4, 2 + i * 0.25, 0.24, 'C2', 76 + i * 5);
    w.note('timpani', 5, 0, 1, 'C2', 112);
    w.hit('crash', 5, 0, 102);
    w.hit('kick', 5, 0, 104);
    for (const n of major.stab) w.note('hit', 5, 0, 1, n, 108);
    w.note('bells', 5, 0, 2, 'C5', 104);
  });
}

/** The Reckoning's songs: its three phases, its last stand and its fall. */
export const reckoningScore = (): { readonly phases: readonly Song[]; readonly last: Song; readonly fallen: Song } => ({
  phases: PHASES.map(phaseSong),
  last: lastStand(),
  fallen: fallen(),
});
