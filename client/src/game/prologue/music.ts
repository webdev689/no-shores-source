// The story's music, cue by cue: each beat names the moment it reaches, and the music system plays what fits. The
// music system is another piece of work (its director, its voices and its scores); until it lands, a cue is kept as
// the moment now reached and nothing plays.

export type StoryCue =
  | 'title'
  | 'storm'
  | 'sighted'
  | 'battle'
  | 'calm'
  | 'ram'
  | 'wreck'
  | 'boss'
  | 'deep'
  | 'shore';

let reached: StoryCue | null = null;

/** The story has reached `cue`. */
export function storyCue(cue: StoryCue): void {
  reached = cue;
}

/** The moment the story last reached, for the music system to take up when it starts. */
export function storyCueNow(): StoryCue | null {
  return reached;
}
