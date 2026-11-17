import { orbitBy, turnCamera, zoomTarget, ZOOM_STEP, type OverworldCamera, type Rig } from './overworldCamera.ts';

/** The view's rise and fall, seconds. */
export const LIFT_SECONDS = { rise: 1.2, fall: 0.8 } as const;

/** Where the view stands: down, rising out of the player's own camera, up, or falling back into it. */
export type LiftPhase = 'off' | 'rising' | 'up' | 'falling';

/** The phase and the blend between the player's camera (0) and the raised one (1). */
export interface Lift {
  readonly phase: LiftPhase;
  readonly blend: number;
}

/** The view down. A window, a death or a door cuts the view straight to this, with no fall nobody would see. */
export const LIFT_OFF: Lift = { phase: 'off', blend: 0 };

/** The view asked up: it rises from wherever it stands, so a view caught falling turns round mid-way. */
export function raiseLift(lift: Lift): Lift {
  return lift.phase === 'off' || lift.phase === 'falling' ? { phase: 'rising', blend: lift.blend } : lift;
}

/** The view asked down: it falls from wherever it stands. */
export function lowerLift(lift: Lift): Lift {
  return lift.phase === 'up' || lift.phase === 'rising' ? { phase: 'falling', blend: lift.blend } : lift;
}

/** One frame of the rise or the fall; it ends up or off. The seconds default to the view's, and the island's
 *  fly-in passes its own. */
export function stepLift(
  lift: Lift,
  dt: number,
  riseSeconds: number = LIFT_SECONDS.rise,
  fallSeconds: number = LIFT_SECONDS.fall,
): Lift {
  if (lift.phase === 'rising') {
    const blend = Math.min(1, lift.blend + Math.max(0, dt) / riseSeconds);
    return blend >= 1 ? { phase: 'up', blend: 1 } : { phase: 'rising', blend };
  }
  if (lift.phase === 'falling') {
    const blend = Math.max(0, lift.blend - Math.max(0, dt) / fallSeconds);
    return blend <= 0 ? LIFT_OFF : { phase: 'falling', blend };
  }
  return lift.phase === 'up' ? { phase: 'up', blend: 1 } : LIFT_OFF;
}

/** A press that moves further than this many pixels before it lifts is a drag that orbits, not a click that picks. */
export const CLICK_SLOP_PX = 6;

/** One pointer held down: where it went down, where it last was, and whether it has become a drag. */
export interface Press {
  readonly startX: number;
  readonly startY: number;
  readonly lastX: number;
  readonly lastY: number;
  readonly dragging: boolean;
}

export const pressAt = (x: number, y: number): Press => ({ startX: x, startY: y, lastX: x, lastY: y, dragging: false });

/** A held pointer moved: the press now, and the pixels to orbit the camera by (none until it is a drag). */
export function pressMove(
  press: Press,
  x: number,
  y: number,
): { readonly press: Press; readonly acrossPx: number; readonly downPx: number } {
  const dragging = press.dragging || Math.hypot(x - press.startX, y - press.startY) > CLICK_SLOP_PX;
  const next = { ...press, lastX: x, lastY: y, dragging };
  return dragging
    ? { press: next, acrossPx: x - press.lastX, downPx: y - press.lastY }
    : { press: next, acrossPx: 0, downPx: 0 };
}

/** A press's pixels applied to the camera. */
export const dragCamera = <T extends Rig>(camera: T, moved: { readonly acrossPx: number; readonly downPx: number }) =>
  orbitBy(camera, moved.acrossPx, moved.downPx);

/** A wheel's pixels a zoom notch (a mouse's click is about 100), a line's pixels, and the most notches one event
 *  carries, so a trackpad's flick never crosses the whole band. */
export const WHEEL = { pixelsPerNotch: 100, lineHeightPx: 16, mostNotches: 3 } as const;

/** A wheel event's zoom notches, positive in (the wheel rolled up). `deltaMode` is the event's: 0 pixels, 1 lines,
 *  2 pages of `pageHeight` pixels. */
export function wheelNotches(deltaY: number, deltaMode: number, pageHeight: number = 800): number {
  const delta = Number.isFinite(deltaY) ? deltaY : 0;
  const pixels = deltaMode === 1 ? delta * WHEEL.lineHeightPx : deltaMode === 2 ? delta * (pageHeight || 800) : delta;
  return Math.max(-WHEEL.mostNotches, Math.min(WHEEL.mostNotches, -pixels / WHEEL.pixelsPerNotch));
}

/** Two fingers moving apart zoom in: the notches between their last gap and this one. */
export function pinchNotches(previousGapPx: number, gapPx: number): number {
  return previousGapPx > 0 && gapPx > 0 ? Math.log(gapPx / previousGapPx) / Math.log(ZOOM_STEP) : 0;
}

/** The camera's height target after some zoom notches under the ceiling. */
export function zoomCamera(camera: OverworldCamera, notches: number, ceiling: number): OverworldCamera {
  return notches ? { ...camera, heightTarget: zoomTarget(camera.heightTarget, notches, ceiling) } : camera;
}

/** The look keys while held, radians a second: they orbit and tilt the view, not the ship. */
export const KEY_RATE = { orbit: 1.6, tilt: 0.9 } as const;

/** One frame of the look keys: `turn` +1 right, -1 left; `tilt` +1 steeper (look down), -1 shallower. */
export function keyTurn<T extends Rig>(camera: T, turn: number, tilt: number, dt: number): T {
  return turn || tilt ? turnCamera(camera, turn * KEY_RATE.orbit * dt, tilt * KEY_RATE.tilt * dt) : camera;
}
