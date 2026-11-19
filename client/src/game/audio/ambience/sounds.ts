// What the ambience's worker makes: a bed (beds.ts), or one take of a call or a noise (calls.ts, noises.ts), each
// named and seeded so the same job makes the same samples on any thread, every time. The job contract the worker and
// the page share: `runJob` answers a job with its samples and the rate they are at. Pure.

import { BEDS, type BedKey, bedSamples } from './beds.ts';
import { CALLS } from './calls.ts';
import { seeded } from './dsp.ts';
import { NOISES } from './noises.ts';
import { SONGS } from './songs.ts';
import { THUNDER } from './weatherSounds.ts';

/** Every call and noise a voice may sound, and the thunder. */
export const SOUNDS = { ...CALLS, ...SONGS, ...NOISES, ...THUNDER };
export type SoundKey = keyof typeof SOUNDS;

/** The rate calls and noises are made at: everything they hold lies under its half. */
export const SOUND_RATE = 32000;
/** How many takes of each sound are made, so no call is the same twice running; those heard most have more. */
const TAKES_MOST: Partial<Record<SoundKey, number>> = {
  'hull.creak': 5,
  'rope.creak': 4,
  'hull.slap': 4,
  'surf.crash': 4,
  'drip': 4,
  'step': 5,
  'song.warbler': 4,
  'gull': 4,
};
const TAKES = 3;
/** The fade every take ends with, seconds. */
const EDGE_S = 0.015;
export const takesOf = (key: SoundKey): number => TAKES_MOST[key] ?? TAKES;

/** A job: a bed, or a take of a sound. */
export type Job =
  | { readonly kind: 'bed'; readonly key: BedKey }
  | { readonly kind: 'sound'; readonly key: SoundKey; readonly take: number };

/** What a job makes: mono samples at their rate. */
export interface Made {
  readonly rate: number;
  readonly samples: Float32Array;
}

/** A job's name, which the samples are kept under. */
export const jobName = (job: Job): string => (job.kind === 'bed' ? `bed:${job.key}` : `sound:${job.key}:${job.take}`);

/** A name's own seed: the same name, the same number. */
export function seedOf(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Whether a job names something there is to make. */
export const isJob = (job: Job): boolean =>
  job.kind === 'bed'
    ? Object.hasOwn(BEDS, job.key)
    : Object.hasOwn(SOUNDS, job.key) && Number.isInteger(job.take) && job.take >= 0 && job.take < takesOf(job.key);

/** Makes a job's samples; null for a job there is nothing to make of. */
export function runJob(job: Job): Made | null {
  if (!isJob(job)) return null;
  if (job.kind === 'bed') {
    const spec = BEDS[job.key];
    return { rate: spec.rate, samples: bedSamples(spec) };
  }
  const samples = SOUNDS[job.key](SOUND_RATE, seeded(seedOf(jobName(job))));
  // Whatever a maker lays past its end is cut there: its last few milliseconds are faded, so no take ends on an edge.
  const fade = Math.min(samples.length, Math.round(EDGE_S * SOUND_RATE));
  for (let i = 0; i < fade; i++) samples[samples.length - 1 - i] = (samples[samples.length - 1 - i] ?? 0) * (i / fade);
  return { rate: SOUND_RATE, samples };
}
