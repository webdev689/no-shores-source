// The Boarding: a boss's score in E Phrygian, E minor with its lowered second (F over E, a half step that never
// resolves). A fanfare on the horn rises E, G-sharp, B as a victor's would and falls on G natural and F: broken. Under
// it a crew's drums in 3-3-2, the low brass hammering the root, the low strings in sixteenths, a chant, tremolo strings
// shrieking B over C, a braam at each phrase and a reverse cymbal swelling into it (boardingParts.ts). A wake of two
// bars swells into the first phase; the phases run 138, 144 and 152, the last stand 160, each written in takes of
// eight bars (form.ts): rising, the motif called and answered, driven, over turned chords, or broken down to the
// taiko and the chant, each in one of the crew's three feels. The boss beaten, the fanfare mended: a hymn in E major.
// The player fallen, the end.

import { type TakeSpec, makeForm } from './form.ts';
import {
  BROKEN,
  CHORDS,
  type ChordName,
  COUNT,
  type Drum,
  END,
  FANFARE,
  FEELS,
  HYMN,
  MOTIF,
  SPEC,
  type Track,
  WAR,
  WAR_THREE,
  type Write,
  bed,
  braam,
  chant,
  drums,
  line,
  notes,
  press,
  progression,
  rollDrum,
  rollNote,
  shrieks,
  spiccato,
  swellInto,
} from './boardingParts.ts';
import { type Song, makeSong, midiNote, tune } from './score.ts';

/** The wake: two bars swelling from nothing into the first phase, the timpani rolling, the taiko and the low brass
 *  growling E against F, the swell rising to the downbeat, the chant's one shout on the last eighth. */
function wake(): Song {
  return makeSong({ ...SPEC, name: 'boarding-wake', bpm: 138, bars: 2, level: 1.5, press: press(5) }, (w) => {
    for (let i = 0; i < 32; i++) w.note('timpani', Math.floor(i / 16), (i % 16) * 0.25, 0.22, 'E2', 44 + i * 2.6);
    for (let i = 0; i < 16; i++) {
      w.hit(i % 2 ? 'lowTom' : 'surdo', Math.floor(i / 8), (i % 8) * 0.5, 50 + i * 4);
      w.note('ostinato', Math.floor(i / 8), (i % 8) * 0.5, 0.45, i % 4 === 3 ? 'F2' : 'E2', 52 + i * 4);
    }
    swellInto(w, 2, 138, 104);
    w.hit('crash', 1, 3.5, 100);
    w.note('chant', 1, 3.5, 0.5, 'E4', 112);
    w.note('chant', 1, 3.5, 0.5, 'B4', 106);
  });
}

type Section = 'rise' | 'call' | 'drive' | 'turn' | 'break';
/** The sections a take may lead to, and those a phase may open on: rising, or straight into the crew's chant. */
const SECTIONS: Readonly<Record<Section, { readonly next: readonly Section[]; readonly opens?: boolean }>> = {
  rise: { next: ['call', 'drive', 'turn'], opens: true },
  call: { next: ['call', 'drive', 'turn', 'break'] },
  drive: { next: ['call', 'turn', 'break'] },
  turn: { next: ['call', 'drive', 'break'] },
  break: { next: ['rise', 'call', 'drive'], opens: true },
};
/** The war turned: the motif over A minor and D minor before F presses on E again. */
const TURN = progression('Am Dm C F Am F Bdim Em');
/** Each phase's takes: a section and the crew's feel it plays in, no two of a section in one feel. */
const PHASE_TAKES: readonly (readonly [Section, number])[] = [
  ['rise', 0],
  ['rise', 2],
  ['call', 0],
  ['call', 1],
  ['call', 2],
  ['drive', 1],
  ['drive', 2],
  ['turn', 2],
  ['turn', 0],
  ['break', 1],
  ['break', 0],
];

