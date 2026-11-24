import { headingFrame } from '../rules/landRules.ts';
import { HULL_FIT, type HullMask, STATIONS, TRACK } from './hullMask.ts';
import { smoothstep } from './shore.ts';

/**
 * What a ship under way does to the water round it: the Kelvin wake's two arms from its quarters, 19.5 degrees
 * either side of its track, laid as foam and a small wave and fading over a minute; the bow wave's arms from its
 * stem, short and steep; the churned wash in its track; and the spray its bow throws. Everything widens and
 * lengthens with its drawn size, so a ship drawn four times its size from the raised view leaves a wake to match it;
 * close in it is true size. The TypeScript mirrors WAKE_WGSL so tests can hold the shapes.
 */
export const WAKE = {
  /** The Kelvin wake's half angle, degrees, and its tangent. */
  armDeg: 19.5,
  armTan: Math.tan((19.5 * Math.PI) / 180),
  /** A wake fades out over this long, seconds: its length is its way times this. */
  fadeS: 60,
  /** An arm's foam band at its stern and how much it widens a metre aft, metres at its true size. */
  armWidthM: 0.7,
  armSpread: 0.03,
  /** The arms' wave crest at its full way, metres at its true size, and the way that is, m/s. */
  crestM: 0.18,
  fullWay: 4,
  /** The bow wave reaches this many of its lengths aft of its stem. */
  bowReach: 1.2,
  /** Its track's wash: as wide as its beam, spreading a share a metre aft, and gone in this long, seconds. */
  washSpread: 0.015,
  washS: 20,
  /** Its track's points (`TRACK`) lie each this many times farther aft than the last, close where a turn shows. */
  trackGrowth: 1.6,
  /** The water keeps where a ship's stern was each time it has run this far, metres, or this share of its wake's run
   *  if more; one moved farther than this at once was carried there, not sailed, and its track begins again. */
  trackStepM: 2,
  trackSteps: 128,
  trackJumpM: 200,
  /** A track within this of a line straight aft, metres at its true size, is read as that line. */
  straightM: 0.05,
} as const;

/** A ship's track as the water reads it: `TRACK` points, its stern first, then back along the way its stern went,
 *  each its window metres east and south, its metres aft of its stern along the track, and one over the square of the
 *  step to the next; at the last, 1 where the track runs straight aft, which the water reads as a line. */
export type Track = Float32Array;

/** How far aft of its stern its wake runs as drawn, metres: a minute of its drawn way. */
const wakeRun = (mask: HullMask): number => mask.way * (mask.scale ?? 1) * WAKE.fadeS;

/** Its track's points past its stern, as shares of its wake's run. */
const TRACK_SHARES = Array.from(
  { length: TRACK - 1 },
  (_value, point) => (WAKE.trackGrowth ** (point + 1) - 1) / (WAKE.trackGrowth ** (TRACK - 1) - 1),
);

/** Its track from its stern now back along where its stern was (`sterns`, world metres, oldest first; `world` the
 *  window's north-west corner in the world), and on along its last step past the end of them: with none, straight aft
 *  along its heading. */
