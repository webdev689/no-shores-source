// The way between passage zones, as the design says it plays: the character walks into the mouth they take, the
// camera following as on foot; it rises off them over 1.5 s into the island seen whole, framed as an island's side is
// (overworld/islandView.ts `frameSide`); the way taken so far shows as dots, and the way being taken is drawn a dot at
// a time over 2 s from one zone's place to the next, while the room changes behind it; above ground the camera comes
// down from a low framing over the place gone to into the foot's own camera over 1.5 s (under ground, whose rock and
// ceilings stand over it, it cuts to the foot's own), and the character walks in over 1.5 s, the foot's own camera
// keeping out of the walls. The player's inputs are held throughout; the walks are the room's, stepped by a walk ahead.
// A lamp's Home plays the same, the dots running back to the patrol zone. Over the island every point is the world's.
import { type RailKey, type RailShot, railShot } from '../../cinema/rail.ts';
import { frameSide } from '../../overworld/islandView.ts';
import { eyeFor, FIELD_OF_VIEW, poseOf, projectPoint, type Viewport } from '../../overworld/overworldCamera.ts';
import type { Point2, Vec3 } from '../../overworld/ground.ts';

/** The way's beats, seconds; the leave walks at most so long, and ends sooner at the mouth. */
export const LEAVE_S = 1.5;
export const RISE_S = 1.5;
export const DRAW_S = 2;
export const DOWN_S = 1.5;
export const WALK_S = 1.5;
/** How many dots a leg of the way is drawn as, the next zone's place the last. */
export const LEG_DOTS = 10;
/** The low framing the way comes down from above ground: how far back along the arrival's bearing and up from it the
 *  camera stands, and how far ahead of it the camera looks, metres: in front of the way in (3.5 m behind a hollow's
 *  arrival), the place's floor filling the view and its far walls along the top, never the sky past them. */
export const LOW = { backM: 3, upM: 10, aheadM: 12 } as const;

const DRAWN_AT = RISE_S + DRAW_S;

export type WayBeat = 'rise' | 'draw' | 'down' | 'walk' | 'done';

/** What the way is played from: the camera as it stood in the zone left, the places of the way so far (the patrol
 *  zone's first, then each zone passed), the place of the zone gone to (the patrol zone's for Home), every place on
 *  the island to frame (every zone of the web and the patrol zone), where the character stands on arriving (in the
 *  place's own frame, and its bearing, clockwise from north), whether the place is open to the sky (false under
 *  ground), and the picture's shape. */
export interface WayAsk {
  readonly from: { readonly eye: Vec3; readonly look: Vec3; readonly fov: number };
  readonly come: readonly Point2[];
  readonly to: Point2;
  readonly framed: readonly Point2[];
  readonly arrive: { readonly at: Vec3; readonly facing: number };
  readonly open: boolean;
  readonly viewport: Viewport;
  readonly heightAt?: (x: number, y: number) => number;
}

/** A dot of the way: where it is on the island, and whether it is of the leg being taken. */
export interface WayDot {
  readonly at: Vec3;
  readonly taking: boolean;
}

/** The way at one moment: its beat, the camera (over the island; from the way down, the low framing the foot's own
 *  settles from), whether the place gone to is drawn, how far the camera has settled into the foot's own (0 to 1),
 *  whether the character walks in, the dots shown, and whether the player's inputs are held. */
export interface WayFrame {
  readonly beat: WayBeat;
  readonly shot: RailShot;
  readonly inPlace: boolean;
  readonly settled: number;
  readonly walking: boolean;
  readonly dots: readonly WayDot[];
  readonly held: boolean;
}

/** The way's rails worked out once: up from the zone left and held over the island, and the low framing it comes down
 *  from. */
export interface Way {
  readonly ask: WayAsk;
  readonly over: { readonly eye: Vec3; readonly look: Vec3 };
  readonly rise: readonly RailKey[];
  readonly low: RailShot;
  readonly come: readonly Vec3[];
  readonly leg: readonly Vec3[];
}

/** The bearing's unit step on the map, x east and y south. */
const along = (facing: number): Point2 => [Math.sin(facing), -Math.cos(facing)];

/** The low framing over the arrival, looking down at the ground ahead of it. */
function lowOver(arrive: WayAsk['arrive'], fov: number): RailShot {
  const [east, south] = along(arrive.facing);
  const { at } = arrive;
  const eye: Vec3 = [at[0] - east * LOW.backM, at[1] - south * LOW.backM, at[2] + LOW.upM];
  const look: Vec3 = [at[0] + east * LOW.aheadM, at[1] + south * LOW.aheadM, at[2]];
  return railShot([{ at: 0, eye, look, fov }], 0, fov);
}

/** How long the way comes down: above ground the down beat, under ground none. */
const downOf = (way: Way): number => (way.ask.open ? DOWN_S : 0);

/** How long the way plays, the leave aside. */
export const wayLength = (way: Way): number => DRAWN_AT + downOf(way) + WALK_S;

/** Lays the way's rails: the island framed from the side of the zone left, as an island's side is framed from the
 *  ship, so every place of the web stands inside the picture. */
