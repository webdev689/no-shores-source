import { headingFrame } from '../rules/landRules.ts';
import { smoothstep } from './shore.ts';

/**
 * A ship's footprint on the water: no water inside her waterline, and her bow wave's foam round it. The TypeScript
 * mirrors the WGSL the water's surface runs (HULL_WGSL), so tests can hold the shapes.
 */
/** A ship's footprint on the water (window metres): her middle, her heading (radians clockwise from north), half
 *  her waterline's length and beam, and her way (m/s). The water's surface keeps out of it and foams round it. */
export interface HullMask {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly halfLength: number;
  readonly halfBeam: number;
  readonly way: number;
}

/** The share of her waterline the footprint fills: a hair inside it, so no water is cut away round her hull. */
export const HULL_FIT = 0.95;
/** How far her bow wave's foam reaches past her footprint, metres, and the way it is whole at (m/s). */
export const HULL_FOAM_M = 0.6;
export const HULL_FOAM_WAY = 2;

/** A point against her footprint's ellipse: metres along her (bow positive) and how far outside its edge it lies
 *  (negative inside), to first order. Mirrors WGSL hull_edge. */
function hullEdge(mask: HullMask, point: readonly [number, number]): { along: number; outside: number } {
  const [east, south] = [point[0] - mask.x, point[1] - mask.y];
  const { forward, starboard } = headingFrame(mask.heading);
  const along = east * forward[0] + south * forward[1];
  const across = east * starboard[0] + south * starboard[1];
  const [length, beam] = [mask.halfLength * HULL_FIT, mask.halfBeam * HULL_FIT];
  const reach = Math.hypot(along / length, across / beam);
  const rise = Math.hypot(along / (length * length), across / (beam * beam));
  return { along, outside: rise > 1e-6 ? ((reach - 1) * reach) / rise : -beam };
}

/** How much of a point is inside her footprint (1 within, 0 past its edge, eased over a pixel's footprint). Mirrors
 *  WGSL hull_inside. */
export function hullInside(mask: HullMask, point: readonly [number, number], footprint: number): number {
  return 1 - smoothstep(-footprint, 0, hullEdge(mask, point).outside);
}

/** Her bow wave's foam at a point: a band round her footprint, whole at her full way and most at her bow. Mirrors
 *  WGSL hull_foam. */
export function hullFoam(mask: HullMask, point: readonly [number, number]): number {
  const { along, outside } = hullEdge(mask, point);
  const band = smoothstep(-0.05, 0, outside) * (1 - smoothstep(0, HULL_FOAM_M, outside));
  const bow = 0.25 + 0.75 * Math.min(1, Math.max(0, along / mask.halfLength / 2 + 0.5));
  return band * bow * Math.min(1, mask.way / HULL_FOAM_WAY);
}

/** How many ships' footprints the water holds: the player's and the ships nearest her, other players', the pirates
 *  round her and a fight's captains. */
export const HULLS = 8;

/** The footprints' WGSL, read from the water's frame (`hulls`: each ship's place, then her size). */
export const HULL_WGSL = /* wgsl */ `
// A point (from the eye) against a ship's footprint: metres along her and outside its edge (WGSL of hullEdge).
fn hull_edge(index: u32, offset: vec2f) -> vec2f {
  let place = frame.hulls[index * 2u];
  let from_middle = offset - place.xy;
  let along = dot(from_middle, vec2f(place.z, -place.w));
  let across = dot(from_middle, place.wz);
  let size = frame.hulls[index * 2u + 1u].xy;
  let reach = length(vec2f(along, across) / size);
  let rise = length(vec2f(along, across) / (size * size));
  return vec2f(along, select(-size.y, (reach - 1.0) * reach / rise, rise > 1e-6));
}

// How much of a point is inside a ship's footprint: a waterline holds no water (hullInside).
fn hull_inside(offset: vec2f, footprint: f32) -> f32 {
  var inside = 0.0;
  for (var index = 0u; index < ${HULLS}u; index++) {
    if (frame.hulls[index * 2u + 1u].w < 0.5) { continue; }
    inside = max(inside, 1.0 - smoothstep(-footprint, 0.0, hull_edge(index, offset).y));
  }
  return inside;
}

// The bow waves' foam round the footprints (hullFoam).
fn hull_foam(offset: vec2f) -> f32 {
  var foam = 0.0;
  for (var index = 0u; index < ${HULLS}u; index++) {
    let size = frame.hulls[index * 2u + 1u];
    if (size.w < 0.5) { continue; }
    let edge = hull_edge(index, offset);
    let band = smoothstep(-0.05, 0.0, edge.y) * (1.0 - smoothstep(0.0, ${HULL_FOAM_M}, edge.y));
    let bow = 0.25 + 0.75 * clamp(edge.x / (size.x / ${HULL_FIT}) / 2.0 + 0.5, 0.0, 1.0);
    foam = max(foam, band * bow * min(1.0, size.z / ${HULL_FOAM_WAY.toFixed(1)}));
  }
  return foam;
}
`;