/** The bells tolled in a feel: once at the take's head, E then F a half bar apart, or soft every other bar. */
function tolls(w: Write, bar: number, low: string, feel: number): void {
  if (feel === 0 && bar === 0) w.note('bells', bar, 0, 4, low, 94);
  if (feel === 1 && bar % 4 === 0) w.note('bells', bar, 0, 3, bar ? 'F3' : low, 90);
  if (feel === 2 && bar % 2 === 0) w.note('bells', bar, 0, 2, bar === 6 ? 'F3' : low, 80);
}

/** The shrieks: through a phase's driven and turned takes (the third's called ones too) on even bars, odd bars or the
 *  last four, as the feel has them; elsewhere, in two feels, a soft one now and then, the danger's colour. */
function shrieking(w: Write, bar: number, number: number, section: Section, feel: number): void {
  const loud = number >= 2 && (section === 'drive' || section === 'turn' || (number >= 3 && section === 'call'));
  const struck = [bar % 2 === 0, bar % 2 === 1, bar >= 4][feel] ?? false;
  if (loud && struck) shrieks(w, bar, 62 + number * 4);
  else if (!loud && ((feel === 1 && bar === 6) || (feel === 2 && bar % 4 === 3))) shrieks(w, bar, 44 + number * 2);
}

/** A take of a phase: the war's bed in the feel, the drums climbing (the breakdown's taiko and toms alone), the low
 *  strings, the timpani and the hits, the bells, a braam at each eight (each four in the third), the swell into the
 *  next take, the chant from the second phase on, the shrieks; and the motif: on the brass rising, the horn answering
 *  it, hammered twice with the strings over it when driven, the horn leading over the turned chords, low and alone in
 *  the breakdown. */
function phaseTake(w: Write, number: 1 | 2 | 3, bpm: number, section: Section, feel: number): void {
  const harmony = section === 'turn' ? TURN : number === 3 ? WAR_THREE : WAR;
  const [rise, broken, height] = [section === 'rise', section === 'break', section === 'drive'];
  for (let bar = 0; bar < 8; bar++) {
    const name: ChordName = harmony[bar] ?? 'Em';
    const tones = CHORDS[name];
    const driven = (number >= 2 || !rise) && !broken;
    // A rising take's organ swells into the fight bar by bar; a driven one leans in.
    const organ = (1 + 0.1 * number) * (rise ? 0.7 + bar * 0.05 : height ? 1.15 : 1);
    bed(w, bar, name, { drive: driven ? 2 : 1, choir: number >= 2 || height, organ, vel: 1 + 0.03 * number, feel });
    if (broken) {
      for (const beat of FEELS[feel]?.surdo ?? []) w.hit('surdo', bar, beat, 104);
      w.hit('lowTom', bar, 3.5, 84);
      if (bar === 7) rollDrum(w, 'snare', bar, 2, 2, 60, 118);
    } else drums(w, bar, number >= 3 || height ? 3 : 2, feel);
    spiccato(w, bar, name, driven, 84 + number * 4 - (broken ? 12 : 0), feel);
    const strokes = broken ? (bar % 2 ? 0 : 1) : number >= 3 ? 8 : 2;
    for (let i = 0; i < strokes; i++)
      w.note('timpani', bar, i * (number >= 3 ? 0.5 : 2), 0.45, tones.timp, i === 0 ? 112 : 96);
    if (!broken)
      for (const n of tones.stab) {
        w.note('hit', bar, 0, 1, n, 104);
        if (number >= 2) w.note('hit', bar, 2.5, 0.5, n, 98);
      }
    tolls(w, bar, number === 3 ? 'B2' : 'E3', feel);
    if (!broken && bar % (number >= 3 ? 4 : 8) === 0) braam(w, bar, name, 108 + number * 4);
    if (bar === 7) swellInto(w, 8, bpm, 90 + number * 4);
    if (number >= 3 || (number >= 2 && !rise) || broken)
      chant(w, bar, name, number >= 3 && !broken ? 'b' : 'a', 86 + number * 4 - (broken ? 10 : 0));
    shrieking(w, bar, number, section, feel);
    if (section === 'turn' && bar === 7) rollDrum(w, 'snare', bar, 2, 2, 70, 122);
  }
  if (section === 'break') {
    line(w, 4, MOTIF.slice(0, 2), 'horn', 96, -1);
    if (number >= 3) line(w, 6, MOTIF.slice(0, 2), 'brass', 100, -1);
  } else if (section === 'turn') {
    line(w, 0, MOTIF, 'horn', 108 + number * 2);
    line(w, 4, MOTIF, 'brass', 106 + number * 2, -1);
    line(w, 6, MOTIF.slice(0, 2), 'strings', 100, 1);
  } else {
    line(w, 0, MOTIF, 'brass', 112 + number * 2);
    if (height) line(w, 4, MOTIF, 'brass', 114 + number * 2);
    if (section === 'call' || number >= 2) line(w, 4, MOTIF, 'horn', 108);
    if (height || (number >= 3 && section === 'call')) line(w, 4, MOTIF, 'strings', 100, 1);
  }
}

