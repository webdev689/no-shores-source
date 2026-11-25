// The music's sampled voices: a track or a drum played on a recording the owner picked from Freesound (a `music.*`
// cue) instead of the FM bank. A pitched cue plays each note at playbackRate 2^((note - root)/12) from its pick's
// measured root (the `root` publish.py copies onto its entry in content/audio/sounds.json, as root.py measured it); a
// textural or percussive cue plays from the note its score calls its home. A note longer than the recording carries
// on in further plays of its middle, each crossfaded into the last at equal power; a drum lasts no longer than its
// kit drum. Every sampled voice passes a lowpass under the music's partials ceiling (`lowpassInto`). Until a
// recording has come, or while a pitched cue has no root, the caller plays the FM voice instead.

import bank from '../../../../../content/audio/sounds.json' with { type: 'json' };
import type { Sounding } from './drumVoice.ts';
import { type Sample, midiNote } from './score.ts';

/** A recording held, decoded, and the gain that levels it to the game's loudness. */
export interface Recording {
  readonly buffer: AudioBuffer;
  readonly level: number;
}
/** Where the recordings come from: the game's bank of picks (`recordingOf`), or a test's. Null until one has come. */
export type Recordings = (audio: BaseAudioContext, cue: string) => Recording | null;

/** The sampled voices' lowpass: two in a row (24 dB an octave) a little under the music's 6 kHz partials ceiling,
 *  so 8 kHz is some 20 dB down and no partial of a recording played high passes it. */
export const LOWPASS_HZ = 5600;
/** Where a recording's later plays begin, as a share of it: past its attack, into its held middle. */
const LOOP_FROM = 0.25;
/** The longest crossfade between two plays, seconds; a short recording's is a third of what it plays. */
const CROSSFADE_S = 0.3;
/** The plays one note may chain: half a minute held on a recording of a second. */
const MOST_PLAYS = 64;
const ATTACK_S = 0.01;
const RELEASE_S = 0.3;

/** A root as root.py writes it, its note and its cents off it ("C3", "C3-38", "F#2+12"), as a fractional note. */
export function rootNote(text: string): number {
  const found = /^([A-G](?:#|b)?-?\d)([+-]\d{1,2})?$/.exec(text);
  if (!found?.[1]) throw new Error(`not a root: ${text}`);
  return midiNote(found[1]) + Number(found[2] ?? 0) / 100;
}

/** Each pitched music cue's root, from the bank's entries. */
export const rootsOf = (sounds: Readonly<Record<string, { readonly root?: string }>>): ReadonlyMap<string, number> =>
  new Map(
    Object.entries(sounds).flatMap(([id, sound]) =>
      id.startsWith('music.') && sound.root ? [[id, rootNote(sound.root)]] : [],
    ),
  );
export const ROOTS = rootsOf(bank.sounds as Readonly<Record<string, { readonly root?: string }>>);

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

/** An equal-power fade: the sine's first quarter rising, or its cosine falling. */
function powerCurve(rising: boolean, points = 32): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const share = (i / (points - 1)) * (Math.PI / 2);
    curve[i] = rising ? Math.sin(share) : Math.cos(share);
  }
  return curve;
}
const RISING = powerCurve(true);
const FALLING = powerCurve(false);

/** The sampled voices' lowpass into `into`: answers the node to play into. */
export function lowpassInto(audio: BaseAudioContext, into: AudioNode): AudioNode {
  const [first, second] = [audio.createBiquadFilter(), audio.createBiquadFilter()];
  for (const filter of [first, second]) {
    filter.type = 'lowpass';
    filter.frequency.value = LOWPASS_HZ;
    filter.Q.value = Math.SQRT1_2;
  }
  first.connect(second).connect(into);
  return first;
}

/** How one note plays: its rate, from `when`, held `held` seconds, at `amp` (its velocity's gain), from `offset`
 *  seconds into the recording; a drum's, shaped as its kit drum is, rising over its `attack` and dying over its
 *  `decay`, lasting no longer than the recording. */
export interface Played {
  readonly rate: number;
  readonly when: number;
  readonly held: number;
  readonly amp: number;
  readonly drum?: { readonly attack: number; readonly decay: number };
  readonly offset?: number;
}

/**
 * Plays one note of a sampled voice into `connect` (the track's lowpass, level and place), held then released; a
 * drum sounds its recording through, cut at its kit drum's length. Answers what is sounding, to be stopped with the
 * song.
 */
export function sampledNote(
  audio: BaseAudioContext,
  recording: Recording,
  sample: Sample,
  { rate, when, held, amp, drum, offset = 0 }: Played,
  connect: (gain: AudioNode) => AudioNode,
): Sounding {
  const recorded = recording.buffer.duration - offset;
  const length = drum ? Math.min(drum.attack + drum.decay, recorded / rate) : held + (sample.release ?? RELEASE_S);
  const hold = drum ? Math.min(drum.attack, length) : held;
  const end = when + length;
  const top = Math.max(0.0001, amp * recording.level * (sample.gain ?? 1));
  const envelope = audio.createGain();
  const attackEnd = when + Math.min(drum ? hold : (sample.attack ?? ATTACK_S), hold);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.linearRampToValueAtTime(top, attackEnd);
  envelope.gain.setValueAtTime(top, Math.max(attackEnd, when + hold));
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  const out = connect(envelope);
  const sources: AudioBufferSourceNode[] = [];
  for (const play of playsOf(recorded, rate, length)) {
    const source = audio.createBufferSource();
    source.buffer = recording.buffer;
    source.playbackRate.value = rate;
    const begin = when + play.at;
    let into: AudioNode = envelope;
    if (play.fadeIn > 0 || play.fadeOut > 0) {
      const fade = audio.createGain();
      fade.gain.setValueAtTime(play.fadeIn > 0 ? 0 : 1, begin);
      if (play.fadeIn > 0) fade.gain.setValueCurveAtTime(RISING, begin, play.fadeIn);
      const fadeFrom = begin + play.length - play.fadeOut;
      if (play.fadeOut > 0 && fadeFrom < end && fadeFrom >= begin + play.fadeIn)
        fade.gain.setValueCurveAtTime(FALLING, fadeFrom, play.fadeOut);
      fade.connect(envelope);
      into = fade;
    }
    source.connect(into);
    source.start(begin, offset + play.offset);
    source.stop(Math.min(end, begin + play.length) + 0.02);
    sources.push(source);
  }
  const last = sources[sources.length - 1];
  if (last) last.onended = () => out.disconnect();
  return { endsAt: end, stop: () => sources.forEach((source) => source.stop()) };
}
