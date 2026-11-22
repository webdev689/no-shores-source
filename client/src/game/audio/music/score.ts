// How a score is written: notes in code, in the shape a decoded MIDI song has (tick-ordered notes, one tempo, each
// note carrying its own length), on tracks that each play one General MIDI program at a level and a place, with the
// drums on a kit. Each track, and any drum, has a layer role, so the music director can bring a score in a layer at a
// time on the bar line: the bed first, then the tension, the pulse, the fight and the lead, the peak last.
//
// A score is a function that lays its notes through `makeSong`'s writer: `w.note(track, bar, beat, beats, pitch,
// velocity)` and `w.hit(drum, bar, beat, velocity)`, bars from 0, beats in quarter notes from the bar's start (a 6/8
// bar is three), velocity 1 to 127. `tune` reads a line of notes as text, and `lay` writes it on a track.

import type { Drum, FmVoice } from './fmBank.ts';
import { PERCUSSION_CHANNEL } from './fmBank.ts';

/** The clock a score is written on: ticks a quarter note. */
export const TICKS_PER_BEAT = 60;

/**
 * The layers of a score, in the order the director brings them in: `bed`, the harmony's floor (pads, the bass, a
 * drone); `tension`, the colour of danger near (bells, a swell, high strings); `pulse`, the drive (an ostinato, a
 * clock); `combat`, the fight's body (the drums, the timpani, the stabs); `lead`, the tune; `peak`, the most (the
 * choir, the orchestra hit, a theme doubled).
 */
export const ROLES = ['bed', 'tension', 'pulse', 'combat', 'lead', 'peak'] as const;
export type Role = (typeof ROLES)[number];

/** One note: when (ticks from the song's start), on which channel, its key, its velocity and its length in ticks. */
export interface Note {
  readonly tick: number;
  readonly channel: number;
  readonly note: number;
  readonly velocity: number;
  readonly duration: number;
  readonly role: Role;
}

/** A track's own instrument over its program's voice: any of the voice's fields, and an ensemble of `unison` copies
 *  (1 to 4) `cents` apart either side of the note, laid `spread` (a share of the stereo's whole) either side of the
 *  track's place, with a `sub` sine an octave under at that share. */
export interface Voice extends Partial<FmVoice> {
  readonly unison?: number;
  readonly cents?: number;
  readonly spread?: number;
  readonly sub?: number;
}

/** A song's own drum over the bank's for its key: any of its fields. */
export type KitDrum = Partial<Omit<Drum, 'kind'>>;

/** A track: its channel, General MIDI program, level and place (0 to 127, 64 the middle), layer and own voice. */
export interface Track {
  readonly channel: number;
  readonly program: number;
  readonly volume: number;
  readonly pan: number;
  readonly role: Role;
  readonly voice: Voice | null;
}

/** A compressor a song plays through, and how far it is carried after it (`out`) into a soft ceiling `ceiling`
 *  dBFS high at the full music volume: its peaks held down and the whole of it raised. */
export interface Press {
  readonly threshold: number;
  readonly knee: number;
  readonly ratio: number;
  readonly attack: number;
  readonly release: number;
  readonly out: number;
  readonly ceiling: number;
}

/** A take of a song's form: its section, its first bar and its length in bars, the sections that may follow it, and
 *  whether a song may open on it. */
export interface Take {
  readonly section: string;
  readonly first: number;
  readonly bars: number;
  readonly next: readonly string[];
  readonly opens: boolean;
}

/** A song written as takes (`makeForm`): the player strings them together as it plays, in no fixed order. */
export interface Form {
  readonly takes: readonly Take[];
}

/** A song as the player plays it. `level` is how far over the music's own level it plays (1 unless it says). A song
 *  with a `form` plays its takes as the arranger chooses them; one without loops whole. */
export interface Song {
  readonly name: string;
  readonly beatsPerMinute: number;
  readonly secondsPerTick: number;
  readonly ticksPerBar: number;
  readonly durationTicks: number;
  readonly notes: readonly Note[];
  readonly tracks: readonly Track[];
  readonly kit: { readonly volume: number; readonly drums: ReadonlyMap<number, KitDrum> };
  readonly level: number;
  readonly press: Press | null;
  readonly form?: Form;
}

/** A track as a score names it; its channel is its place in the score's list, the drums' channel passed over. */
export interface TrackSpec {
  readonly program: number;
  readonly volume: number;
  readonly pan: number;
  readonly role: Role;
  readonly voice?: Voice;
}

/** The score's drums: their level and layer, each name's key, and any drum with its own layer or its own sound. */
export interface KitSpec<D extends string> {
  readonly volume: number;
  readonly role: Role;
  readonly keys: Readonly<Record<D, number>>;
  readonly roles?: Partial<Readonly<Record<D, Role>>>;
  readonly drums?: Partial<Readonly<Record<D, KitDrum>>>;
}