export function wayOf(ask: WayAsk): Way {
  const ground = (point: Point2): Vec3 => [point[0], point[1], ask.heightAt?.(point[0], point[1]) ?? 0];
  const leaving = ask.come[ask.come.length - 1] ?? ask.to;
  const nodes = [...ask.framed, ...ask.come, ask.to].map((point) => ({ at: ground(point) }));
  const aspect = ask.viewport.width / Math.max(1, ask.viewport.height);
  const rig = frameSide(leaving, nodes, aspect, ask.heightAt);
  const { eye } = eyeFor(rig.focus, rig.yaw, rig.tilt, rig.height);
  const over = { eye, look: rig.focus };
  const rise: RailKey[] = [
    { at: 0, eye: ask.from.eye, look: ask.from.look, fov: ask.from.fov },
    { at: RISE_S, eye: over.eye, look: over.look, fov: FIELD_OF_VIEW },
  ];
  const dotted = (from: Point2, to: Point2): Vec3[] =>
    Array.from({ length: LEG_DOTS }, (unused, dot) => {
      const share = (dot + 1) / LEG_DOTS;
      return ground([from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share]);
    });
  const come = ask.come.flatMap((point, index) => {
    const before = ask.come[index - 1];
    return before ? dotted(before, point) : [ground(point)];
  });
  const low = lowOver(ask.arrive, ask.from.fov);
  return { ask, over, rise, low, come, leg: dotted(leaving, ask.to) };
}

/** Eased in and out, 0 to 1. */
const eased = (share: number): number => share * share * (3 - 2 * share);

/** The way `seconds` in. */
export function wayAt(way: Way, seconds: number): WayFrame {
  const { ask } = way;
  const shown = (taken: number): WayDot[] => [
    ...way.come.map((point) => ({ at: point, taking: false })),
    ...way.leg.slice(0, taken).map((point) => ({ at: point, taking: true })),
  ];
  const island = { inPlace: false, settled: 0, walking: false, held: true } as const;
  if (seconds < RISE_S)
    return { ...island, beat: 'rise', shot: railShot(way.rise, seconds, ask.from.fov), dots: shown(0) };
  const overhead = railShot(way.rise, RISE_S, ask.from.fov);
  // The draw holds its last moment too: `wayClock` waits there while the place gone to is not ready.
  if (seconds <= DRAWN_AT) {
    const taken = Math.ceil(((seconds - RISE_S) / DRAW_S) * LEG_DOTS);
    return { ...island, beat: 'draw', shot: overhead, dots: shown(taken) };
  }
  const place = { shot: way.low, inPlace: true, dots: [], held: true } as const;
  const walkAt = DRAWN_AT + downOf(way);
  if (seconds < walkAt) {
    const settled = eased((seconds - DRAWN_AT) / DOWN_S);
    return { ...place, beat: 'down', settled, walking: false };
  }
  const beat = seconds >= wayLength(way) ? 'done' : 'walk';
  return { ...place, beat, settled: 1, walking: beat === 'walk', held: beat !== 'done' };
}

/** The way's camera settled `share` (0 to 1) of the way into the foot's own `own`, its yaw the shorter way round: at 1
 *  it is the foot's own, so the way hands the camera over where it stands. */
export function settledShot(
  shot: RailShot,
  own: Pick<RailShot, 'yaw' | 'pitch' | 'fov'> & { readonly eye: readonly [number, number, number] },
  share: number,
): RailShot {
  const blend = (from: number, to: number) => from + (to - from) * share;
  const turn = Math.atan2(Math.sin(own.yaw - shot.yaw), Math.cos(own.yaw - shot.yaw));
  return {
    eye: [blend(shot.eye[0], own.eye[0]), blend(shot.eye[1], own.eye[1]), blend(shot.eye[2], own.eye[2])],
    yaw: shot.yaw + turn * share,
    pitch: blend(shot.pitch, own.pitch),
    fov: blend(shot.fov, own.fov),
  };
}

/** The way's clock moved on by `elapsed`: it waits over the island, the leg drawn, until the place gone to is ready. */
export function wayClock(seconds: number, elapsed: number, ready: boolean): number {
  const moved = seconds + elapsed;
  return ready ? moved : Math.min(moved, Math.max(seconds, DRAWN_AT));
}

/** Where each dot stands on a picture of `viewport` shot from `shot`, those behind the eye left out. */
export function dotsOnScreen(
  shot: RailShot,
  viewport: Viewport,
  dots: readonly WayDot[],
): { readonly x: number; readonly y: number; readonly taking: boolean }[] {
  const forward: Vec3 = [
    Math.sin(shot.yaw) * Math.cos(shot.pitch),
    -Math.cos(shot.yaw) * Math.cos(shot.pitch),
    -Math.sin(shot.pitch),
  ];
  const pose = poseOf({ eye: shot.eye, forward }, shot.fov);
  return dots.flatMap((dot) => {
    const point = projectPoint(pose, viewport, dot.at);
    return point.front ? [{ x: point.x, y: point.y, taking: dot.taking }] : [];
  });
}
