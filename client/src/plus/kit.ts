// What the Enhanced Plus kit asks of the page: whether the player wants reduced motion. Its look, every surface by its
// role, is drawn by the game's interface (client/src/ui).

/** Whether the player asked for reduced motion: what moves on the display (a falling piece, a rising word, a flash)
 *  stands still, or is not drawn. False where no page answers. */
export function motionReduced(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