/**
 * What becomes of a note at the song's edges, which loop: `wrap`, a note laid past the last bar sounds at the loop's
 * start (a pickup or an echo runs round the seam); `clip`, one laid outside the song is dropped; `hold`, a note held
 * past the end stops at it; `restrike`, a key struck again ends the note before it on that track, as a string or a
 * reed sounds once. A new score takes all of `wrap`, `hold` and `restrike`.
 */
export interface Edge {
  readonly wrap: boolean;
  readonly clip: boolean;
  readonly hold: boolean;
  readonly restrike: boolean;
}

export const LOOPED: Edge = { wrap: true, clip: false, hold: true, restrike: true };

/** The highest note a pitched track sounds, B5: from C6 up the bank's voices ring or whine. A track that reaches past
 *  it plays an octave down, the whole of it where that keeps it at or over `WHOLE_FLOOR` (its line kept whole), else
 *  only its notes over the ceiling. */
export const CEILING_NOTE = 83;
const WHOLE_FLOOR = 55;

/** `notes` under the ceiling, a note that lands on one already struck on its channel's key merged into it. */
function underCeiling<N extends { -readonly [K in keyof Note]: Note[K] }>(notes: readonly N[]): N[] {
  const byChannel = new Map<number, N[]>();
  for (const laid of notes) {
    if (laid.channel === PERCUSSION_CHANNEL) continue;
    const list = byChannel.get(laid.channel);
    if (list) list.push(laid);
    else byChannel.set(laid.channel, [laid]);
  }
  for (const list of byChannel.values()) {
    const keys = list.map((laid) => laid.note);
    let lower = 0;
    while (Math.max(...keys) - lower > CEILING_NOTE && Math.min(...keys) - lower - 12 >= WHOLE_FLOOR) lower += 12;
    for (const laid of list) {
      laid.note -= lower;
      while (laid.note > CEILING_NOTE) laid.note -= 12;
    }
  }
  const kept = new Map<string, N>();
  for (const laid of notes) {
    const slot = `${laid.tick}:${laid.channel}:${laid.note}`;
    const was = kept.get(slot);
    if (!was) kept.set(slot, laid);
    else [was.velocity, was.duration] = [Math.max(was.velocity, laid.velocity), Math.max(was.duration, laid.duration)];
  }
  return [...kept.values()];
}

export interface SongSpec<T extends string, D extends string> {
  readonly name: string;
  readonly bpm: number;
  readonly bars: number;
  /** Quarter notes a bar: 4 unless it says (a 6/8 or a 3/4 bar is 3). */
  readonly beatsPerBar?: number;
  readonly tracks: Readonly<Record<T, TrackSpec>>;
  readonly kit: KitSpec<D>;
  readonly level?: number;
  readonly press?: Press | null;
  readonly edge?: Edge;
}

export interface Writer<T extends string, D extends string> {
  note(track: T, bar: number, beat: number, beats: number, pitch: number | string, velocity: number): void;
  hit(drum: D, bar: number, beat: number, velocity: number): void;
}

const PITCH: Readonly<Record<string, number>> = {
  'C': 0,
  'C#': 1,
  'Db': 1,
  'D': 2,
  'D#': 3,
  'Eb': 3,
  'E': 4,
  'F': 5,
  'F#': 6,
  'Gb': 6,
  'G': 7,
  'G#': 8,
  'Ab': 8,
  'A': 9,
  'A#': 10,
  'Bb': 10,
  'B': 11,
};

/** A note by name: `D4` is 62, C4 middle C. */
export function midiNote(name: string): number {
  const named = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  const pitch = named?.[1] === undefined ? undefined : PITCH[named[1]];
  if (!named || pitch === undefined) throw new Error(`not a note: ${name}`);
  return 12 * (Number(named[2]) + 1) + pitch;
}

/** A tune's bars, each note its key (null for a rest) and its length in quarter notes. */
export type Tune = readonly (readonly (readonly [number | null, number])[])[];

/** A tune written as text: `'A4:1.5 D5:.5 | r:1 G4:2'`, each note its name and its length in quarter notes, `r` a
 *  rest, the bars split by `|`. */
export function tune(text: string): Tune {
  return text.split('|').map((bar) =>
    bar
      .trim()
      .split(/\s+/)
      .map((token): readonly [number | null, number] => {
        const [name = '', length] = token.split(':');
        const beats = Number(length);
        if (!(beats > 0)) throw new Error(`no length: ${token}`);
        return [name === 'r' ? null : midiNote(name), beats];
      }),
  );
}

/** How a tune is laid: `octave`s over, each note `legato` of its length, the first of each bar `accent` louder, `late`
 *  beats behind (an echo), bars `from` to `to` of it, and each key `map`ped (a harmony under it). */
export interface Laying {
  readonly octave?: number;
  readonly legato?: number;
  readonly accent?: number;
  readonly late?: number;
  readonly from?: number;
  readonly to?: number;
  readonly map?: (note: number) => number;
}

