// How loud a recording is, measured once from its samples where they are decoded: its peak, the root mean square of
// its loudest stretch over a few set windows, and where that stretch lies. The game levels and matches each recording
// by these numbers alone, so the samples need be kept only where they play.

/** The peak a recorded sound is levelled to, the interface's presses' loudness; and the loudness none passes, as
 *  its loudest 20 ms (-24 dBFS): a held tone levelled by its peak alone sounds far louder than a click. */
const PEAK = 0.3;
const LOUD = 0.063;
const WINDOW_S = 0.02;

/** The windows every recording is measured over: its own level's 20 ms, a one-shot's and thunder's 0.4 s
 *  (`cinema/ambience.ts`, `game/audio/ambience/player.ts`), a story bed's 4 s, and the world's beds' whole. */
export const MEASURED_WINDOWS: readonly number[] = [WINDOW_S, 0.4, 4, Infinity];

/** A sound's peak, the root mean square of its loudest `windowS` seconds (of all of it, where it is shorter), and the
 *  seconds into it that loudest stretch is centred on. */
export interface Measure {
  readonly peak: number;
  readonly loud: number;
  readonly centre: number;
}

/** What matching a recording's level asks of a measure. */
export type Loudness = Pick<Measure, 'peak' | 'loud'>;

/** Everything the game reads of a recording's samples: its level, its rush, and its measure over each window. */
export interface Measured {
  readonly level: number;
  readonly rush: number;
  /** By window, as `String(windowS)`. */
  readonly measures: Readonly<Record<string, Measure>>;
}

export function measureOf(channels: readonly Float32Array[], sampleRate: number, windowS: number): Measure {
  let [peak, loudest, centre] = [0, 0, 0];
  for (const samples of channels) {
    const window = Math.min(samples.length, Math.max(1, Math.round(sampleRate * windowS)));
    let sum = 0;
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index] ?? 0;
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample - (index >= window ? (samples[index - window] ?? 0) ** 2 : 0);
      if (index >= window - 1 && sum / window > loudest)
        [loudest, centre] = [sum / window, Math.max(0, index - window / 2) / sampleRate];
    }
  }
  return { peak, loud: Math.sqrt(loudest), centre };
}

/** How much a recording is turned up or down: its peak to PEAK, unless its loudest 20 ms would then pass LOUD. */
const levelFrom = ({ peak, loud }: Loudness): number =>
  Math.min(PEAK / Math.max(0.01, peak), LOUD / Math.max(1e-4, loud));

export const levelOf = (channels: readonly Float32Array[], sampleRate: number): number =>
  levelFrom(measureOf(channels, sampleRate, WINDOW_S));

/** The seconds into a recording its loudest 20 ms come: a whoosh's rush. */
export const rushOf = (channels: readonly Float32Array[], sampleRate: number): number =>
  measureOf(channels, sampleRate, WINDOW_S).centre;

/** A recording measured over every window the game asks of it. */
export function measuredOf(channels: readonly Float32Array[], sampleRate: number): Measured {
  const measures = Object.fromEntries(
    MEASURED_WINDOWS.map((windowS) => [String(windowS), measureOf(channels, sampleRate, windowS)]),
  );
  const own = measures[String(WINDOW_S)] ?? { peak: 0, loud: 0, centre: 0 };
  return { level: levelFrom(own), rush: own.centre, measures };
}

/** A recording's measure over `windowS`, or over the measured window nearest it where it was not measured over that
 *  one. */
export function measureOver(measured: Measured, windowS: number): Measure {
  const exact = measured.measures[String(windowS)];
  if (exact) return exact;
  const distance = (each: number) => Math.abs(Math.log(Math.min(each, 1e6)) - Math.log(Math.min(windowS, 1e6)));
  const nearest = [...MEASURED_WINDOWS].sort((one, other) => distance(one) - distance(other))[0] ?? WINDOW_S;
  return measured.measures[String(nearest)] ?? { peak: 0, loud: 0, centre: 0 };
}

/** The gain that sets a recording (`mine`) as loud as the sound it stands in for (`theirs`), its peak never past
 *  `most` (in the same units; that sound's own peak where not given). */
export const matchedLevel = (mine: Loudness, theirs: Loudness, most = theirs.peak): number =>
  Math.min(theirs.loud / Math.max(1e-6, mine.loud), most / Math.max(1e-6, mine.peak));

/** Each channel's samples of a decoded buffer, read in place. */
export const channelsOf = (buffer: AudioBuffer): Float32Array[] =>
  Array.from({ length: buffer.numberOfChannels }, (unused, channel) => buffer.getChannelData(channel));
