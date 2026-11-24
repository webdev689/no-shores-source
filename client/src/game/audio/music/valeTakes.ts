// How a Drowned Vale song's takes are written: each take a section's harmony in one of three feels, bar by bar, into
// the six layers. The bed is the bass, the organ and the drone; the danger's colour is the song's own (the bells'
// toll, the glass's swells or the waterphone) over a heartbeat and a bowed cymbal; the pulse is the low cellos'
// ostinato; the fight is the taiko, the frame drums and the timpani; the lead is the theme or its strain on the choir,
// the cello or the horn; the peak is the high choir, a boom on the downbeats, struck metal and a riser of noise into
// the bar line. A song with no drums (the Unlit Ways) keeps only its bed, its danger, a pulse and its peak.

import { chordAt, runsOf } from './craft.ts';
import { type TakeSpec, makeForm } from './form.ts';
import { type Song, type Tune, lay } from './score.ts';
import {
  BEATS,
  CHORDS,
  type Chord,
  type Drum,
  KIT,
  LEVEL,
  PRESS,
  STRAIN,
  THEME,
  TRACKS,
  type Track,
  type Write,
  harmony,
} from './valeParts.ts';

/** The danger's own colour: the chapel's bells, the Lattice's glass, or the Ways' waterphone. */
export type Colour = 'bells' | 'glass' | 'water';
/** What a section's lead plays: nothing, the theme, its strain, or the theme's head alone in a breakdown. */
export type Lead = 'none' | 'theme' | 'strain' | 'head';

export interface SectionSpec {
  readonly harmony: string;
  /** Another harmony under the same tune, which the section's third take turns to. */
  readonly turn?: string;
  readonly next: readonly string[];
  readonly opens?: boolean;
  readonly lead: Lead;
  /** A breakdown: the drums thin to the frame and the heartbeat. */
  readonly thin?: boolean;
}

/** A Vale song: its name, tempo and key (semitones over D), the danger's colour, whether it has drums, how hard its
 *  drums drive (0 to 2), how loud it plays and its sections. */
export interface ValeSong {
  readonly name: string;
  readonly bpm: number;
  readonly key: number;
  readonly colour: Colour;
  readonly drums: boolean;
  readonly drive: 0 | 1 | 2;
  readonly level?: number;
  readonly out?: number;
  /** The theme at its fullest: the horn doubles it an octave over, the choir under the strain. */
  readonly full?: boolean;
  readonly sections: Readonly<Record<string, SectionSpec>>;
}

type Hit = readonly [number, number];
/** A feel: the bass (held, struck on the beats, or pulsing in eighths, let go before each), the heartbeat, the
 *  ostinato (beat, interval over the root, velocity), the taiko's and the frame's grooves, where the bells toll, the
 *  waterphone's moments, and the organ's voicing (as written, its top an octave down, or its root an octave up). */
interface Feel {
  readonly bass: 'held' | 'struck' | 'pulse';
  readonly heart: readonly Hit[];
  readonly ostinato: readonly (readonly [number, number, number])[];
  readonly taiko: readonly Hit[];
  readonly frame: readonly Hit[];
  readonly toll: readonly number[];
  readonly water: readonly number[];
  readonly voicing: 0 | 1 | 2;
}
const FEELS: readonly Feel[] = [
  {
    bass: 'held',
    heart: [
      [0, 96],
      [0.5, 70],
    ],
    ostinato: [
      [0, 0, 100],
      [0.5, 0, 58],
      [0.75, 7, 70],
      [1.5, 0, 90],
      [2, 12, 64],
      [2.5, 0, 70],
      [3, 7, 84],
      [3.5, 0, 60],
    ],
    taiko: [
      [0, 112],
      [1.5, 78],
      [2, 100],
      [3.5, 74],
    ],
    frame: [
      [1, 70],
      [3, 76],
    ],
    toll: [0, 2],
    water: [0.5, 2.75],
    voicing: 0,
  },
  {
    bass: 'struck',
    heart: [
      [0, 96],
      [1.5, 74],
    ],
    ostinato: [
      [0, 0, 100],
      [0.75, 0, 64],
      [1.5, 7, 80],
      [2, 0, 92],
      [2.75, 3, 66],
      [3.25, 7, 70],
    ],
    taiko: [
      [0, 112],
      [0.75, 70],
      [2.5, 96],
      [3, 80],
    ],
    frame: [
      [1.5, 72],
      [2, 66],
      [3.5, 74],
    ],
    toll: [0, 1.5, 3],
    water: [1.25, 3.5],
    voicing: 1,
  },
  {
    bass: 'pulse',
    heart: [
      [0, 100],
      [0.5, 72],
      [2, 84],
    ],
    ostinato: [
      [0, 0, 100],
      [0.5, 7, 62],
      [1, 0, 84],
      [1.5, 1, 70],
      [2, 0, 94],
      [2.5, 7, 64],
      [3, 12, 78],
      [3.5, 7, 66],
    ],
    taiko: [
      [0, 112],
      [1, 84],
      [2, 104],
      [2.75, 76],
      [3.25, 82],
    ],
    frame: [
      [0.5, 64],
      [1.5, 70],
      [3.5, 78],
    ],
    toll: [1, 3],
    water: [0, 2.25, 3.25],
    voicing: 2,
  },
];

