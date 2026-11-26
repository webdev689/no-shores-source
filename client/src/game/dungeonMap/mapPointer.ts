// The pointer and the wheel over the dungeon map while it is open: a drag pans, a right drag turns and tilts, the wheel
// zooms at the pointer. While it is open they are the map's alone, heard first, so nothing behind it hears them (the
// click that would hold the pointer to look round among them).
import { wheelFactor } from '../../heldmap/heldMapLaw.ts';
import { DUNGEON_MAP } from './dungeonMap.ts';

/** Hears `canvas`'s pointer and wheel for the map. */
export function listenToMap(canvas: HTMLCanvasElement): void {
  const taken = (event: Event): boolean => {
    if (!DUNGEON_MAP.open) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  };
  const heard = { capture: true, passive: false } as const;
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (!taken(event)) return;
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // A pointer the browser no longer has: nothing to hold.
      }
      DUNGEON_MAP.pointerDown(event.offsetX, event.offsetY, event.button);
    },
    heard,
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (taken(event)) DUNGEON_MAP.pointerMove(event.offsetX, event.offsetY);
    },
    heard,
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      if (taken(event)) DUNGEON_MAP.pointerUp();
    },
    heard,
  );
  canvas.addEventListener(
    'wheel',
    (event) => {
      if (taken(event))
        DUNGEON_MAP.wheel(
          event.offsetX,
          event.offsetY,
          wheelFactor(event.deltaY, event.deltaMode, canvas.clientHeight),
        );
    },
    heard,
  );
  for (const name of ['click', 'contextmenu'] as const) canvas.addEventListener(name, taken, heard);
}
