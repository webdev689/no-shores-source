import { surfaceAt, type HeightAt, type Vec3 } from './ground.ts';

/*
 * The Overworld's camera: a raised, tilted eye over the ship, never the ship itself. World frame: metres, x east,
 * y south, z up. A yaw is a compass bearing (0 north, a quarter turn east), so a yaw's forward is (sin, -cos) on the
 * map and the screen's right is (cos, sin). A tilt is how far below the horizon the eye looks; a pitch is the same
 * angle measured upward, so a tilt's pitch is its negative. Positions reach about 4.9 million metres: every number
 * here is a 64-bit float, and the renderer draws relative to the eye.
 */

const degrees = (value: number) => (value * Math.PI) / 180;

/** The camera's height band over the ship, metres: the player's zoom moves inside it, under any cloud deck. The
 *  floor holds the eye out of the ship's rigging under a deck lower than the band. */
export const HEIGHT = { lowest: 150, highest: 450, initial: 260, floor: 40 } as const;

/** How far below the horizon the camera looks, radians. */
export const TILT = { lowest: degrees(15), highest: degrees(75), initial: degrees(52) } as const;

/** The eye stays this far under a cloud deck's base, and this far over the ground or sea under it and the line of
 *  sight to the ship, metres. */
export const CLEARANCE = { cloudM: 60, groundM: 25 } as const;

/** Lifting clear of the ground: the passes before the view steepens instead, the step it steepens by, and the
 *  farthest apart the line of sight's far half is sampled (metres). */
export const CLEAR = { passes: 8, tiltStep: degrees(5), spanM: 100 } as const;

/** Easing, per second: the height toward its target and the focus toward the ship. */
export const RATE = { height: 6, focus: 10 } as const;

/** The focus trails the ship by at most `lagM`. A ship that moves more than `jumpM` in one frame jumped (a landing,
 *  a respawn) and is taken whole; a frame's sail at the top pace, even through a second's hitch, is less. */
export const FOLLOW = { lagM: 60, jumpM: 2_000 } as const;

/** A wheel notch scales the height by this, and a dragged pixel orbits and tilts by these radians. */
export const ZOOM_STEP = 1.18;
export const DRAG = { orbitPerPx: 0.005, tiltPerPx: 0.004 } as const;

/** The suggested vertical field of view, 65 degrees: at the lowest tilt it stands the horizon about a third of the
 *  way down the picture, with the ship in its middle. */
export const FIELD_OF_VIEW = degrees(65);

/** From the air the haze reaches this far from the ship, or `perEyeM` times the eye's distance from it when that is
 *  farther; the lens's near plane is `nearShare` of that distance, never under `nearM`. */
export const HAZE = { endM: 28_000, perEyeM: 3, nearM: 2, nearShare: 0.001 } as const;

/** Where the camera looks at: the focus on the ground, the bearing it looks along, how steeply, and from how high. */
export interface Rig {
  readonly focus: Vec3;
  readonly yaw: number;
  readonly tilt: number;
  readonly height: number;
}

/** The camera's state between frames: its rig, the height the player zoomed to, and the ship's last place. */
export interface OverworldCamera extends Rig {
  readonly heightTarget: number;
  readonly feet: Vec3;
}

/** Where a picture is taken from and which way it looks. `forward` has length 1. */
export interface Shot {
  readonly eye: Vec3;
  readonly forward: Vec3;
}

/** A shot with everything a renderer needs to build its view: the eye, its unit axes and the vertical field of
 *  view in radians. */
export interface CameraPose extends Shot {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly fovY: number;
}

/** The picture's size in CSS pixels. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** A world point on the picture: pixels from its top-left corner, its depth along the look, and whether it stands in
 *  front of the eye. A point behind the eye projects through the mirror of itself. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly front: boolean;
}

const clamp = (value: number, lowest: number, highest: number) =>
  value < lowest ? lowest : value > highest ? highest : value;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mix = (a: Vec3, b: Vec3, share: number): Vec3 => [
  a[0] + (b[0] - a[0]) * share,
  a[1] + (b[1] - a[1]) * share,
  a[2] + (b[2] - a[2]) * share,
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The shortest signed turn from one bearing to another, in (-pi, pi]. */
export function angleDelta(from: number, to: number): number {
  let turn = (to - from) % (2 * Math.PI);
  if (turn > Math.PI) turn -= 2 * Math.PI;
  else if (turn <= -Math.PI) turn += 2 * Math.PI;
  return turn;
}

/** Exponential easing's share of the way for one step of `dt` seconds at `rate` a second. */
export const easeShare = (dt: number, rate: number) => 1 - Math.exp(-Math.max(0, dt) * rate);

/** Smoothstep on [0, 1]. */
export function smooth01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** The highest the camera may stand: a cloud deck's base less the margin, held inside the band's reach. No deck
 *  (null, or not a number) is the band's top. */
export function ceilingFor(cloudBase: number | null): number {
  if (cloudBase === null || !Number.isFinite(cloudBase)) return HEIGHT.highest;
  return clamp(cloudBase - CLEARANCE.cloudM, HEIGHT.floor, HEIGHT.highest);
}