/** Lays a tune's bars on a track from bar `first`. */
export function lay<T extends string, D extends string>(
  writer: Writer<T, D>,
  track: T,
  first: number,
  bars: Tune,
  velocity: number,
  { octave = 0, legato = 0.92, accent = 8, late = 0, from = 0, to = bars.length, map = (note) => note }: Laying = {},
): void {
  for (let index = from; index < to; index++) {
    let beat = 0;
    (bars[index] ?? []).forEach(([note, beats], nth) => {
      if (note !== null)
        writer.note(
          track,
          first + index - from,
          beat + late,
          beats * legato,
          map(note) + 12 * octave,
          velocity + (nth === 0 ? accent : 0),
        );
      beat += beats;
    });
  }
}

/**
 * A song, its notes laid by `write`. One note a key a moment: a note laid where its track already strikes that key is
 * one note, its loudest and its longest. The notes come out in time order, each with its track's layer (a drum its
 * own where it has one).
 */
export function makeSong<T extends string, D extends string>(
  spec: SongSpec<T, D>,
  write: (writer: Writer<T, D>) => void,
): Song {
  const { name, bpm, bars, beatsPerBar = 4, kit, level = 1, press = null, edge = LOOPED } = spec;
  const named = Object.keys(spec.tracks) as T[];
  const channels = new Map(named.map((track, index) => [track, index < PERCUSSION_CHANNEL ? index : index + 1]));
  const length = bars * beatsPerBar * TICKS_PER_BEAT;
  const struck = new Map<number, { -readonly [K in keyof Note]: Note[K] }>();
  const notes: { -readonly [K in keyof Note]: Note[K] }[] = [];
  const place = (channel: number, role: Role, bar: number, beat: number, beats: number, key: number, loud: number) => {
    const raw = Math.round((bar * beatsPerBar + beat) * TICKS_PER_BEAT);
    if (edge.clip && (raw < 0 || raw >= length)) return;
    const tick = edge.wrap ? ((raw % length) + length) % length : raw;
    const velocity = Math.max(1, Math.min(127, Math.round(loud)));
    const asked = Math.round(beats * TICKS_PER_BEAT);
    const duration = Math.max(1, edge.hold ? Math.min(length - tick, asked) : asked);
    const slot = (tick * 16 + channel) * 128 + key;
    const was = struck.get(slot);
    if (was) {
      was.velocity = Math.max(was.velocity, velocity);
      was.duration = Math.max(was.duration, duration);
      return;
    }
    const laid = { tick, channel, note: key, velocity, duration, role };
    struck.set(slot, laid);
    notes.push(laid);
  };
  write({
    note(track, bar, beat, beats, pitch, velocity) {
      const role = spec.tracks[track].role;
      place(
        channels.get(track) ?? 0,
        role,
        bar,
        beat,
        beats,
        typeof pitch === 'number' ? pitch : midiNote(pitch),
        velocity,
      );
    },
    hit(drum, bar, beat, velocity) {
      place(PERCUSSION_CHANNEL, kit.roles?.[drum] ?? kit.role, bar, beat, 0.25, kit.keys[drum], velocity);
    },
  });
  const heard = underCeiling(notes);
  if (edge.restrike) {
    const byKey = new Map<number, (typeof notes)[number][]>();
    for (const laid of heard)
      if (laid.channel !== PERCUSSION_CHANNEL) {
        const key = laid.channel * 128 + laid.note;
        const list = byKey.get(key);
        if (list) list.push(laid);
        else byKey.set(key, [laid]);
      }
    for (const list of byKey.values()) {
      list.sort((one, other) => one.tick - other.tick);
      list.forEach((laid, index) => {
        const next = list[index + 1];
        if (next) laid.duration = Math.max(1, Math.min(laid.duration, next.tick - laid.tick));
      });
    }
  }
  heard.sort((one, other) => one.tick - other.tick);
  const tracks = named.map((track): Track => {
    const { program, volume, pan, role, voice = null } = spec.tracks[track];
    return { channel: channels.get(track) ?? 0, program, volume, pan, role, voice };
  });
  const drums = new Map<number, KitDrum>();
  for (const drum of Object.keys(kit.drums ?? {}) as D[]) {
    const own = kit.drums?.[drum];
    if (own) drums.set(kit.keys[drum], own);
  }
  return {
    name,
    beatsPerMinute: bpm,
    secondsPerTick: 60 / (bpm * TICKS_PER_BEAT),
    ticksPerBar: beatsPerBar * TICKS_PER_BEAT,
    durationTicks: length,
    notes: heard,
    tracks,
    kit: { volume: kit.volume, drums },
    level,
    press,
  };
}

/** A song's length in seconds. */
export const songSeconds = (song: Song): number => song.durationTicks * song.secondsPerTick;
