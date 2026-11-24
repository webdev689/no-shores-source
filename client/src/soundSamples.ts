// The game's recorded sounds, the interface's and the world's: the owner's picks from Freesound and from DFO's own
// (content/audio/sounds.json), kept on R2 under the hash of their bytes, each levelled to one peak and one loudness
// and played for its cue; silent until it has come. Each Freesound recording carries its credit, which Settings lists.
// They come as they are wanted, long ones a chunk at a time, and are held within a budget, since all of them decoded
// at once would not fit in a page's memory.

import bank from '../../content/audio/sounds.json' with { type: 'json' };
import { contentBytes, type Fetched } from './contentCache.ts';
import { channelsOf, matchedLevel, type Loudness, type Measured, measuredOf, measureOver } from './soundMeasure.ts';
import { standIn } from './standIns.ts';

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

/** A file longer than this is fetched a chunk of this many bytes at a time: about a minute of a 128 kbps recording. */
export const CHUNK_BYTES = 1_000_000;
/** The decoded samples held before the least lately played are let go: a soft limit, as a sound played or come in the
 *  last KEPT_PLAYED_S is never let go for it, nor the short sounds of play, which must sound the moment they are
 *  asked for. */
export const HELD_BYTES = 192 * 1024 * 1024;
const KEPT_PLAYED_S = 120;
/** A long recording's chunks held at once: the one playing and the next. */
const CHUNKS_HELD = 2;
/** A file or chunk that failed to come is not asked for again until this many seconds have passed. */
const FAILED_WAIT_S = 30;

/** A recording held, decoded: its buffer, how it measures, its decoded size, the chunk of its file it is (null for
 *  a whole file), and when it last played, or came, on the audio clock. */
interface Held {
  readonly file: string;
  readonly buffer: AudioBuffer;
  readonly measured: Measured;
  readonly bytes: number;
  readonly chunk: number | null;
  playedAt: number;
}

/** A context that decodes elsewhere and keeps the samples there, handing back only how they measure: the game's
 *  worker's (`thread/audioAway.ts`). */
interface MeasuringContext {
  decodeMeasured(data: ArrayBuffer): Promise<{ buffer: AudioBuffer; measured: Measured }>;
}

/** A recording's bytes decoded, and measured: by the page where the samples are kept there, else here. */
async function decodedMeasured(audio: BaseAudioContext, bytes: ArrayBuffer) {
  const away = audio as Partial<MeasuringContext>;
  if (typeof away.decodeMeasured === 'function') return away.decodeMeasured(bytes);
  const buffer = await audio.decodeAudioData(bytes);
  return { buffer, measured: measuredOf(channelsOf(buffer), buffer.sampleRate) };
}

/** Whether a cue is fetched as soon as the sound wakes: the short sounds of play, not the ambience or the story's. */
export const fetchedAtWake = (id: string): boolean => !id.startsWith('amb.') && !id.startsWith('story.');

/** A sound's files: a Freesound pick's one, or each variant of one of DFO's own. */
export const keysOf = (sound: { readonly key: string } | { readonly keys: readonly string[] }): readonly string[] =>
  'keys' in sound ? sound.keys : [sound.key];

/** Which of a cue's variants plays next: any but the one just played, so a footstep never sounds twice running. */
export function variantOf(count: number, last: number | undefined, roll = Math.random()): number {
  if (count < 2 || last === undefined) return Math.floor(roll * count);
  return (last + 1 + Math.floor(roll * (count - 1))) % count;
}

/** When a recording starts (the context's time; at once where not given), and the loudness of the sound it took the
 *  place of, measured over `windowS`, which it takes in place of its own levelling, its peak never past `most` (that
 *  sound's own where not given): what the mix's ceiling leaves it. */
export interface SamplePlay {
  readonly when?: number;
  readonly like?: { readonly measured: Loudness; readonly windowS: number; readonly most?: number };
}

type Bank = { readonly base: string; readonly sounds: Readonly<Record<string, Parameters<typeof keysOf>[0]>> };
type Read = (url: string, range?: readonly [number, number]) => Promise<Fetched>;

/** Every recording the game plays, fetched and held as it is wanted. */
export class Samples {
  private readonly bank: Bank;
  private readonly read: Read;
  private readonly most: number;
  private readonly held = new Map<string, Held[]>();
  /** Each file and chunk on its way, and the cues waiting on it: cues sharing a recording share its one fetch. */
  private readonly coming = new Map<string, Set<string>>();
  /** Each long file's size, once its first chunk has said it. */
  private readonly sizes = new Map<string, number>();
  /** The sound each cue played last, so the next play is another: by the sound, as a chunk let go moves the rest. */
  private readonly lastPlayed = new Map<string, Held>();
  /** When each file and chunk that failed to come failed, on the audio clock. */
  private readonly failed = new Map<string, number>();
  /** The cues fetched ahead of their first play, held whatever the budget (`prefetch`). */
  private readonly kept = new Set<string>();
  private audio: BaseAudioContext | null = null;

