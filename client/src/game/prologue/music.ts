// The story's music, frame by frame: each beat says what its moment asks of the game's music director (a song of the
// story's own in a mood's layers, a silence, or the fight it plays heard as the game hears any), and the story hands
// that to the director, which plays it on its bar lines as it plays the game's.
import type { Boss, Hearing, Mood } from '../audio/music/directorLaw.ts';
import type { StorySong } from '../audio/music/storyScore.ts';

/** The story heard as a place with nothing in it: the music is the story's word alone. */
const STILL: Hearing = {
  place: { kind: 'sea' },
  dead: false,
  health: 1,
  struck: false,
  kills: 0,
  foes: [],
  sea: null,
  sky: null,
};

/** The story's `song` in the layers of `mood`. */
export const sung = (song: StorySong, mood: Mood): Hearing => ({ ...STILL, story: { kind: 'song', song, mood } });

/** Silence: cut at once (the crash, and the black after it), or what was playing let ring out. */
export const hushed = (cut = false): Hearing => ({ ...STILL, story: { kind: 'silence', cut } });

/** A fight the story plays, heard as the game hears one; on foot at sea playing `score`'s first part, at no less than
 *  `least`. With no hearing yet, nothing in it but the mood. */
export const fought = (hearing: Hearing | null, score: Boss | null, least: Mood): Hearing => ({
  ...(hearing ?? STILL),
  story: { kind: 'fight', score, least },
});