/** A chord in the song's key. */
const shifted = (chord: Chord, key: number): Chord => ({
  bass: chord.bass + key,
  pad: chord.pad.map((note) => note + key),
  choir: chord.choir.map((note) => note + key),
  bell: chord.bell.map((note) => note + key),
  glass: chord.glass.map((note) => note + key),
  root: chord.root + key,
  timp: chord.timp + key,
});

/** The organ's voicing of a chord in a feel. */
function voiced(pad: readonly number[], voicing: Feel['voicing']): number[] {
  const [low = 0, ...rest] = pad;
  const top = rest[rest.length - 1] ?? low;
  if (voicing === 1) return [top - 12, low, ...rest.slice(0, -1)];
  if (voicing === 2) return [...rest, low + 12];
  return [...pad];
}

/** The danger's colour in one bar. */
function colour(w: Write, song: ValeSong, tones: Chord, bar: number, feel: Feel, nth: number): void {
  if (song.colour === 'bells')
    feel.toll.forEach((beat, i) => {
      const note = tones.bell[(bar + nth + i) % tones.bell.length];
      if (note !== undefined) w.note('bells', bar, beat, 1.4, note, 78 - i * 8);
    });
  if (song.colour === 'glass' && (bar + nth) % 2 === 0) {
    const note = tones.glass[(Math.floor(bar / 2) + nth) % tones.glass.length];
    if (note !== undefined) w.note('glass', bar, feel.water[0] ?? 0, BEATS * 1.9, note, 72);
  }
  if (song.colour === 'water')
    feel.water.forEach((beat, i) => {
      const note = tones.glass[(bar + nth + i) % tones.glass.length];
      if (note !== undefined && (bar + i) % 2 === nth % 2) w.note('water', bar, beat, 2.5, note - 12, 66 + i * 6);
    });
}

/** A take's lead: the theme or its strain on the feel's voices, the theme answered by the cello in the third. */
function leads(w: Write, lead: Lead, nth: number, { key, full = false }: ValeSong): void {
  const map = (note: number) => note + key;
  const play = (track: Track, tune: Tune, from = 0, to = 8, octave = 0) =>
    lay(w, track, from, tune, 92, { from, to, octave, map, legato: 0.96, accent: 6 });
  if (lead === 'theme') {
    if (nth === 0) play('choir', THEME);
    if (nth === 1) play('cello', THEME, 0, 8, 1);
    if (nth === 2) {
      play('choir', THEME, 0, 4);
      play('cello', THEME, 4, 8, 1);
    }
  }
  if (lead === 'strain') {
    if (nth === 0) play('cello', STRAIN);
    if (nth === 1) play('horn', STRAIN);
    if (nth === 2) {
      play('choir', STRAIN);
      play('cello', STRAIN, 0, 8, 1);
    }
  }
  if (full && lead === 'theme') play('horn', THEME, 0, 8, 1);
  if (full && lead === 'strain' && nth !== 2) play('choir', STRAIN);
  if (lead === 'head')
    for (const from of [0, 4]) play(nth === 1 ? 'horn' : 'cello', THEME, from, from + 2, nth === 1 ? 0 : 1);
}

