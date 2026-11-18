// The interface's recorded sounds: the owner's picks from Freesound (content/audio/sounds.json), kept on R2 under the
// hash of their bytes. Each is fetched once the synthesiser wakes, levelled to one peak and one loudness so a quiet
// recording and a loud one sit together, and played in place of the synthesiser's own for its cue; until it has come, or where it
// cannot, the synthesiser's sound plays. Each Attribution sound carries its credit, which Settings lists.

import bank from '../../../content/audio/sounds.json' with { type: 'json' };

/** A recorded sound's credit, as the licence asks it to be given. */
export interface SoundCredit {
  readonly name: string;
  readonly author: string;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly page: string;
  /** What was done to it on its way into the game. */
  readonly changes: string;
}

/** The peak a recorded sound is levelled to, the synthesiser's own presses' loudness; and the loudness none passes, as
 *  its loudest 20 ms (-24 dBFS): a held tone levelled by its peak alone sounds far louder than a click. */
const PEAK = 0.3;
const LOUD = 0.063;
const WINDOW_S = 0.02;
const loaded = new Map<string, { readonly buffer: AudioBuffer; readonly level: number }>();
let asked = false;

/** How much a recording is turned up or down: its peak to PEAK, unless its loudest 20 ms would then pass LOUD. */
export function levelOf(channels: readonly Float32Array[], sampleRate: number): number {
  const window = Math.max(1, Math.round(sampleRate * WINDOW_S));
  let [peak, loudest] = [0, 0];
  for (const samples of channels) {
    let sum = 0;
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index] ?? 0;
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample - (index >= window ? (samples[index - window] ?? 0) ** 2 : 0);
      loudest = Math.max(loudest, sum / window);
    }
  }
  return Math.min(PEAK / Math.max(0.01, peak), LOUD / Math.max(1e-4, Math.sqrt(loudest)));
}

const channelsOf = (buffer: AudioBuffer) =>
  Array.from({ length: buffer.numberOfChannels }, (unused, channel) => buffer.getChannelData(channel));

/** Fetches and decodes every recorded sound, once. */
export function loadSamples(audio: AudioContext): void {
  if (asked) return;
  asked = true;
  for (const [id, sound] of Object.entries(bank.sounds))
    void fetch(bank.base + sound.key)
      .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(`${answer.status}`))))
      .then((bytes) => audio.decodeAudioData(bytes))
      .then((buffer) => loaded.set(id, { buffer, level: levelOf(channelsOf(buffer), buffer.sampleRate) }))
      // A sound that cannot be fetched leaves the synthesiser's own in its place.
      .catch(() => undefined);
}

/** Plays a recorded sound into `out`, its pitch at `rate`; false where it has not come, so the caller plays its own. */
export function playSample(audio: AudioContext, out: AudioNode, id: string, rate = 1): boolean {
  const sound = loaded.get(id);
  if (!sound) return false;
  const source = audio.createBufferSource();
  source.buffer = sound.buffer;
  source.playbackRate.value = rate;
  const gain = audio.createGain();
  gain.gain.value = sound.level;
  source.connect(gain).connect(out);
  source.start();
  return true;
}

/** Every recorded sound's credit, by name. */
export function soundCredits(): SoundCredit[] {
  return Object.values(bank.sounds)
    .map(({ name, author, licence, licenceUrl, page, changes }) => ({
      name,
      author,
      licence,
      licenceUrl,
      page,
      changes,
    }))
    .sort((one, other) => one.name.localeCompare(other.name));
}
