// The Drowned Vale's music, built once when it is first wanted: some 47,000 notes, a fifth of a second, so no game
// that never nears the Breach builds it, and one that does builds it as the Breach's plan loads (`warmVale`), before
// the gate's fight can start. Its recordings, the `music.*` cues its tracks and drums play (`VALE_CUES`).

import type { Song } from './score.ts';
import { valeBosses } from './valeBosses.ts';
import { valeCalm } from './valeCalm.ts';
import { valeFights } from './valeScore.ts';

let built: ReturnType<typeof build> | null = null;
const build = () => ({ fights: valeFights(), calm: valeCalm(), ...valeBosses() });

/** The Drowned Vale's scores: its fights, its calm pieces and its two bosses'. */
export const valeMusic = (): ReturnType<typeof build> => (built ??= build());

/** Builds the Vale's scores away from the frame that asks for them first. */
export function warmVale(): void {
  if (!built) setTimeout(valeMusic, 0);
}

/** The recordings a song's tracks and drums play. */
export const cuesOf = (songs: readonly Song[]): string[] => [
  ...new Set(
    songs.flatMap((song) => [
      ...song.tracks.flatMap((track) => (track.sample ? [track.sample.cue] : [])),
      ...[...(song.kit.samples?.values() ?? [])].map((sample) => sample.cue),
    ]),
  ),
];