export function trackOf(
  mask: HullMask,
  sterns: readonly (readonly [number, number])[] = [],
  world: readonly [number, number] = [0, 0],
): Track {
  const { forward } = headingFrame(mask.heading);
  const length = mask.halfLength * HULL_FIT;
  const run = Math.max(wakeRun(mask), length);
  const stern = [mask.x - forward[0] * length + world[0], mask.y - forward[1] * length + world[1]] as const;
  const points: (readonly [number, number])[] = [stern];
  let [from, before, next, walked] = [
    stern as readonly [number, number],
    stern as readonly [number, number],
    sterns.length - 1,
    0,
  ];
  for (const share of TRACK_SHARES) {
    const distance = share * run;
    let to = sterns[next];
    for (; to; to = sterns[--next]) {
      const step = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (walked + step >= distance && step > 0) break;
      walked += step;
      [before, from] = [from, to];
    }
    if (to) {
      const share = (distance - walked) / Math.hypot(to[0] - from[0], to[1] - from[1]);
      points.push([from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share]);
    } else {
      const away = [from[0] - before[0], from[1] - before[1]] as const;
      const size = Math.hypot(away[0], away[1]);
      const [east, south] = size > 1e-6 ? [away[0] / size, away[1] / size] : [-forward[0], -forward[1]];
      points.push([from[0] + east * (distance - walked), from[1] + south * (distance - walked)]);
    }
  }
  const track = new Float32Array(TRACK * 4);
  let [aft, bent] = [0, 0];
  for (const [index, [east, south]] of points.entries()) {
    const [nextEast, nextSouth] = points[index + 1] ?? [east, south];
    const step = (nextEast - east) ** 2 + (nextSouth - south) ** 2;
    track.set([east - world[0], south - world[1], aft, step > 1e-6 ? 1 / step : 0], index * 4);
    // How far it lies from where a track straight aft would put it.
    bent = Math.max(bent, Math.hypot(east - (stern[0] - forward[0] * aft), south - (stern[1] - forward[1] * aft)));
    aft += Math.sqrt(step);
  }
  track[TRACK * 4 - 1] = bent < WAKE.straightM * (mask.scale ?? 1) ? 1 : 0;
  return track;
}

/** Whether its track runs straight aft, so the water reads it as a line. */
const straight = (track: Track): boolean => (track[TRACK * 4 - 1] ?? 0) > 0.5;

/** Where a point lies against a track: its metres aft of the stern along it (less than 0 ahead of the stern) and how
 *  far from it. The first step runs on ahead of the stern and the last on aft. Mirrors WGSL track_frame. */
export function trackFrame(track: Track, point: readonly [number, number]): { aft: number; across: number } {
  let [nearest, aft] = [Number.POSITIVE_INFINITY, 0];
  for (let index = 0; index + 1 < TRACK; index++) {
    const [east = 0, south = 0, from = 0, inverse = 0] = track.subarray(index * 4, index * 4 + 4);
    const [nextEast = 0, nextSouth = 0, to = 0] = track.subarray(index * 4 + 4, index * 4 + 8);
    const step = [nextEast - east, nextSouth - south] as const;
    const off = [point[0] - east, point[1] - south] as const;
    let share = (off[0] * step[0] + off[1] * step[1]) * inverse;
    if (index > 0) share = Math.max(share, 0);
    if (index + 2 < TRACK) share = Math.min(share, 1);
    const far = (off[0] - step[0] * share) ** 2 + (off[1] - step[1] * share) ** 2;
    if (far < nearest) [nearest, aft] = [far, from + (to - from) * share];
  }
  return { aft, across: Math.sqrt(nearest) };
}

/** The water's memory of where each ship it draws has sailed, by its id: where its stern was, in world metres (its
 *  window may move), each time it has run a 128th of its wake's run (2 m at least), as far back as its wake runs. A
 *  ship at rest or carried somewhere begins its track again, one going astern lays none over where it backs, and one
 *  gone from the water is forgotten. */
export class WakeTracks {
  private sterns = new Map<string, [number, number][]>();

