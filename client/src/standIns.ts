// What a frame drew in place of what it should have while the real thing still comes, and whether a trip's veil is
// up over it. What stands in: a figure with no frame of its own yet, ground, a city, a dungeon or an entrance still
// painting, a city not yet built, plants or an island's kit not yet loaded, a hull
// drawn as the Sloop, a place's sound not yet fetched. Each says so as it draws or plays; a trip's veil lifts only
// after frames with none ([[One Loading Screen Covers Every Trip Until the Place Is Ready]], `gameFrame.ts`).

const drawn = new Set<string>();

/** Frames in a row drawn with nothing standing in before a place behind a veil is ready, so the first frames' own work
 *  (pipelines made, pictures sent) is done unseen. */
export const WHOLE_FRAMES = 3;

let [veiled, whole] = [false, 0];

/** Whether a trip's veil is up: no one sees the frames, so work spread over frames to keep play smooth may take more
 *  of each. */
export const behindVeil = (): boolean => veiled;

/** The veil is up, or down; the game's frame says so before it draws. */
export function setBehindVeil(up: boolean): void {
  veiled = up;
}

/** `what` stood in for what should be there, this frame. */
export function standIn(what: string): void {
  drawn.add(what);
}

/** The game's frame says once a frame whether it drew the place round the player whole: ground come, nothing standing
 *  in. */
export function frameDrawn(drewWhole: boolean): void {
  whole = drewWhole ? whole + 1 : 0;
}

/** Whether the last WHOLE_FRAMES frames in a row drew the place whole. */
export const drawnWhole = (): boolean => whole >= WHOLE_FRAMES;

/** What stood in since this was last asked; asking starts afresh. */
export function standIns(): string[] {
  const named = [...drawn];
  drawn.clear();
  return named;
}
