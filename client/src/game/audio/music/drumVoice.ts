// A drum hit as the song player builds it: a sine falling in pitch or a band of noise from the bank, and, for a song's
// own drum, a beater's click and a skin's body over it. Pure Web Audio: the player says where the sound goes.

import { drumOf } from './fmBank.ts';
import type { KitDrum } from './score.ts';

/** A built sound: when it has rung out, and how to cut it short. */
export interface Sounding {
  readonly endsAt: number;
  stop(): void;
}

/** Where a built sound goes: its last gain into the channel, answering the node to let go of once it has ended. */
export type Connect = (gain: AudioNode) => AudioNode;

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
/** One second of white noise, made once for an audio context and shared by every drum on it. */
function noiseOf(audio: BaseAudioContext): AudioBuffer {
  const made = noises.get(audio);
  if (made) return made;
  const length = Math.floor(audio.sampleRate);
  const noise = audio.createBuffer(1, length, audio.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
  noises.set(audio, noise);
  return noise;
}

/** One drum hit on `key` at `when`, `amp` loud: the bank's drum, with a song's `own` over it. */
export function buildDrum(
  audio: BaseAudioContext,
  key: number,
  own: KitDrum | undefined,
  when: number,
  amp: number,
  connect: Connect,
): Sounding {
  const drum = { ...drumOf(key), ...own };
  const gain = audio.createGain();
  let source: AudioScheduledSourceNode;
  if (drum.kind === 'noise') {
    const noise = audio.createBufferSource();
    noise.buffer = noiseOf(audio);
    // Looped, so a cymbal longer than the second of noise rings to its end.
    noise.loop = true;
    const band = audio.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = drum.hz;
    band.Q.value = drum.q ?? 1.2;
    noise.connect(band).connect(gain);
    source = noise;
  } else {
    const tone = audio.createOscillator();
    tone.frequency.setValueAtTime(drum.hz, when);
    // A skin falls in pitch, which is what makes it a drum; metal and wood hold theirs.
    if (drum.drop !== 1) tone.frequency.exponentialRampToValueAtTime(drum.hz * drum.drop, when + drum.decay);
    tone.connect(gain);
    source = tone;
  }
  const peak = amp * drum.gain;
  const ends = when + drum.attack + drum.decay;
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + drum.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, ends);
  const out = connect(gain);
  source.start(when);
  source.stop(ends + 0.02);
  const layers = own ? drumLayers(audio, drum, when, peak, connect) : [];
  source.onended = () => out.disconnect();
  return { endsAt: ends, stop: () => [source, ...layers].forEach((each) => each.stop()) };
}

/** A song's own drum's layers: the beater's click (noise about 3.2 kHz, gone in 15 ms) and a skin's body (a tone
 *  falling a third over the first of the decay). */
function drumLayers(
  audio: BaseAudioContext,
  drum: { readonly click?: number; readonly body?: number; readonly decay: number },
  when: number,
  peak: number,
  connect: Connect,
): AudioScheduledSourceNode[] {
  const made: AudioScheduledSourceNode[] = [];
  if ((drum.click ?? 0) > 0) {
    const noise = audio.createBufferSource();
    const band = audio.createBiquadFilter();
    const gain = audio.createGain();
    noise.buffer = noiseOf(audio);
    band.type = 'bandpass';
    band.frequency.value = 3200;
    band.Q.value = 0.8;
    gain.gain.setValueAtTime(peak * (drum.click ?? 0), when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.015);
    noise.connect(band).connect(gain);
    const out = connect(gain);
    noise.onended = () => out.disconnect();
    noise.start(when);
    noise.stop(when + 0.03);
    made.push(noise);
  }
  const body = drum.body ?? 0;
  if (body > 0) {
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    const length = Math.max(0.03, drum.decay * 0.6);
    tone.frequency.setValueAtTime(body, when);
    tone.frequency.exponentialRampToValueAtTime(body * 0.66, when + length);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(peak * 0.7, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
    tone.connect(gain);
    const out = connect(gain);
    tone.onended = () => out.disconnect();
    tone.start(when);
    tone.stop(when + length + 0.02);
    made.push(tone);
  }
  return made;
}
