// What the family fight scores and Saltmere's theme share in their writing: notes named in a line, a progression
// written a bar at a time, and a roll. Each score keeps its own voicings: a chord is voiced by hand, for its
// instruments and the lines around it, never by rule.

import { type Tune, midiNote, tune } from './score.ts';

/** Notes by name: 'E2 B2' is [40, 47]. */
export const keys = (text: string): number[] => text.trim().split(/\s+/).map(midiNote);

/** A chord in its bar: from `beat`, for `beats`. */
export interface Held<C extends string> {
  readonly chord: C;
  readonly beat: number;
  readonly beats: number;
}

/** A progression written a bar at a time, `|` between the bars and `/` between a bar's chords, every name one of
 *  `chords`. A bar of n chords is split on `splits[n]`, the beats each begins on (evenly where it does not say). */
export function progression<C extends string>(
  text: string,
  chords: Readonly<Record<C, unknown>>,
  beatsPerBar: number,
  splits: Readonly<Record<number, readonly number[]>> = {},
): Held<C>[][] {
  return text.split('|').map((bar) => {
    const names = bar.trim().split('/');
    const starts = splits[names.length] ?? names.map((unused, i) => (i * beatsPerBar) / names.length);
    return names.map((name, i) => {
      if (!(name in chords)) throw new Error(`no chord ${name}`);
      const beat = starts[i] ?? 0;
      return { chord: name as C, beat, beats: (starts[i + 1] ?? beatsPerBar) - beat };
    });
  });
}

/** The chord a bar holds at `beat`. */
export function chordAt<C extends string>(bar: readonly Held<C>[], beat: number): C {
  let held = bar[0];
  for (const each of bar) if (each.beat <= beat + 1e-9) held = each;
  if (!held) throw new Error('a bar with no chord');
  return held.chord;
}

/** A chord held over bars: the bar and beat it begins on and how many beats it lasts. */
export interface Run<C extends string> {
  readonly chord: C;
  readonly bar: number;
  readonly beat: number;
  readonly beats: number;
}

/** The chords of `bars`, a chord that follows itself held on rather than struck again: a pad or a bass breathes
 *  where the harmony moves, not every bar. */
export function runsOf<C extends string>(bars: readonly (readonly Held<C>[])[], beatsPerBar: number): Run<C>[] {
  const runs: { -readonly [K in keyof Run<C>]: Run<C>[K] }[] = [];
  bars.forEach((held, bar) =>
    held.forEach(({ chord, beat, beats }) => {
      const last = runs[runs.length - 1];
      if (last && last.chord === chord && last.bar * beatsPerBar + last.beat + last.beats === bar * beatsPerBar + beat)
        last.beats += beats;
      else runs.push({ chord, bar, beat, beats });
    }),
  );
  return runs;
}

/** A roll from `beat` for `beats`, a stroke each `step`, its velocity rising from `low` to `high`. */
export function roll(
  play: (beat: number, velocity: number) => void,
  beat: number,
  beats: number,
  low: number,
  high: number,
  step = 0.25,
): void {
  const count = Math.round(beats / step);
  for (let i = 0; i < count; i++) play(beat + i * step, low + ((high - low) * i) / Math.max(1, count - 1));
}

/** A tune whose every bar is `beatsPerBar` long, or an error naming the bar that is not: a slip in a note's length
 *  would shift every note after it. */
export function measured(text: string, beatsPerBar: number): Tune {
  const bars = tune(text);
  bars.forEach((bar, index) => {
    const length = bar.reduce((sum, [, beats]) => sum + beats, 0);
    if (Math.abs(length - beatsPerBar) > 1e-6) throw new Error(`bar ${index + 1} is ${length} beats: ${text}`);
  });
  return bars;
}