/** The seconds a riser swells before the bar line it lands on, in beats at `bpm`. */
const riserBeats = (bpm: number): number => ((KIT.drums.riser.attack ?? 1.6) * bpm) / 60;

/** One take: `section`'s harmony (or its turn) in feel `nth`, eight bars. */
function take(w: Write, song: ValeSong, section: SectionSpec, nth: number): void {
  const feel = FEELS[nth] ?? FEELS[0];
  if (!feel) return;
  const bars = harmony(nth === 2 && section.turn ? section.turn : section.harmony);
  const key = song.key;
  w.note('drone', 0, 0, bars.length * BEATS, 38 + key, 70);
  for (const run of runsOf(bars, BEATS)) {
    const tones = shifted(CHORDS[run.chord], key);
    for (const note of voiced(tones.pad, feel.voicing)) w.note('organ', run.bar, run.beat, run.beats, note, 70);
    for (const note of tones.choir) w.note('high', run.bar, run.beat, run.beats, note + 12, 64);
    if (song.drums && !section.thin) w.note('timpani', run.bar, run.beat, 1, tones.timp, 104);
  }
  const drums = song.drums && !section.thin;
  bars.forEach((held, bar) => {
    const tones = shifted(CHORDS[chordAt(held, 0)], key);
    if (feel.bass === 'held') w.note('bass', bar, 0, BEATS, tones.bass, 86);
    else
      for (let beat = 0; beat < BEATS; beat += feel.bass === 'struck' ? 1 : 0.5)
        w.note(
          'bass',
          bar,
          beat,
          feel.bass === 'struck' ? 0.9 : 0.4,
          shifted(CHORDS[chordAt(held, beat)], key).bass,
          beat % 2 === 0 ? 92 : 64,
        );
    colour(w, song, tones, bar, feel, nth);
    for (const [beat, velocity] of feel.heart) w.hit('heart', bar, beat, velocity);
    if ((bar + nth) % 4 === 3) w.hit('bowed', bar, 0, 70);
    if (song.drums)
      for (const [beat, lift, velocity] of feel.ostinato)
        w.note('ostinato', bar, beat, 0.4, shifted(CHORDS[chordAt(held, beat)], key).root + lift, velocity);
    else if (bar % 2 === nth % 2) w.note('ostinato', bar, 0, 1.5, tones.root - 12, 70);
    if (drums) {
      for (const [beat, velocity] of feel.taiko) w.hit('taiko', bar, beat, velocity);
      for (const [beat, velocity] of feel.frame) w.hit('frame', bar, beat, velocity);
      for (let beat = 0.25; song.drive > 0 && beat < BEATS; beat += song.drive > 1 ? 0.25 : 0.5)
        w.hit('tap', bar, beat, 40 + ((beat * 4) % 2) * 14);
      // A fill into the next take.
      if (bar === bars.length - 1) for (let i = 0; i < 4; i++) w.hit('taiko', bar, 2 + i * 0.5, 84 + i * 8);
    } else if (song.drums) w.hit('frame', bar, 0, 60);
    if (bar % 4 === 0) w.hit('boom', bar, 0, 110);
    if (bar % 4 === 3) w.hit('riser', bar, BEATS - riserBeats(song.bpm), 90);
    if (drums && bar === 0) w.hit('metal', bar, 0, 96);
  });
  leads(w, section.lead, nth, song);
}

/** A Vale song in takes: each section three times, in each feel. */
export function valeSong(song: ValeSong): Song {
  const takes = Object.entries(song.sections).flatMap(([name, section]) =>
    [0, 1, 2].map((nth): TakeSpec<Track, Drum> => ({
      section: name,
      bars: 8,
      next: section.next,
      opens: section.opens ?? false,
      write: (w) => take(w, song, section, nth),
    })),
  );
  return makeForm(
    {
      name: song.name,
      bpm: song.bpm,
      tracks: TRACKS,
      kit: KIT,
      level: song.level ?? LEVEL,
      press: { ...PRESS, out: song.out ?? PRESS.out },
    },
    takes,
  );
}
