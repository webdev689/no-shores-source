// The music's sampled voices: a track or a drum played on a recording the owner picked from Freesound (a `music.*`
// cue) instead of the FM bank. A pitched cue plays each note at playbackRate 2^((note - root)/12) from its pick's
// measured root (the cue's `root` in content/audio/freesound.json, written by tools/freesound/root.py); a textural or
// percussive cue plays from the note its score calls its home. A note longer than the recording carries on in
// further plays of its middle, each crossfaded into the last at equal power. Every sampled voice passes a lowpass at
// the music's partials ceiling, so no partial of a recording played high passes it. Until a recording has come, or
// while a pitched cue has no root, the caller plays the FM voice instead.

import listed from '../../../../../content/audio/freesound.json' with { type: 'json' };
import type { Sounding } from './drumVoice.ts';
import { type Sample, midiNote } from './score.ts';

/** A recording held, decoded, and the gain that levels it to the game's loudness. */
export interface Recording {
  readonly buffer: AudioBuffer;
  readonly level: number;
}
/** Where the recordings come from: the game's bank of picks (`recordingOf`), or a test's. Null until one has come. */
export type Recordings = (audio: BaseAudioContext, cue: string) => Recording | null;

/** The highest a sampled voice's partials reach, hertz: the same ceiling the FM bank holds its modulation under. */
export const SAMPLE_TOP_HZ = 6000;
/** Where a recording's later plays begin, as a share of it: past its attack, into its held middle. */
const LOOP_FROM = 0.25;
/** The longest crossfade between two plays, seconds; a short recording's is a third of what it plays. */
const CROSSFADE_S = 0.3;
/** The plays one note may chain: a held note of a minute on a recording of a second. */
const MOST_PLAYS = 64;
const ATTACK_S = 0.01;
const RELEASE_S = 0.3;

/** Each pitched music cue's root as its pick was measured, the cue's `root` in freesound.json ("C3"). */
export const rootsOf = (
  cues: readonly { readonly id: string; readonly root?: string }[],
): ReadonlyMap<string, number> =>
  new Map(cues.flatMap((cue) => (cue.id.startsWith('music.') && cue.root ? [[cue.id, midiNote(cue.root)]] : [])));
export const ROOTS = rootsOf(listed.cues as readonly { readonly id: string; readonly root?: string }[]);

/** The playback rate a note sounds a sampled voice at: from its home where the score names one, else from its pick's
 *  root; null while a pitched cue has no root, so the track plays its program. */
export function rateOf(sample: Sample, note: number, roots: ReadonlyMap<string, number> = ROOTS): number | null {
  const from = sample.home ?? roots.get(sample.cue);
  return from === undefined ? null : 2 ** ((note - from) / 12);
}

/** One play of a recording within a note: from `at` seconds into the note, `offset` seconds into the recording, for
 *  `length` seconds; fading in over `fadeIn` and out over `fadeOut` at its end. */
export interface Play {
  readonly at: number;
  readonly offset: number;
  readonly length: number;
  readonly fadeIn: number;
  readonly fadeOut: number;
}

/** The plays a note of `seconds` makes of a recording `recorded` seconds long at `rate`: one, or, where the note
 *  outlasts it, its middle played again, each new play crossfaded into the last. */
export function playsOf(recorded: number, rate: number, seconds: number): Play[] {
  const whole = recorded / rate;
  if (seconds <= whole) return [{ at: 0, offset: 0, length: whole, fadeIn: 0, fadeOut: 0 }];
  const offset = recorded * LOOP_FROM;
  const again = (recorded - offset) / rate;
  const fade = Math.min(CROSSFADE_S, again / 3);
  const plays: Play[] = [{ at: 0, offset: 0, length: whole, fadeIn: 0, fadeOut: fade }];
  let ends = whole;
  while (ends < seconds && plays.length < MOST_PLAYS) {
    const begins = ends - fade;
    plays.push({ at: begins, offset, length: again, fadeIn: fade, fadeOut: fade });
    ends = begins + again;
  }
  return plays;
}

/** An equal-power fade over `points`: the sine's first quarter rising, or its cosine falling. */
function powerCurve(rising: boolean, points = 32): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const share = (i / (points - 1)) * (Math.PI / 2);
    curve[i] = rising ? Math.sin(share) : Math.cos(share);
  }
  return curve;
}

/**
 * Plays one note of a sampled voice from `when`, held `held` seconds then released, at `amp` (its velocity's gain),
 * into `connect` (the track's level and place); a drum (`whole`) sounds the recording through. Answers what is
 * sounding, to be stopped with the song.
 */
export function sampledNote(
  audio: BaseAudioContext,
  recording: Recording,
  sample: Sample,
  { rate, when, held, amp, whole = false }: { rate: number; when: number; held: number; amp: number; whole?: boolean },
  connect: (gain: AudioNode) => AudioNode,
): Sounding {
  const recorded = recording.buffer.duration;
  const release = sample.release ?? RELEASE_S;
  // A drum sounds its recording through, released over its own tail.
  const hold = whole ? Math.max(0, recorded / rate - release) : held;
  const end = when + hold + release;
  const top = Math.max(0.0001, amp * recording.level * (sample.gain ?? 1));
  const envelope = audio.createGain();
  const attackEnd = when + Math.min(sample.attack ?? ATTACK_S, hold);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.linearRampToValueAtTime(top, attackEnd);
  envelope.gain.setValueAtTime(top, Math.max(attackEnd, when + hold));
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  const lowpass = audio.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = SAMPLE_TOP_HZ;
  lowpass.Q.value = Math.SQRT1_2;
  envelope.connect(lowpass);
  const out = connect(lowpass);
  const sources: AudioBufferSourceNode[] = [];
  for (const play of playsOf(recorded, rate, end - when)) {
    const source = audio.createBufferSource();
    source.buffer = recording.buffer;
    source.playbackRate.value = rate;
    const begin = when + play.at;
    const stop = Math.min(end, begin + play.length);
    let into: AudioNode = envelope;
    if (play.fadeIn > 0 || play.fadeOut > 0) {
      const fade = audio.createGain();
      fade.gain.setValueAtTime(play.fadeIn > 0 ? 0 : 1, begin);
      if (play.fadeIn > 0) fade.gain.setValueCurveAtTime(powerCurve(true), begin, play.fadeIn);
      const fadeFrom = begin + play.length - play.fadeOut;
      if (play.fadeOut > 0 && fadeFrom < end && fadeFrom >= begin + play.fadeIn)
        fade.gain.setValueCurveAtTime(powerCurve(false), fadeFrom, play.fadeOut);
      fade.connect(envelope);
      into = fade;
    }
    source.connect(into);
    source.start(begin, play.offset);
    source.stop(stop + 0.02);
    sources.push(source);
  }
  const last = sources[sources.length - 1];
  if (last) last.onended = () => out.disconnect();
  return { endsAt: end, stop: () => sources.forEach((source) => source.stop()) };
}
