// The story's sea fight taken by the pointer as the sea's own fight is: the right button held aims and let go fires, a
// left click while aiming holds fire, a drag turns the camera, the wheel steps the shot; the pointer is held to the
// canvas while a button is down.

import { holdPointer } from '../seaCombat.ts';

/** What the pointer drives in a fight. */
export interface Aimed {
  aim(held: boolean): void;
  holdFire(): void;
  drag(right: number, down: number): void;
  wheel(steps: number): void;
}

/** Hands the canvas's pointer to whichever fight `fight` answers while it answers one. */
export function fightPointer(canvas: HTMLCanvasElement, fight: () => Aimed | null): void {
  let held = false;
  let aiming = false;
  const taken = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      const fought = fight();
      if (!fought) return;
      taken(event);
      holdPointer(canvas, event.pointerId);
      if (event.button === 2) {
        aiming = true;
        fought.aim(true);
      } else if (aiming) {
        aiming = false;
        fought.holdFire();
      }
      held = true;
    },
    { capture: true },
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const fought = fight();
      if (!fought || !held) return;
      taken(event);
      fought.drag(event.movementX, event.movementY);
    },
    { capture: true },
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      const fought = fight();
      held = false;
      if (!fought) return;
      taken(event);
      if (event.button === 2 && aiming) {
        aiming = false;
        fought.aim(false);
      }
    },
    { capture: true },
  );
  // The pointer let go without its button coming up on the canvas (the window lost it, the browser took it): the aim
  // is let go unfired, so the next press begins a new one.
  canvas.addEventListener('lostpointercapture', () => {
    held = false;
    if (!aiming) return;
    aiming = false;
    fight()?.holdFire();
  });
  canvas.addEventListener(
    'wheel',
    (event) => {
      const fought = fight();
      if (!fought) return;
      taken(event);
      fought.wheel(Math.sign(event.deltaY));
    },
    { capture: true, passive: false },
  );
  canvas.addEventListener('contextmenu', (event) => fight() && event.preventDefault());
}
