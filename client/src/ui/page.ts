// The page's own services the game's drawn interface cannot give itself. This file, with canvasEvents.ts, pictures.ts
// and announce.ts, is all of the interface that touches the page.

/** Holds every touch on `surface` for the game while `held`: no drag pans the page or pulls it to reload, so a touch
 *  held is never cut short. Let go, the surface takes the page's touches again. */
export function touchesHeld(surface: { readonly style: { touchAction: string } }, held: boolean): void {
  surface.style.touchAction = held ? 'none' : '';
}