/** A phase, in takes. */
function phase(number: 1 | 2 | 3): Song {
  const bpm = [138, 144, 152][number - 1] ?? 138;
  const level = [1.45, 1.56, 1.64][number - 1];
  return makeForm(
    { ...SPEC, name: `boarding-${number}`, bpm, level, press: press([5.2, 5.4, 5.8][number - 1] ?? 5.2) },
    PHASE_TAKES.map(([section, feel]): TakeSpec<Track, Drum> => {
      const { next, opens } = SECTIONS[section];
      return { section, bars: 8, next, opens, write: (w) => phaseTake(w, number, bpm, section, feel) };
    }),
  );
}

type Stand = 'count' | 'height' | 'hammer';
/** The last stand's sections: E against F counted, the same at its height, and the half step hammered from F. */
const STAND: Readonly<Record<Stand, { harmony: readonly ChordName[]; next: readonly Stand[]; opens?: boolean }>> = {
  count: { harmony: COUNT, next: ['height', 'hammer'], opens: true },
  height: { harmony: COUNT, next: ['count', 'hammer'] },
  hammer: { harmony: progression('F Em F Em Dm F Bdim Em'), next: ['count', 'height'], opens: true },
};
/** The wood blocks over a bar in a feel: every eighth, the 3-3-2, or the second half in sixteenths. */
const WOODS = [
  Array.from({ length: 8 }, (unused, i) => i * 0.5),
  [0, 0.75, 1.5, 2, 2.75, 3.5],
  [0, 1, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75],
] as const;

/** A take of the last stand: the bed driven in its feel, the drums at their hardest, the bell counting every bar
 *  (and its F in the hammer), the wood blocks, the hits, the chant in eighths, the shrieks rising at the height and
 *  on the hammer's even bars, a braam each four, the swell; the broken fanfare every second bar on the brass, an
 *  octave up at the height, traded between the horn and the low brass in the hammer. */
function standTake(w: Write, section: Stand, feel: number): void {
  const { harmony } = STAND[section];
  for (let bar = 0; bar < 8; bar++) {
    const name: ChordName = harmony[bar] ?? 'Em';
    const tones = CHORDS[name];
    bed(w, bar, name, { drive: 2, choir: true, vel: 1.08, feel });
    drums(w, bar, 3, feel);
    spiccato(w, bar, name, true, 96, feel);
    w.note('bells', bar, 0, 2, 'E3', section === 'height' ? 100 + bar * 2 : 100);
    if (section === 'hammer') w.note('bells', bar, 2, 2, 'F3', 92);
    (WOODS[feel] ?? WOODS[0]).forEach((beat, i) => w.hit(i % 2 ? 'woodLo' : 'woodHi', bar, beat, i % 2 ? 84 : 100));
    for (const n of tones.stab) {
      w.note('hit', bar, 0, 1, n, 108);
      w.note('hit', bar, 2, 1, n, 100);
    }
    chant(w, bar, name, 'b', 98);
    if (section === 'height') shrieks(w, bar, 70 + bar * 4);
    if (section === 'hammer' && bar % 2 === 0) shrieks(w, bar, 72);
    if (bar % 4 === 0) braam(w, bar, name, 118);
    if (bar === 7) swellInto(w, 8, 160, 100);
  }
  for (let bar = 0; bar < 8; bar += 2)
    if (section === 'hammer') line(w, bar, BROKEN, bar % 4 ? 'brass' : 'horn', 114, bar % 4 ? -1 : 0);
    else line(w, bar, BROKEN, 'brass', 116, section === 'height' ? 1 : 0);
}