  /** Each ship's track now, `world` the window's north-west corner in the world: one without an id, straight aft. */
  tracks(hulls: readonly HullMask[], world: readonly [number, number]): Track[] {
    const kept = new Map<string, [number, number][]>();
    const tracks = hulls.map((hull) => {
      if (hull.id === undefined) return trackOf(hull);
      const { forward } = headingFrame(hull.heading);
      const length = hull.halfLength * HULL_FIT;
      const here: [number, number] = [hull.x - forward[0] * length + world[0], hull.y - forward[1] * length + world[1]];
      const run = wakeRun(hull);
      const path = hull.way > 0 ? (this.sterns.get(hull.id) ?? []) : [];
      // Where it has since gone astern of lies ahead of its stern now, and is no part of its track.
      const ahead = (point: readonly [number, number]) =>
        (point[0] - here[0]) * forward[0] + (point[1] - here[1]) * forward[1] > 1e-3;
      while (path.length > 0 && ahead(path[path.length - 1] ?? here)) path.pop();
      const last = path[path.length - 1];
      const moved = last ? [here[0] - last[0], here[1] - last[1]] : [Number.POSITIVE_INFINITY, 0];
      const gone = Math.hypot(moved[0] ?? 0, moved[1] ?? 0);
      if (last && gone > WAKE.trackJumpM) path.length = 0;
      if (gone >= Math.max(WAKE.trackStepM, run / WAKE.trackSteps)) path.push(here);
      // Forget what lies past its wake's run, keeping the point just beyond it.
      const newest = path[path.length - 1] ?? here;
      let walked = Math.hypot(here[0] - newest[0], here[1] - newest[1]);
      for (let index = path.length - 1; index > 0; index--) {
        const [newer = here, older = here] = [path[index], path[index - 1]];
        walked += Math.hypot(newer[0] - older[0], newer[1] - older[1]);
        if (walked > run + WAKE.trackStepM) {
          path.splice(0, index - 1);
          break;
        }
      }
      kept.set(hull.id, path);
      return trackOf(hull, path, world);
    });
    this.sterns = kept;
    return tracks;
  }
}

/** The box (window metres: west, north, east, south) its wake and bow wave lie within, round its track. */
export function wakeBounds(mask: HullMask, track: Track): [number, number, number, number] {
  const scale = mask.scale ?? 1;
  const [length, beam] = [mask.halfLength * HULL_FIT, mask.halfBeam * HULL_FIT];
  const [run, wide] = [wakeRun(mask), scale * WAKE.armWidthM * 3];
  // Its arms reach three of their widths past where they spread to; its wash, its widest.
  const arms = beam + run * (WAKE.armTan + 3 * WAKE.armSpread) + wide;
  const reach = Math.max(arms, beam * (1.7 + run * WAKE.washSpread));
  const round = length * 2.5 + beam * 3 + wide;
  const box: [number, number, number, number] = [mask.x - round, mask.y - round, mask.x + round, mask.y + round];
  for (let index = 0; index < TRACK; index++) {
    const [east = 0, south = 0] = track.subarray(index * 4, index * 4 + 2);
    box[0] = Math.min(box[0], east - reach);
    box[1] = Math.min(box[1], south - reach);
    box[2] = Math.max(box[2], east + reach);
    box[3] = Math.max(box[3], south + reach);
  }
  return box;
}

/** The water's numbers for its track and its wake's box, measured from the eye (hullValues). */
export function wakeValues(mask: HullMask, track: Track, eye: readonly [number, number]): Float32Array {
  const out = new Float32Array((TRACK + 1) * 4);
  for (let index = 0; index < TRACK; index++) {
    const [east = 0, south = 0, aft = 0, inverse = 0] = track.subarray(index * 4, index * 4 + 4);
    out.set([east - eye[0], south - eye[1], aft, inverse], index * 4);
  }
  const [west, north, east, south] = wakeBounds(mask, track);
  out.set([west - eye[0], north - eye[1], east - eye[0], south - eye[1]], TRACK * 4);
  return out;
}

/** Its wake at a point, its track `track` (straight aft without one): its foam (0 to 1) and the height it raises the
 *  water, metres. Mirrors WGSL wake_at. */
export function wakeAt(
  mask: HullMask,
  point: readonly [number, number],
  track: Track = trackOf(mask),
): { foam: number; height: number } {
  const scale = mask.scale ?? 1;
  const way = Math.min(1.5, mask.way / WAKE.fullWay);
  if (way <= 0) return { foam: 0, height: 0 };
  const [east, south] = [point[0] - mask.x, point[1] - mask.y];
  const { forward, starboard } = headingFrame(mask.heading);
  const along = east * forward[0] + south * forward[1];
  const across = Math.abs(east * starboard[0] + south * starboard[1]);
  const [length, beam] = [mask.halfLength * HULL_FIT, mask.halfBeam * HULL_FIT];
  const sailed = straight(track) ? { aft: -along - length, across } : trackFrame(track, point);
  return wakeTerms(
    sailed.aft,
    sailed.across,
    along,
    across,
    length,
    beam,
    way,
    mask.way * scale,
    scale,
    mask.spray ?? 0,
  );
}

