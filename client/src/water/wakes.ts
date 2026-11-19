import { headingFrame } from '../rules/landRules.ts';
import { HULL_FIT, type HullMask } from './hullMask.ts';
import { smoothstep } from './shore.ts';

/**
 * What a ship under way does to the water round her: the Kelvin wake's two arms from her quarters, 19.5 degrees
 * either side of her track, laid as foam and a small wave and fading over a minute; the bow wave's arms from her
 * stem, short and steep; the churned wash in her track; and the spray her bow throws. Everything widens and
 * lengthens with her drawn size, so a ship drawn four times her size from the raised view leaves a wake to match her;
 * close in it is true size. The TypeScript mirrors WAKE_WGSL so tests can hold the shapes.
 */
export const WAKE = {
  /** The Kelvin wake's half angle, degrees, and its tangent. */
  armDeg: 19.5,
  armTan: Math.tan((19.5 * Math.PI) / 180),
  /** A wake fades out over this long, seconds: its length is her way times this. */
  fadeS: 60,
  /** An arm's foam band at her stern and how much it widens a metre aft, metres at her true size. */
  armWidthM: 0.7,
  armSpread: 0.03,
  /** The arms' wave crest at her full way, metres at her true size, and the way that is, m/s. */
  crestM: 0.18,
  fullWay: 4,
  /** The bow wave reaches this many of her lengths aft of her stem. */
  bowReach: 1.2,
  /** Her track's wash: as wide as her beam, spreading a share a metre aft, and gone in this long, seconds. */
  washSpread: 0.015,
  washS: 20,
} as const;

/** Her wake at a point: its foam (0 to 1) and the height it raises the water, metres. Mirrors WGSL wake_at. */
export function wakeAt(mask: HullMask, point: readonly [number, number]): { foam: number; height: number } {
  const scale = mask.scale ?? 1;
  const way = Math.min(1.5, mask.way / WAKE.fullWay);
  if (way <= 0) return { foam: 0, height: 0 };
  const [east, south] = [point[0] - mask.x, point[1] - mask.y];
  const { forward, starboard } = headingFrame(mask.heading);
  const along = east * forward[0] + south * forward[1];
  const across = Math.abs(east * starboard[0] + south * starboard[1]);
  const [length, beam] = [mask.halfLength * HULL_FIT, mask.halfBeam * HULL_FIT];
  return wakeTerms(along, across, length, beam, way, mask.way * scale, scale, mask.spray ?? 0);
}

/** The wake's terms for a point `along` her and `across` (unsigned) from her track, her fitted half length and beam,
 *  her way's share of a full way, her drawn way (m/s times her drawn size), her drawn size and her spray. */
function wakeTerms(
  along: number,
  across: number,
  length: number,
  beam: number,
  way: number,
  drawnWay: number,
  scale: number,
  spray: number,
): { foam: number; height: number } {
  const aft = -along - length;
  const age = aft / Math.max(drawnWay, 1e-3);
  const fading = (1 - smoothstep(0, WAKE.fadeS, age)) * smoothstep(-length * 0.3, 0, aft);
  const spread = Math.max(aft, 0);
  const arm = across - (beam + spread * WAKE.armTan);
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
  const wash = 1 - smoothstep(beam * (0.9 + spread * WAKE.washSpread), beam * (1.6 + spread * WAKE.washSpread), across);
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
 *  (wakeAt). */
export const WAKE_WGSL = /* wgsl */ `
const ARM_TAN = ${WAKE.armTan};

struct Wake {
  foam: f32,
  height: f32,
};

fn wake_terms(along: f32, across: f32, half_length: f32, half_beam: f32, way: f32, drawn_way: f32, scale: f32, spray: f32) -> Wake {
  let aft = -along - half_length;
  let age = aft / max(drawn_way, 1e-3);
  let fading = (1.0 - smoothstep(0.0, ${WAKE.fadeS}.0, age)) * smoothstep(-half_length * 0.3, 0.0, aft);
  let spread = max(aft, 0.0);
  let arm = across - (half_beam + spread * ARM_TAN);
  let width = scale * ${WAKE.armWidthM} + spread * ${WAKE.armSpread};
  let on_arm = exp(-(arm * arm) / (width * width));
  let inside = (1.0 - smoothstep(0.0, width, arm)) * smoothstep(-half_beam * 2.0, 0.0, arm) * 0.35;
  let from_stem = half_length - along;
  let bow_arm = across - from_stem * ARM_TAN * 1.6;
  let bow_width = scale * ${WAKE.armWidthM} * 0.8 + from_stem * 0.02;
  let bow_fading = smoothstep(0.0, half_length * 0.1, from_stem) * (1.0 - smoothstep(0.0, half_length * 2.0 * ${WAKE.bowReach}, from_stem));
  let on_bow = exp(-(bow_arm * bow_arm) / (bow_width * bow_width)) * bow_fading * smoothstep(0.0, 0.2, bow_arm + bow_width);
  let wash = 1.0 - smoothstep(half_beam * (0.9 + spread * ${WAKE.washSpread}), half_beam * (1.6 + spread * ${WAKE.washSpread}), across);
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
    let size = frame.hulls[index * 3u + 1u];
    if (size.w < 0.5) { break; }
    if (size.z <= 0.0) { continue; }
    let place = frame.hulls[index * 3u];
    let drawn = frame.hulls[index * 3u + 2u];
    let from_middle = offset - place.xy;
    let along = dot(from_middle, vec2f(place.z, -place.w));
    // The wake reaches a minute of her drawn way aft, and as wide as its arms have spread.
    let reach = size.z * drawn.x * ${WAKE.fadeS}.0 + size.x * 2.0;
    if (along < -size.x - reach || along > size.x * 1.5 || length(from_middle) > reach + size.x * 2.0) { continue; }
    let across = abs(dot(from_middle, place.wz));
    let way = min(1.5, size.z / ${WAKE.fullWay}.0);
    let one = wake_terms(along, across, size.x, size.y, way, size.z * drawn.x, drawn.x, drawn.y);
    all.foam = max(all.foam, one.foam);
    all.height += one.height;
  }
  return all;
}
`;