/** The heights the camera may take under a ceiling, lowest and highest. */
export function heightBand(ceiling: number): readonly [number, number] {
  const highest = clamp(ceiling, HEIGHT.floor, HEIGHT.highest);
  return [Math.min(HEIGHT.lowest, highest), highest];
}

/** The unit look along a bearing at a pitch (positive up). */
export function forwardOf(yaw: number, pitch: number): Vec3 {
  const level = Math.cos(pitch);
  return [Math.sin(yaw) * level, -Math.cos(yaw) * level, Math.sin(pitch)];
}

/** The screen's right for a bearing: level, a quarter turn clockwise of it. */
export const rightOf = (yaw: number): Vec3 => [Math.cos(yaw), Math.sin(yaw), 0];

/** The screen's up for a bearing and pitch: square to the look and the right. */
export function upOf(yaw: number, pitch: number): Vec3 {
  const lean = Math.sin(pitch);
  return [-lean * Math.sin(yaw), lean * Math.cos(yaw), Math.cos(pitch)];
}

/** The bearing and pitch of a look. */
export function anglesOf(forward: Vec3): { readonly yaw: number; readonly pitch: number } {
  return { yaw: Math.atan2(forward[0], -forward[1]), pitch: Math.asin(clamp(forward[2], -1, 1)) };
}

/** The eye `height` over the focus and back from it along its bearing, so its line of sight at `tilt` passes
 *  through the focus. `back` is how far back, on the map. */
export function eyeFor(focus: Vec3, yaw: number, tilt: number, height: number): Shot & { readonly back: number } {
  const back = height / Math.tan(tilt);
  return {
    eye: [focus[0] - Math.sin(yaw) * back, focus[1] + Math.cos(yaw) * back, focus[2] + height],
    forward: forwardOf(yaw, -tilt),
    back,
  };
}

/** How many steps the far half of a line of sight `length` metres long is sampled in: the middle and the eye at
 *  least, and no two samples further apart than the span. */
export const clearSteps = (length: number) =>
  Math.max(1, Math.ceil((Number.isFinite(length) ? length : 0) / (2 * CLEAR.spanM)));

/** Lifts the eye until it and the far half of its line of sight keep their clearance over the ground and the sea.
 *  The near half is never asked: lifting the eye barely moves a point near the ship, so no lift clears it. */
function clearing(focus: Vec3, yaw: number, tilt: number, height: number, heightAt: HeightAt) {
  let lifted = height;
  for (let pass = 0; pass < CLEAR.passes; pass++) {
    const { eye } = eyeFor(focus, yaw, tilt, lifted);
    const steps = clearSteps(distance(eye, focus));
    let lift = 0;
    for (let k = 0; k <= steps; k++) {
      const share = 0.5 + k / (2 * steps);
      const sample = mix(focus, eye, share);
      // A point this share of the way to the eye rises by the share of every metre the eye rises.
      lift = Math.max(lift, (surfaceAt(heightAt, sample[0], sample[1]) + CLEARANCE.groundM - sample[2]) / share);
    }
    if (!(lift > 0)) return { height: lifted, clear: true };
    lifted += lift;
  }
  return { height: lifted, clear: false };
}

/** The height the eye must take to clear the ground and sea: never less than the one asked for. */
export function clearHeight(focus: Vec3, yaw: number, tilt: number, height: number, heightAt: HeightAt): number {
  return clearing(focus, yaw, tilt, height, heightAt).height;
}

/** The height and tilt that clear the ground: the player's own tilt where lifting clears it; where ground behind the
 *  eye out-climbs every lift, a steeper view, step by step up to the tilt's top. */
export function clearView(
  focus: Vec3,
  yaw: number,
  tilt: number,
  height: number,
  heightAt: HeightAt,
): { readonly height: number; readonly tilt: number } {
  for (let steeper = tilt; ; steeper = Math.min(TILT.highest, steeper + CLEAR.tiltStep)) {
    const cleared = clearing(focus, yaw, steeper, height, heightAt);
    if (cleared.clear || steeper >= TILT.highest) return { height: cleared.height, tilt: steeper };
  }
}

/** The shot a rig takes, lifted or steepened clear of the ground when `heightAt` is given. */
export function shotOf(rig: Rig, heightAt?: HeightAt): Shot & { readonly height: number; readonly tilt: number } {
  const view = heightAt ? clearView(rig.focus, rig.yaw, rig.tilt, rig.height, heightAt) : rig;
  const { eye, forward } = eyeFor(rig.focus, rig.yaw, view.tilt, view.height);
  return { eye, forward, height: view.height, tilt: view.tilt };
}

/** A fresh camera over a ship heading `yaw`: behind it, at the initial height and tilt. */
export function initialCamera(feet: Vec3, yaw: number): OverworldCamera {
  return {
    focus: [feet[0], feet[1], feet[2]],
    yaw,
    tilt: TILT.initial,
    height: HEIGHT.initial,
    heightTarget: HEIGHT.initial,
    feet: [feet[0], feet[1], feet[2]],
  };
}