/** The wake's terms for a point `aft` of its stern along its track and `fromTrack` off it, and `along` and `across`
 *  (unsigned) its hull now, for its bow wave and spray; its fitted half length and beam, its way's share of a full
 *  way, its drawn way (m/s times its drawn size), its drawn size and its spray. */
function wakeTerms(
  aft: number,
  fromTrack: number,
  along: number,
  across: number,
  length: number,
  beam: number,
  way: number,
  drawnWay: number,
  scale: number,
  spray: number,
): { foam: number; height: number } {
  const age = aft / Math.max(drawnWay, 1e-3);
  const fading = (1 - smoothstep(0, WAKE.fadeS, age)) * smoothstep(-length * 0.3, 0, aft);
  const spread = Math.max(aft, 0);
  const arm = fromTrack - (beam + spread * WAKE.armTan);
  const width = scale * WAKE.armWidthM + spread * WAKE.armSpread;
  const onArm = Math.exp(-(arm * arm) / (width * width));
  // Inside the V the arms' transverse waves fade; outside them the water lies still.
  const inside = (1 - smoothstep(0, width, arm)) * smoothstep(-beam * 2, 0, arm) * 0.35;
  const fromStem = length - along;
  const bowArm = across - fromStem * WAKE.armTan * 1.6;
  const bowWidth = scale * WAKE.armWidthM * 0.8 + fromStem * 0.02;
  const bowFading = smoothstep(0, length * 0.1, fromStem) * (1 - smoothstep(0, length * 2 * WAKE.bowReach, fromStem));
  const onBow =
    Math.exp(-(bowArm * bowArm) / (bowWidth * bowWidth)) * bowFading * smoothstep(0, 0.2, bowArm + bowWidth);
  const wash =
    1 - smoothstep(beam * (0.9 + spread * WAKE.washSpread), beam * (1.6 + spread * WAKE.washSpread), fromTrack);
  const washed = wash * (1 - smoothstep(0, WAKE.washS, age)) * smoothstep(-length * 0.1, length * 0.2, aft);
  const nearBow = Math.max(0, 1 - Math.hypot((along - length * 0.95) / (length * 0.45), across / (beam * 2.4)));
  const sprayed = spray * nearBow;
  const foam = Math.min(
    1,
    way * (onArm * fading * 0.75 + inside * fading * 0.3 + washed * 0.85 + onBow * 0.8) + sprayed,
  );
  const height = WAKE.crestM * scale * way * (onArm * fading + onBow * 1.4);
  return { foam, height };
}

/** The wakes' WGSL, read from the water's frame (`hulls`): the foam and the raised water every ship under way leaves
 *  (wakeAt), along the track it sailed. */