  constructor(sounds: Bank, read: Read = contentBytes, most = HELD_BYTES) {
    [this.bank, this.read, this.most] = [sounds, read, most];
  }

  /** The page's sound has woken on `audio`: the short sounds of play are fetched now, the rest as each is wanted. */
  wake(audio: BaseAudioContext): void {
    if (this.audio) return;
    this.audio = audio;
    for (const id of Object.keys(this.bank.sounds)) if (fetchedAtWake(id)) this.want(id);
  }

  /** Fetches `ids` on `audio` now, ahead of their first play, and holds them whatever the budget: a one-shot heard
   *  once (a story's crash or splash) would otherwise go unheard while its own fetch was on its way. */
  prefetch(audio: BaseAudioContext, ids: readonly string[]): void {
    this.audio ??= audio;
    for (const id of ids) {
      this.kept.add(id);
      this.want(id);
    }
  }

  /** `ids` held under the budget again, as any other: their story is over. */
  release(ids: readonly string[]): void {
    for (const id of ids) this.kept.delete(id);
  }

  /** Fetches each of `id`'s files not held or on its way; one another cue holds whole, it holds too. */
  want(id: string): void {
    const sound = this.bank.sounds[id];
    if (!sound || !this.audio) return;
    const held = this.held.get(id) ?? [];
    for (const file of keysOf(sound)) {
      if (held.some((each) => each.file === file)) continue;
      const whole = [...this.held.values()].flat().find((each) => each.file === file && each.chunk === null);
      // A copy of its own, as each cue keeps when it last played.
      if (whole) this.keep(id, { ...whole });
      else this.fetch(id, file, 0);
    }
  }

  /** The bytes of decoded samples held now, a recording several cues share counted once. */
  get bytes(): number {
    const counted = new Map<AudioBuffer, number>();
    for (const variants of this.held.values()) for (const each of variants) counted.set(each.buffer, each.bytes);
    let total = 0;
    for (const bytes of counted.values()) total += bytes;
    return total;
  }

  /** The seconds into a cue's recording its rush comes, the latest of its files'; 0 until it has come. */
  rushOf(id: string): number {
    return Math.max(0, ...(this.held.get(id) ?? []).map((each) => each.measured.rush));
  }

  /** A cue's recording held whole, decoded, and the gain that levels it, for a player that builds its own nodes (the
   *  music's sampled voices); null, and fetched, where it has not come. Asked for, it counts as played. */
  recording(audio: BaseAudioContext, id: string): { readonly buffer: AudioBuffer; readonly level: number } | null {
    this.audio ??= audio;
    const sound = this.held.get(id)?.find((each) => each.chunk === null);
    if (!sound) {
      this.want(id);
      return null;
    }
    sound.playedAt = audio.currentTime;
    return { buffer: sound.buffer, level: sound.measured.level };
  }

  /** Plays `id` into `out`, its pitch at `rate`, answering it as it plays; null, and fetched, where it has not come. */
  play(audio: AudioContext, out: AudioNode, id: string, rate = 1, play: SamplePlay = {}): AudioBufferSourceNode | null {
    this.audio ??= audio;
    const variants = this.held.get(id);
    if (!variants || variants.length === 0) {
      this.want(id);
      const sound = this.bank.sounds[id];
      if (sound && keysOf(sound).some((file) => this.coming.has(`${file} 0`))) standIn('sounds');
      return null;
    }
    const last = this.lastPlayed.get(id);
    const lastAt = last ? variants.indexOf(last) : -1;
    // A long recording plays its chunks in order, then from the first again; one late, another held plays meanwhile.
    const following = last ? this.following(variants, last) : -1;
    const sound = variants[following >= 0 ? following : variantOf(variants.length, lastAt < 0 ? undefined : lastAt)];
    if (!sound) return null;
    this.lastPlayed.set(id, sound);
    sound.playedAt = audio.currentTime;
    // A long recording's next chunk is fetched as one of its chunks plays, so the next play has it.
    if (sound.chunk !== null) this.nextChunk(id, sound.file, sound.chunk);
    const source = audio.createBufferSource();
    source.buffer = sound.buffer;
    source.playbackRate.value = rate;
    const gain = audio.createGain();
    const { like } = play;
    gain.gain.value = like
      ? matchedLevel(measureOver(sound.measured, like.windowS), like.measured, like.most)
      : sound.measured.level;
    source.connect(gain).connect(out);
    source.start(play.when ?? 0);
    return source;
  }

  /** How many chunks a long recording is taken in, its last part one too. */
  private chunksOf(file: string): number {
    return Math.max(1, Math.ceil((this.sizes.get(file) ?? 0) / CHUNK_BYTES));
  }

  /** Where the chunk after `last` is held, -1 where it is not or `last` is no chunk. */
  private following(variants: readonly Held[], last: Held): number {
    if (last.chunk === null) return -1;
    const next = (last.chunk + 1) % this.chunksOf(last.file);
    return variants.findIndex((each) => each.file === last.file && each.chunk === next);
  }