/** A wheel's notches (positive in) as a new height target, inside the band under the ceiling. */
export function zoomTarget(target: number, notches: number, ceiling: number): number {
  const [lowest, highest] = heightBand(ceiling);
  return clamp(target * ZOOM_STEP ** -notches, lowest, highest);
}

/** The camera turned by radians: its bearing by `yawChange`, its tilt by `tiltChange` (positive steeper), held to
 *  the tilt's band. */
export function turnCamera<T extends Rig>(camera: T, yawChange: number, tiltChange: number): T {
  return { ...camera, yaw: camera.yaw + yawChange, tilt: clamp(camera.tilt + tiltChange, TILT.lowest, TILT.highest) };
}

/** A drag of pixels: across orbits, down steepens. */
export const orbitBy = <T extends Rig>(camera: T, acrossPx: number, downPx: number): T =>
  turnCamera(camera, acrossPx * DRAG.orbitPerPx, downPx * DRAG.tiltPerPx);

/**
 * One frame: the focus eased onto the ship (a jump taken whole, the lag held), the height eased toward the player's
 * zoom under the ceiling, and the shot lifted clear of the ground. The zoom is kept while a low deck holds the height
 * under it, so the camera climbs back once the deck lifts.
 */
export function stepCamera(
  camera: OverworldCamera,
  frame: { readonly feet: Vec3; readonly dt: number; readonly ceiling: number; readonly heightAt?: HeightAt },
): { readonly camera: OverworldCamera; readonly shot: Shot & { readonly height: number; readonly tilt: number } } {
  const { feet, dt, ceiling, heightAt } = frame;
  const jumped = distance(feet, camera.feet) > FOLLOW.jumpM;
  let focus = mix(camera.focus, feet, jumped ? 1 : easeShare(dt, RATE.focus));
  const lag = distance(feet, focus);
  if (lag > FOLLOW.lagM) focus = mix(focus, feet, 1 - FOLLOW.lagM / lag);
  const [lowest, highest] = heightBand(ceiling);
  const wanted = clamp(camera.heightTarget, lowest, highest);
  const eased = jumped ? wanted : camera.height + (wanted - camera.height) * easeShare(dt, RATE.height);
  const next: OverworldCamera = { ...camera, focus, height: clamp(eased, lowest, highest), feet: [...feet] };
  return { camera: next, shot: shotOf(next, heightAt) };
}

/** A shot as a renderer's pose: its right and up from its angles, so the horizon stays level. */
export function poseOf(shot: Shot, fovY: number = FIELD_OF_VIEW): CameraPose {
  const { yaw, pitch } = anglesOf(shot.forward);
  return { eye: shot.eye, forward: shot.forward, right: rightOf(yaw), up: upOf(yaw, pitch), fovY };
}

/** Pixels from the picture's middle to its edge, per unit of a point's offset over its depth. */
const focalPx = (pose: CameraPose, viewport: Viewport) => viewport.height / 2 / Math.tan(pose.fovY / 2);

/** Where a world point stands on the picture. */
export function projectPoint(pose: CameraPose, viewport: Viewport, point: Vec3): ScreenPoint {
  const offset: Vec3 = [point[0] - pose.eye[0], point[1] - pose.eye[1], point[2] - pose.eye[2]];
  const depth = dot(offset, pose.forward);
  const scale = focalPx(pose, viewport) / (depth > 0 ? Math.max(depth, 1e-9) : Math.min(depth, -1e-9));
  return {
    x: viewport.width / 2 + dot(offset, pose.right) * scale,
    y: viewport.height / 2 - dot(offset, pose.up) * scale,
    depth,
    front: depth > 0,
  };
}

/** The unit direction from the eye through a pixel of the picture. */
export function rayThrough(pose: CameraPose, viewport: Viewport, x: number, y: number): Vec3 {
  const focal = focalPx(pose, viewport);
  const [across, rise] = [(x - viewport.width / 2) / focal, (viewport.height / 2 - y) / focal];
  const direction: Vec3 = [
    pose.forward[0] + pose.right[0] * across + pose.up[0] * rise,
    pose.forward[1] + pose.right[1] * across + pose.up[1] * rise,
    pose.forward[2] + pose.right[2] * across + pose.up[2] * rise,
  ];
  const length = Math.hypot(...direction);
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

/**
 * The haze's end and the lens's planes from the air, metres. The haze runs out to where the land meets the sky, the
 * far plane past it, and the near plane grows with the eye's distance so depth keeps its precision far out. None
 * comes nearer than the ground's own (`ground`).
 */
export function horizonOf(
  ground: { readonly fogEndM: number; readonly nearM: number; readonly farM: number },
  eyeDistanceM: number,
): { readonly fogEndM: number; readonly nearM: number; readonly farM: number } {
  const fogEnd = Math.max(HAZE.endM, HAZE.perEyeM * eyeDistanceM);
  const near = Math.max(HAZE.nearM, HAZE.nearShare * eyeDistanceM);
  return {
    fogEndM: Math.max(ground.fogEndM, fogEnd),
    nearM: Math.max(ground.nearM, near),
    farM: Math.max(ground.farM, fogEnd + eyeDistanceM),
  };
}