export const WAKE_WGSL = /* wgsl */ `
const ARM_TAN = ${WAKE.armTan};
const TRACK = ${TRACK}u;
const TRACK_AT = ${3 + STATIONS / 4}u;
const WAKE_BOX_AT = ${3 + STATIONS / 4 + TRACK}u;

struct Wake {
  foam: f32,
  height: f32,
};

// Where a point (from the eye) lies against a ship's track: metres aft of its stern along it, and off it (trackFrame).
fn track_frame(index: u32, offset: vec2f) -> vec2f {
  let first = index * HULL_VECTORS + TRACK_AT;
  var nearest = 1e30;
  var aft = 0.0;
  for (var point = 0u; point + 1u < TRACK; point++) {
    let start = frame.hulls[first + point];
    let next = frame.hulls[first + point + 1u];
    let step = next.xy - start.xy;
    let off = offset - start.xy;
    var share = dot(off, step) * start.w;
    if (point > 0u) { share = max(share, 0.0); }
    if (point + 2u < TRACK) { share = min(share, 1.0); }
    let gap = off - step * share;
    let far = dot(gap, gap);
    if (far < nearest) {
      nearest = far;
      aft = mix(start.z, next.z, share);
    }
  }
  return vec2f(aft, sqrt(nearest));
}

fn wake_terms(aft: f32, from_track: f32, along: f32, across: f32, half_length: f32, half_beam: f32, way: f32, drawn_way: f32, scale: f32, spray: f32) -> Wake {
  let age = aft / max(drawn_way, 1e-3);
  let fading = (1.0 - smoothstep(0.0, ${WAKE.fadeS}.0, age)) * smoothstep(-half_length * 0.3, 0.0, aft);
  let spread = max(aft, 0.0);
  let arm = from_track - (half_beam + spread * ARM_TAN);
  let width = scale * ${WAKE.armWidthM} + spread * ${WAKE.armSpread};
  let on_arm = exp(-(arm * arm) / (width * width));
  let inside = (1.0 - smoothstep(0.0, width, arm)) * smoothstep(-half_beam * 2.0, 0.0, arm) * 0.35;
  let from_stem = half_length - along;
  let bow_arm = across - from_stem * ARM_TAN * 1.6;
  let bow_width = scale * ${WAKE.armWidthM} * 0.8 + from_stem * 0.02;
  let bow_fading = smoothstep(0.0, half_length * 0.1, from_stem) * (1.0 - smoothstep(0.0, half_length * 2.0 * ${WAKE.bowReach}, from_stem));
  let on_bow = exp(-(bow_arm * bow_arm) / (bow_width * bow_width)) * bow_fading * smoothstep(0.0, 0.2, bow_arm + bow_width);
  let wash = 1.0 - smoothstep(half_beam * (0.9 + spread * ${WAKE.washSpread}), half_beam * (1.6 + spread * ${WAKE.washSpread}), from_track);
  let washed = wash * (1.0 - smoothstep(0.0, ${WAKE.washS}.0, age)) * smoothstep(-half_length * 0.1, half_length * 0.2, aft);
  let near_bow = max(0.0, 1.0 - length(vec2f((along - half_length * 0.95) / (half_length * 0.45), across / (half_beam * 2.4))));
  let sprayed = spray * near_bow;
  var wake: Wake;
  wake.foam = min(1.0, way * (on_arm * fading * 0.75 + inside * fading * 0.3 + washed * 0.85 + on_bow * 0.8) + sprayed);
  wake.height = ${WAKE.crestM} * scale * way * (on_arm * fading + on_bow * 1.4);
  return wake;
}

// Every ship's wake at a point from the eye: the most foam of any, and the sum of their raised water.
fn wake_at(offset: vec2f) -> Wake {
  var all: Wake;
  for (var index = 0u; index < HULLS; index++) {
    let size = frame.hulls[index * HULL_VECTORS + 1u];
    if (size.w < 0.5) { break; }
    if (size.z <= 0.0) { continue; }
    // Its wake and bow wave lie within a box round its track (wakeBounds).
    let box = frame.hulls[index * HULL_VECTORS + WAKE_BOX_AT];
    if (any(offset < box.xy) || any(offset > box.zw)) { continue; }
    let place = frame.hulls[index * HULL_VECTORS];
    let drawn = frame.hulls[index * HULL_VECTORS + 2u];
    let from_middle = offset - place.xy;
    let along = dot(from_middle, vec2f(place.z, -place.w));
    let across = abs(dot(from_middle, place.wz));
    var sailed = vec2f(-along - size.x, across);
    if (frame.hulls[index * HULL_VECTORS + TRACK_AT + TRACK - 1u].w < 0.5) { sailed = track_frame(index, offset); }
    let way = min(1.5, size.z / ${WAKE.fullWay}.0);
    let one = wake_terms(sailed.x, sailed.y, along, across, size.x, size.y, way, size.z * drawn.x, drawn.x, drawn.y);
    all.foam = max(all.foam, one.foam);
    all.height += one.height;
  }
  return all;
}
`;