/** The last stand: E against F a bar each, the bell tolling, the broken fanfare hammered, in takes. */
const lastStand = (): Song =>
  makeForm(
    { ...SPEC, name: 'boarding-last', bpm: 160, level: 1.68, press: press(5.9) },
    (['count', 'height', 'hammer'] as const).flatMap((section, nth) =>
      [0, 1, 2].map((shift): TakeSpec<Track, Drum> => {
        const { next, opens } = STAND[section];
        return { section, bars: 8, next, opens, write: (w) => standTake(w, section, (nth + shift) % 3) };
      }),
    ),
  );

/** The end, the player fallen: the last braam, the progression falling under the fanfare's broken notes, the strings'
 *  lament a step a bar from E5 to F4, slowing to nothing in its own time, the last four bars the organ alone. */
function end(): Song {
  return makeSong({ ...SPEC, name: 'boarding-end', bpm: 70, bars: 12, level: 1.4, press: press(4.6) }, (w) => {
    braam(w, 0, 'Em', 124);
    for (let bar = 0; bar < 12; bar++) {
      const fade = Math.max(0.25, 1 - bar / 12);
      if (bar < 8) bed(w, bar, END[bar % 8] ?? 'Em', { choir: bar < 6, organ: fade, vel: fade });
      else for (const n of CHORDS.Em.pad) w.note('organ', bar, 0, 4, n, 70 * fade);
    }
    notes('E5 D5 C5 B4 A4 G4 F4').forEach((n, i) => w.note('strings', i + 1, 0, 3.8, n, 92 - i * 7));
    for (let i = 0; i < 8; i++) w.note('timpani', 0, i * 0.5, 0.45, 'E2', 100 - i * 6);
    line(w, 1, BROKEN, 'horn', 100);
    line(w, 4, tune('G4:2 F4:2'), 'horn', 88);
    w.note('bells', 7, 0, 4, 'E3', 84);
  });
}

/** The hymn, the boss beaten: the fanfare whole on the horn in E major over the choir and the organ, the harp climbing
 *  each chord in eighths, the timpani's soft roll into each four; no drums. */
function hymn(): Song {
  return makeSong({ ...SPEC, name: 'boarding-hymn', bpm: 72, bars: 16, level: 1.25, press: press(4.2) }, (w) => {
    for (let bar = 0; bar < 16; bar++) {
      const name = HYMN[bar % 8] ?? 'E';
      const up = CHORDS[name].str.map(midiNote);
      bed(w, bar, name, { choir: true, organ: 1.2 });
      [0, 1, 2, 3, 4, 5, 4, 3].forEach((j, i) =>
        w.note('harp', bar, i * 0.5, 1, (up[j % 3] ?? 0) + 12 * Math.floor(j / 3), 66 + (i === 0 ? 10 : 0)),
      );
      if (bar % 4 === 3) rollNote(w, 'timpani', bar, 2, 2, 'E2', 36, 72);
    }
    line(w, 0, FANFARE, 'horn', 104);
    line(w, 4, FANFARE, 'horn', 108);
    line(w, 8, FANFARE, 'brass', 100, -1);
    line(w, 12, FANFARE, 'horn', 112);
    w.note('bells', 15, 0, 4, 'E5', 90);
  });
}

/** The Boarding's songs: its wake, three phases and last stand, the hymn for the boss's fall and the end for the
 *  player's. */
export const boardingScore = () => ({
  wake: wake(),
  phases: [phase(1), phase(2), phase(3)] as readonly Song[],
  last: lastStand(),
  fallen: hymn(),
  end: end(),
});
