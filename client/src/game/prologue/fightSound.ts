// The story's fights are fought in a gale and among fires, heard on the same buses as the fights' own sounds: the
// storm's wind, rain and thunder over the sea fight, the wreck's burning over its blows. Each fight's sounds are made
// louder than the open world's so they stand over them.
import type { WorldOutput } from '../../combat/worldSounds.ts';

/** How many times as loud the story's fights are heard as the open world's: 3 is about 10 dB. */
export const STORY_FIGHT_GAIN = 3;

/** `output` with everything played into it `times` as loud: one gain on the way in, made again only for a new
 *  context or bus. */
export function louder(output: () => WorldOutput | null, times: number): () => WorldOutput | null {
  let made: { readonly into: AudioNode; readonly out: AudioNode } | null = null;
  return () => {
    const now = output();
    if (!now) return null;
    if (made?.into !== now.out) {
      const gain = now.audio.createGain();
      gain.gain.value = times;
      gain.connect(now.out);
      made = { into: now.out, out: gain };
    }
    return { audio: now.audio, out: made.out };
  };
}
