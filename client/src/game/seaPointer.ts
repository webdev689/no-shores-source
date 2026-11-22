import type { HeldMap } from '../heldmap/heldMap.ts';
import { wheelNotches } from '../overworld/overworldInput.ts';
import type { Sea } from './sea.ts';
import { BINDS, keyNameOf, keyUpNameOf } from '../player/input.ts';
import { gearScreenOpen } from './gearScreen.ts';
import { FIGHT_CONTROLS, type SeaCombat } from './seaCombat.ts';

/** What the sea's pointer reaches: whether the player is at sea with no menu up, the sea, the held map (raised at the
 *  helm or on land), and whether the pointer is over the interface the game draws, whose press it is then. */
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
  /** While the map is up, the pointer and the wheel are the map's, but where the interface is over it. */
  const mapUp = () => (map()?.shown ?? false) && !overInterface();
  canvas.addEventListener('pointerdown', (event) => {
    if (!atSea() && !mapUp()) return;
    // A locked pointer is held already.
    if (!input.locked) canvas.setPointerCapture(event.pointerId);
    if (mapUp()) map()?.pointerDown(event.offsetX, event.offsetY);
    else sea()?.pointerDown(event.offsetX, event.offsetY);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!atSea() && !mapUp()) return;
    if (mapUp()) map()?.pointerMove(event.offsetX, event.offsetY);
    else sea()?.pointerMove(event.offsetX, event.offsetY);
  });
  /** A press is let go by whichever took it; neither keeps one after, where the map rose or fell in between. */
  const forgetPresses = () => {
    sea()?.pointerCancel();
    map()?.pointerCancel();
  };
  canvas.addEventListener('pointerup', (event) => {
    if (mapUp()) map()?.pointerUp(event.offsetX, event.offsetY);
    else if (atSea()) sea()?.pointerUp(event.offsetX, event.offsetY);
    forgetPresses();
  });
  canvas.addEventListener('pointercancel', forgetPresses);
  // On a struck ship's deck the keys and the pointer are the fight's on foot.
  fightControls(canvas, () => (overInterface() || sea()?.boarding.onDeck ? null : (sea()?.fight ?? null)));
  canvas.addEventListener('wheel', (event) => {
    if (!atSea() && !mapUp()) return;
    if (mapUp()) map()?.wheel(event.offsetX, event.offsetY, event.deltaY, event.deltaMode);
    else sea()?.zoom(wheelNotches(event.deltaY, event.deltaMode, canvas.clientHeight));
  });
}

/** Hands the keys and the pointer to the fight while one is on, ahead of the sea's own controls: its controls as
 *  bound (the helm, the sails, the burst, the brace, the aim and fire, holding fire), a drag to look, the wheel for
 *  the load. */
export function fightControls(canvas: HTMLCanvasElement, fight: () => SeaCombat | null): void {
  const taken = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  // A key let go still reaches the sea's own controls, so none is held there once the fight is over.
  const key = (down: boolean) => (event: KeyboardEvent) => {
    // Under the gear screen the fight takes no key pressed, they are the screen's; a key let go is still the fight's,
    // so nothing it held stays held.
    if (down && gearScreenOpen()) return;
    if (!fight()?.key(down ? keyNameOf(event) : keyUpNameOf(event), down)) return;
    if (down) taken(event);
    else event.preventDefault();
  };
  addEventListener('keydown', key(true), { capture: true });
  addEventListener('keyup', key(false), { capture: true });
  // A key let go while the window is away is never heard: nothing it held stays held, as on land.
  addEventListener('blur', () => fight()?.letGo());
  document.addEventListener('visibilitychange', () => fight()?.letGo());
  let held = false;
  canvas.addEventListener(
    'pointerdown',
    (event) => {
      const combat = fight();
      if (!combat) return;
      taken(event);
      holdPointer(canvas, event.pointerId);
      const button = `mouse${event.button}`;
      const own = FIGHT_CONTROLS.find((id) => BINDS.now[id].keys.includes(button));
      // Any other button while aiming holds fire, as the left does.
      if (own) combat.act(own, true);
      else if (combat.aimingNow) combat.holdFire();
      held = true;
    },
    { capture: true },
  );
  canvas.addEventListener(
    'pointermove',
    (event) => {
      const combat = fight();
      if (!combat) return;
      taken(event);
      if (held) combat.drag(event.movementX, event.movementY);
    },
    { capture: true },
  );
  canvas.addEventListener(
    'pointerup',
    (event) => {
      const combat = fight();
      held = false;
      if (!combat) return;
      taken(event);
      const own = FIGHT_CONTROLS.find((id) => BINDS.now[id].keys.includes(`mouse${event.button}`));
      if (own) combat.act(own, false);
    },
    { capture: true },
  );
  // A pointer let go without its button coming up on the canvas lets the aim go unfired.
  canvas.addEventListener('lostpointercapture', () => {
    held = false;
    const combat = fight();
    if (combat?.aimingNow) combat.holdFire();
  });
  canvas.addEventListener(
    'wheel',
    (event) => {
      const combat = fight();
      if (!combat) return;
      taken(event);
      combat.wheel(event.deltaY, event.timeStamp / 1000);
    },
    { capture: true, passive: false },
  );
  canvas.addEventListener('contextmenu', (event) => {
    if (fight()) event.preventDefault();
  });
}

/** Holds the pointer to the canvas, so its button let go off the canvas still comes up there. A locked pointer is
 *  held already, and the browser refuses to capture it. */
export function holdPointer(canvas: HTMLCanvasElement, pointerId: number): void {
  try {
    canvas.setPointerCapture(pointerId);
  } catch {
    // A locked pointer, or one the browser no longer has: nothing to hold.
  }
}
