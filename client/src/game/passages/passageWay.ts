// The way between passage zones, as the design says it plays: through a mouth the camera rises off the player over
// 1.5 s into the island seen whole, framed as an island's side is (overworld/islandView.ts `frameSide`); the way taken
// so far shows as dots, and the way being taken is drawn a dot at a time over 2 s from one zone's place to the next,
// while the room changes behind it; the camera comes down to the new zone's way in over 1.5 s, and the character walks
// 3 m in from its mouth over 1.5 s, the camera settling behind them. The player's inputs are held throughout. A lamp's
// Home plays the same, the dots running back to the patrol zone. Every point is the world's: a zone's frame stands at
// its place on the island (`PassageZone.at`), at the height of the ground there.
import { type RailKey, type RailShot, railShot } from '../../cinema/rail.ts';
import { frameSide } from '../../overworld/islandView.ts';
import { eyeFor, FIELD_OF_VIEW, poseOf, projectPoint, type Viewport } from '../../overworld/overworldCamera.ts';
import type { Point2, Vec3 } from '../../overworld/ground.ts';

/** The way's beats, seconds. */
export const RISE_S = 1.5;
export const DRAW_S = 2;
export const DOWN_S = 1.5;
export const WALK_S = 1.5;
/** How far the character walks in, metres. */
export const WALK_M = 3;
/** How many dots a leg of the way is drawn as, the next zone's place the last. */
export const LEG_DOTS = 10;
/** Where the camera settles behind the character: back along their bearing and up, metres, as on arriving. */
export const BEHIND = { backM: 4.5, upM: 2.2, lookUpM: 1.4 } as const;

const DRAWN_AT = RISE_S + DRAW_S;
const DOWN_AT = DRAWN_AT;
const WALK_AT = DOWN_AT + DOWN_S;
export const WAY_S = WALK_AT + WALK_S;

export type WayBeat = 'rise' | 'draw' | 'down' | 'walk' | 'done';

/** What the way is played from: the camera as it stood in the zone left, the places of the way so far (the patrol
 *  zone's first, then each zone passed), the place of the zone gone to (the patrol zone's for Home), every place on
 *  the island to frame (every zone of the web and the patrol zone), where the character walks in to (the zone's
 *  arrival, the world's, and its bearing, clockwise from north) and the picture's shape. */
export interface WayAsk {
  readonly from: { readonly eye: Vec3; readonly look: Vec3; readonly fov: number };
  readonly come: readonly Point2[];
  readonly to: Point2;
  readonly framed: readonly Point2[];
  readonly arrive: { readonly at: Vec3; readonly facing: number };
  readonly viewport: Viewport;
  readonly heightAt?: (x: number, y: number) => number;
}

/** A dot of the way: where it is on the island, and whether it is of the leg being taken. */
export interface WayDot {
  readonly at: Vec3;
  readonly taking: boolean;
}

/** The way at one moment: its beat, the camera, the dots shown, the character's place and bearing (null until they
 *  walk in), and whether the player's inputs are held. */
export interface WayFrame {
  readonly beat: WayBeat;
  readonly shot: RailShot;
  readonly dots: readonly WayDot[];
  readonly body: { readonly at: Vec3; readonly facing: number } | null;
  readonly held: boolean;
}

/** The way's rails worked out once: up from the zone left, held over the island, and down to behind the character
 *  where they start to walk in. */
export interface Way {
  readonly ask: WayAsk;
  readonly over: { readonly eye: Vec3; readonly look: Vec3 };
  readonly rise: readonly RailKey[];
  readonly down: readonly RailKey[];
  readonly come: readonly Vec3[];
  readonly leg: readonly Vec3[];
}

/** The bearing's unit step on the map, x east and y south. */
const along = (facing: number): Point2 => [Math.sin(facing), -Math.cos(facing)];

/** Where the camera stands behind a body and what it looks at. */
function behind(body: Vec3, facing: number): { eye: Vec3; look: Vec3 } {
  const [east, south] = along(facing);
  return {
    eye: [body[0] - east * BEHIND.backM, body[1] - south * BEHIND.backM, body[2] + BEHIND.upM],
    look: [body[0] + east * 2, body[1] + south * 2, body[2] + BEHIND.lookUpM],
  };
}

/** Where the character starts to walk in from: `WALK_M` back from the arrival along its bearing. */
function startOf(arrive: WayAsk['arrive']): Vec3 {
  const [east, south] = along(arrive.facing);
  return [arrive.at[0] - east * WALK_M, arrive.at[1] - south * WALK_M, arrive.at[2]];
}

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
  const start = behind(startOf(ask.arrive), ask.arrive.facing);
  const rise: RailKey[] = [
    { at: 0, eye: ask.from.eye, look: ask.from.look, fov: ask.from.fov },
    { at: RISE_S, eye: over.eye, look: over.look, fov: FIELD_OF_VIEW },
  ];
  const down: RailKey[] = [
    { at: 0, eye: over.eye, look: over.look, fov: FIELD_OF_VIEW },
    { at: DOWN_S, eye: start.eye, look: start.look, fov: ask.from.fov },
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
  return { ask, over, rise, down, come, leg: dotted(leaving, ask.to) };
}

/** The way `seconds` in. */
export function wayAt(way: Way, seconds: number): WayFrame {
  const { ask } = way;
  const shown = (taken: number): WayDot[] => [
    ...way.come.map((point) => ({ at: point, taking: false })),
    ...way.leg.slice(0, taken).map((point) => ({ at: point, taking: true })),
  ];
  if (seconds < RISE_S)
    return { beat: 'rise', shot: railShot(way.rise, seconds, ask.from.fov), dots: shown(0), body: null, held: true };
  const overhead = railShot(way.rise, RISE_S, ask.from.fov);
  // The draw holds its last moment too: `wayClock` waits there while the room gone to is not ready.
  if (seconds <= DRAWN_AT) {
    const taken = Math.ceil(((seconds - RISE_S) / DRAW_S) * LEG_DOTS);
    return { beat: 'draw', shot: overhead, dots: shown(taken), body: null, held: true };
  }
  const start = startOf(ask.arrive);
  if (seconds < WALK_AT) {
    const shot = railShot(way.down, seconds - DOWN_AT, ask.from.fov);
    return { beat: 'down', shot, dots: [], body: { at: start, facing: ask.arrive.facing }, held: true };
  }
  const share = Math.min(1, (seconds - WALK_AT) / WALK_S);
  const [east, south] = along(ask.arrive.facing);
  const walked = WALK_M * share;
  const walkedTo: Vec3 = [start[0] + east * walked, start[1] + south * walked, start[2]];
  const { eye, look } = behind(walkedTo, ask.arrive.facing);
  const shot = railShot([{ at: 0, eye, look, fov: ask.from.fov }], 0, ask.from.fov);
  const beat = seconds >= WAY_S ? 'done' : 'walk';
  return { beat, shot, dots: [], body: { at: walkedTo, facing: ask.arrive.facing }, held: beat !== 'done' };
}

/** The way's clock moved on by `elapsed`: it waits over the island, the leg drawn, until the room gone to is ready. */
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
