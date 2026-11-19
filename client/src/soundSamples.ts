// The game's recorded sounds, the interface's and the world's: the owner's picks from Freesound and from DFO's own
// (content/audio/sounds.json), kept on R2 under the hash of their bytes. Each is fetched once the page's sound wakes,
// levelled to one peak and one loudness so a quiet recording and a loud one sit together, and played for its cue, one
// of its files in turn where it has several; until it has come, or where it cannot, the interface plays its
// synthesiser's sound and the world plays nothing. Each Freesound recording carries its credit, which Settings lists.

import bank from '../../content/audio/sounds.json' with { type: 'json' };

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
const loaded = new Map<string, { readonly buffer: AudioBuffer; readonly level: number; readonly rush: number }[]>();
const lastPlayed = new Map<string, number>();
let asked = false;

/** A recording's peak, its loudest 20 ms (mean square), and the seconds into it that loudest stretch is centred on. */
function loudness(channels: readonly Float32Array[], sampleRate: number) {
  const window = Math.max(1, Math.round(sampleRate * WINDOW_S));
  let [peak, loudest, rush] = [0, 0, 0];
  for (const samples of channels) {
    let sum = 0;
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index] ?? 0;
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample - (index >= window ? (samples[index - window] ?? 0) ** 2 : 0);
      if (sum / window > loudest) [loudest, rush] = [sum / window, Math.max(0, index - window / 2) / sampleRate];
    }
  }
  return { peak, loudest, rush };
}

/** How much a recording is turned up or down: its peak to PEAK, unless its loudest 20 ms would then pass LOUD. */
export function levelOf(channels: readonly Float32Array[], sampleRate: number): number {
  const { peak, loudest } = loudness(channels, sampleRate);
  return Math.min(PEAK / Math.max(0.01, peak), LOUD / Math.max(1e-4, Math.sqrt(loudest)));
}

/** The seconds into a recording its loudest 20 ms come: a whoosh's rush. */
export const rushOf = (channels: readonly Float32Array[], sampleRate: number): number =>
  loudness(channels, sampleRate).rush;

/** The seconds into a cue's recording its rush comes, the latest of its files'; 0 until it has come. */
export const rushOfCue = (id: string): number => Math.max(0, ...(loaded.get(id) ?? []).map((sound) => sound.rush));

/** A sound's files: a Freesound pick's one, or each variant of one of DFO's own. */
export const keysOf = (sound: { readonly key: string } | { readonly keys: readonly string[] }): readonly string[] =>
  'keys' in sound ? sound.keys : [sound.key];

/** Which of a cue's variants plays next: any but the one just played, so a footstep never sounds twice running. */
export function variantOf(count: number, last: number | undefined, roll = Math.random()): number {
  if (count < 2 || last === undefined) return Math.floor(roll * count);
  return (last + 1 + Math.floor(roll * (count - 1))) % count;
}

const channelsOf = (buffer: AudioBuffer) =>
  Array.from({ length: buffer.numberOfChannels }, (unused, channel) => buffer.getChannelData(channel));

/** Fetches and decodes every recorded sound, once. */
export function loadSamples(audio: AudioContext): void {
  if (asked) return;
  asked = true;
  for (const [id, sound] of Object.entries(bank.sounds))
    for (const key of keysOf(sound))
      void fetch(bank.base + key)
        .then((answer) => (answer.ok ? answer.arrayBuffer() : Promise.reject(new Error(`${answer.status}`))))
        .then((bytes) => audio.decodeAudioData(bytes))
        .then((buffer) => {
          const variants = loaded.get(id) ?? [];
          const channels = channelsOf(buffer);
          const level = levelOf(channels, buffer.sampleRate);
          loaded.set(id, [...variants, { buffer, level, rush: rushOf(channels, buffer.sampleRate) }]);
        })
        // A sound that cannot be fetched leaves its cue as it was before it was picked.
        .catch(() => undefined);
}

/** Plays a recorded sound into `out`, its pitch at `rate`, answering it as it plays; null where it has not come, so the
 *  caller plays its own or nothing. */
export function playSample(audio: AudioContext, out: AudioNode, id: string, rate = 1): AudioBufferSourceNode | null {
  const variants = loaded.get(id);
  if (!variants || variants.length === 0) return null;
  const index = variantOf(variants.length, lastPlayed.get(id));
  lastPlayed.set(id, index);
  const sound = variants[index];
  if (!sound) return null;
  const source = audio.createBufferSource();
  source.buffer = sound.buffer;
  source.playbackRate.value = rate;
  const gain = audio.createGain();
  gain.gain.value = sound.level;
  source.connect(gain).connect(out);
  source.start();
  return source;
}

/** Every Freesound recording's credit, by name; DFO's own sounds owe none. */
export function soundCredits(): SoundCredit[] {
  return Object.values(bank.sounds)
    .flatMap((sound) => ('freesound' in sound ? [sound] : []))
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
