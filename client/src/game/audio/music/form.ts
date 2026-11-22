// A fight song's form: its music written as takes, stretches of whole bars, which the player strings together as it
// plays. Each take names its section and the sections that may follow it; the takes of one section share its harmony
// and its tune and differ in how they are played (the drums, the bass, the voicing, the danger's figure, who carries
// the tune), so a fight never plays the same bars over for minutes. The arranger chooses each next take at its seam,
// never the take just played, a pairing not yet heard first; and a song opens on a take other than its last opening.
// The arranger remembers what each song has played, across fights, so a short fight does not hear the last one's.

import { type Edge, type Form, LOOPED, type Song, type SongSpec, type Take, type Writer, makeSong } from './score.ts';

/** A take as a score writes it: its section, its bars, the sections that may follow it, whether it may open the song,
 *  and its notes, laid with bars counted from its own first. */
export interface TakeSpec<T extends string, D extends string> {
  readonly section: string;
  readonly bars: number;
  readonly next: readonly string[];
  readonly opens?: boolean;
  readonly write: (writer: Writer<T, D>) => void;
}

/** A writer for one take: a note laid past either end of it runs round within it where the song's edge wraps and is
 *  dropped where it does not, and one held past its end stops there where the edge holds. */
function within<T extends string, D extends string>(
  writer: Writer<T, D>,
  take: Take,
  beatsPerBar: number,
  edge: Edge,
): Writer<T, D> {
  const length = take.bars * beatsPerBar;
  const place = (bar: number, beat: number): number | null => {
    const spot = bar * beatsPerBar + beat;
    if (edge.wrap) return ((spot % length) + length) % length;
    return spot < 0 || spot >= length ? null : spot;
  };
  return {
    note(track, bar, beat, beats, pitch, velocity) {
      const spot = place(bar, beat);
      if (spot !== null)
        writer.note(track, take.first, spot, edge.hold ? Math.min(beats, length - spot) : beats, pitch, velocity);
    },
    hit(drum, bar, beat, velocity) {
      const spot = place(bar, beat);
      if (spot !== null) writer.hit(drum, take.first, spot, velocity);
    },
  };
}

/** A song made of `takes`, laid end to end: each take's edges are the song's edge, and the whole is one song, so its
 *  ceiling and its tracks are the same in every take. A take nothing may follow, or a song with fewer than two ways
 *  to open, is refused: the arranger could not keep it from repeating. */
export function makeForm<T extends string, D extends string>(
  spec: Omit<SongSpec<T, D>, 'bars'>,
  takes: readonly TakeSpec<T, D>[],
): Song {
  const { beatsPerBar = 4, edge = LOOPED } = spec;
  let first = 0;
  const laid = takes.map(({ section, bars, next, opens = false }): Take => {
    const take = { section, first, bars, next, opens };
    first += bars;
    return take;
  });
  const form = { takes: laid };
  laid.forEach((take, index) => {
    if (candidates(form, index).length === 0) throw new Error(`${spec.name}: nothing may follow ${take.section}`);
  });
  if (laid.filter((take) => take.opens).length < 2) throw new Error(`${spec.name}: fewer than two openings`);
  const whole = { ...edge, wrap: false, clip: true };
  const song = makeSong({ ...spec, bars: first, edge: whole }, (writer) =>
    takes.forEach((take, index) => {
      const placed = laid[index];
      if (placed) take.write(within(writer, placed, beatsPerBar, edge));
    }),
  );
  return { ...song, form };
}

/** The takes that may follow take `from`: those of the sections it names, never itself. */
function candidates(form: Form, from: number): number[] {
  const next = form.takes[from]?.next ?? [];
  return form.takes.flatMap((take, index) => (index !== from && next.includes(take.section) ? [index] : []));
}

/** What the arranger remembers of a song: the takes it played, oldest first, and the take it last opened on. */
export interface Heard {
  readonly takes: readonly number[];
  readonly opened: number | null;
}
export const UNHEARD: Heard = { takes: [], opened: null };
/** The takes remembered, with the breaks between fights: ten to twenty minutes of a song. */
const REMEMBERED = 64;

/** When `take` was last heard, as its place in what was heard (-1 never): the lower, the fresher. */
const lastHeard = (heard: Heard, take: number): number => heard.takes.lastIndexOf(take);

/** Of `choices`, those of the freshest `tier` (lower is fresher), and of them by the die one heard longest ago: any
 *  never heard, else one of the older half. */
function freshest(
  choices: readonly number[],
  tier: (take: number) => number,
  heard: Heard,
  random: () => number,
): number {
  const best = Math.min(...choices.map(tier));
  const ranked = choices
    .filter((take) => tier(take) === best)
    .sort((one, other) => lastHeard(heard, one) - lastHeard(heard, other));
  const never = ranked.filter((take) => lastHeard(heard, take) < 0);
  const pool = never.length > 0 ? never : ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 2)));
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? choices[0] ?? 0;
}

/** The take a song opens on: one that opens, never the last opening while there is another, one heard longest ago. */
export function openingOf(form: Form, heard: Heard, random: () => number): number {
  const opens = form.takes.flatMap((take, index) => (take.opens ? [index] : []));
  const fresh = opens.filter((take) => take !== heard.opened);
  return freshest(fresh.length > 0 ? fresh : opens, () => 0, heard, random);
}

/** The take after `from`: one its section may lead to, never itself; a pairing never heard before any heard (else
 *  the one heard longest ago), and of those a take heard longest ago. */
export function takeAfter(form: Form, from: number, heard: Heard, random: () => number): number {
  const paired = (take: number): number => {
    for (let i = heard.takes.length - 1; i > 0; i--)
      if (heard.takes[i] === take && heard.takes[i - 1] === from) return i;
    return -1;
  };
  return freshest(candidates(form, from), paired, heard, random);
}

/** Between one fight's takes and the next's in what was heard: no take follows another across it. */
const BREAK = -1;

/** `heard` with `take` played after it, as an opening (after a break) or not. */
export function hearing(heard: Heard, take: number, opening: boolean): Heard {
  const takes = opening ? [...heard.takes, BREAK, take] : [...heard.takes, take];
  return { takes: takes.slice(-REMEMBERED), opened: opening ? take : heard.opened };
}

/** Chooses the takes of every song with a form, remembering each song's own across its fights. */
export class Arranger {
  private readonly random: () => number;
  private readonly heard = new Map<Song, Heard>();

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** The take `song` opens on, or null for a song without a form. */
  opening(song: Song): number | null {
    if (!song.form) return null;
    const take = openingOf(song.form, this.memory(song), this.random);
    this.heard.set(song, hearing(this.memory(song), take, true));
    return take;
  }

  /** The take `song` plays after take `from`. */
  after(song: Song, from: number): number {
    if (!song.form) return from;
    const take = takeAfter(song.form, from, this.memory(song), this.random);
    this.heard.set(song, hearing(this.memory(song), take, false));
    return take;
  }

  private memory(song: Song): Heard {
    return this.heard.get(song) ?? UNHEARD;
  }
}
