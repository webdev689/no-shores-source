// What a frame drew in place of what it should have while the real thing still comes: a figure with no frame of its
// own yet, ground or a city still painting, a city not yet built, plants or an island's kit not yet loaded, a hull
// drawn as the Sloop, a place's sound not yet fetched. Each says so as it draws or plays; a trip's veil lifts only
// after frames with none ([[One Loading Screen Covers Every Trip Until the Place Is Ready]], `gameFrame.ts`).

const drawn = new Set<string>();

/** `what` stood in for what should be there, this frame. */
export function standIn(what: string): void {
  drawn.add(what);
}

/** What stood in since this was last asked; asking starts afresh. */
export function standIns(): string[] {
  const named = [...drawn];
  drawn.clear();
  return named;
}