  private nextChunk(id: string, file: string, playing: number): void {
    if (!this.sizes.has(file) || [...this.coming.keys()].some((each) => each.startsWith(`${file} `))) return;
    const next = (playing + 1) % this.chunksOf(file);
    const held = (this.held.get(id) ?? []).some((each) => each.file === file && each.chunk === next);
    if (!held) this.fetch(id, file, next);
  }

  /** Fetches chunk `chunk` of `file` (all of it, where it is no longer than a chunk), decodes and holds it. */
  private fetch(id: string, file: string, chunk: number): void {
    const audio = this.audio;
    const coming = `${file} ${chunk}`;
    const waiting = this.coming.get(coming);
    if (!audio) return;
    if (waiting) {
      waiting.add(id);
      return;
    }
    const failedAt = this.failed.get(coming);
    if (failedAt !== undefined && audio.currentTime - failedAt < FAILED_WAIT_S) return;
    const cues = new Set([id]);
    this.coming.set(coming, cues);
    const first = chunk * CHUNK_BYTES;
    void this.read(this.bank.base + file, [first, first + CHUNK_BYTES - 1])
      .then(async ({ bytes, total }) => {
        // Only a part of the file came: it is long, and taken a chunk at a time.
        const long = total !== null && total > bytes.byteLength;
        if (long) this.sizes.set(file, total);
        const { buffer, measured } = await decodedMeasured(audio, bytes);
        const held = buffer.length * buffer.numberOfChannels * 4;
        const playedAt = audio.currentTime;
        for (const cue of cues)
          this.keep(cue, { file, buffer, measured, bytes: held, chunk: long ? chunk : null, playedAt });
      })
      // A sound that cannot be fetched leaves its cue silent, as before it was picked, and is asked for again later.
      .catch(() => this.failed.set(coming, audio.currentTime))
      .finally(() => this.coming.delete(coming));
  }

  private keep(id: string, sound: Held): void {
    const variants = [...(this.held.get(id) ?? []), sound];
    // A long recording keeps its newest chunks, the one played least lately let go, never the one just come.
    const chunks = variants.filter((each) => each.file === sound.file && each.chunk !== null);
    if (chunks.length > CHUNKS_HELD) {
      chunks.splice(chunks.indexOf(sound), 1);
      const oldest = chunks.reduce((one, other) => (other.playedAt < one.playedAt ? other : one));
      variants.splice(variants.indexOf(oldest), 1);
    }
    this.held.set(id, variants);
    this.trim();
  }

  /** Lets go of the sounds played least lately until the held samples are within their budget, keeping any played in
   *  the last KEPT_PLAYED_S. */
  private trim(): void {
    let over = this.bytes - this.most;
    if (over <= 0) return;
    const now = this.audio?.currentTime ?? 0;
    const all = [...this.held.entries()]
      .filter(([id]) => !fetchedAtWake(id) && !this.kept.has(id))
      .flatMap(([id, variants]) => variants.map((sound) => ({ id, sound })));
    for (const { id, sound } of all.sort((one, other) => one.sound.playedAt - other.sound.playedAt)) {
      if (over <= 0 || now - sound.playedAt < KEPT_PLAYED_S) return;
      const variants = (this.held.get(id) ?? []).filter((each) => each !== sound);
      if (variants.length > 0) this.held.set(id, variants);
      else this.held.delete(id);
      // Nothing else may hold it, or its samples (and the page's decoded copy) are never let go.
      if (this.lastPlayed.get(id) === sound) this.lastPlayed.delete(id);
      // A recording another cue still holds frees nothing.
      over = this.bytes - this.most;
    }
  }
}

/** The game's one bank of recordings. */
const samples = new Samples(bank);

/** Starts fetching the recordings, once the page's sound has woken. */
export function loadSamples(audio: BaseAudioContext): void {
  samples.wake(audio);
}

/** Fetches the recordings of `ids` now, ahead of their first play, and holds them (`Samples.prefetch`). */
export function prefetchSamples(audio: BaseAudioContext, ids: readonly string[]): void {
  samples.prefetch(audio, ids);
}

/** Holds `ids` under the budget again (`Samples.release`). */
export function releaseSamples(ids: readonly string[]): void {
  samples.release(ids);
}

/** Plays a recorded sound into `out`, its pitch at `rate`, answering it as it plays; null where it has not come. */
export function playSample(
  audio: AudioContext,
  out: AudioNode,
  id: string,
  rate = 1,
  play: SamplePlay = {},
): AudioBufferSourceNode | null {
  return samples.play(audio, out, id, rate, play);
}

/** The seconds into a cue's recording its rush comes, the latest of its files'; 0 until it has come. */
export const rushOfCue = (id: string): number => samples.rushOf(id);

/** A cue's recording held whole and its level, for the music's sampled voices (`Samples.recording`). */
export const recordingOf = (audio: BaseAudioContext, id: string) => samples.recording(audio, id);

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
