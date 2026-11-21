import type { HeldMap } from '../heldmap/heldMap.ts';
import { wheelNotches } from '../overworld/overworldInput.ts';
import type { Sea } from './sea.ts';
import { fightControls } from './seaCombat.ts';

/** What the sea's pointer reaches: whether the player is at sea with no menu up, the sea, the held map, and whether the
 *  pointer is over the interface the game draws, whose press it is then. */
export interface SeaPointing {
  readonly atSea: () => boolean;
  readonly overInterface: () => boolean;
  readonly sea: () => Sea | null;
  readonly map: () => HeldMap | null;
}

/**
 * The pointer and the wheel at sea: the held map's while it is up, else the sea's, and the fight's buttons. A press is
 * held to the canvas, so one let go over a mark or the bar still ends there.
 */
export function seaPointer(
  canvas: HTMLCanvasElement,
  input: { readonly locked: boolean },
  pointing: SeaPointing,
): void {
  const { sea, map, overInterface } = pointing;
  const atSea = () => pointing.atSea() && !overInterface();
  /** While the map is up, the pointer and the wheel are the map's. */
  const mapUp = () => map()?.shown ?? false;
  canvas.addEventListener('pointerdown', (event) => {
    if (!atSea()) return;
    // A locked pointer is held already.
    if (!input.locked) canvas.setPointerCapture(event.pointerId);
    if (mapUp()) map()?.pointerDown(event.offsetX, event.offsetY);
    else sea()?.pointerDown(event.offsetX, event.offsetY);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!atSea()) return;
    if (mapUp()) map()?.pointerMove(event.offsetX, event.offsetY);
    else sea()?.pointerMove(event.offsetX, event.offsetY);
  });
  /** A press is let go by whichever took it; neither keeps one after, where the map rose or fell in between. */
  const forgetPresses = () => {
    sea()?.pointerCancel();
    map()?.pointerCancel();
  };
  canvas.addEventListener('pointerup', (event) => {
    if (atSea() && mapUp()) map()?.pointerUp(event.offsetX, event.offsetY);
    else if (atSea()) sea()?.pointerUp(event.offsetX, event.offsetY);
    forgetPresses();
  });
  canvas.addEventListener('pointercancel', forgetPresses);
  fightControls(canvas, () => (overInterface() ? null : (sea()?.fight ?? null)));
  canvas.addEventListener('wheel', (event) => {
    if (!atSea()) return;
    if (mapUp()) map()?.wheel(event.offsetX, event.offsetY, event.deltaY, event.deltaMode);
    else sea()?.zoom(wheelNotches(event.deltaY, event.deltaMode, canvas.clientHeight));
  });
}
