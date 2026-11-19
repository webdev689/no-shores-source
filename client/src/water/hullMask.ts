import { headingFrame } from '../rules/landRules.ts';
import { HULL_NAMES } from '../ships/hulls.ts';
import { FAIR_LINE, lineAt, STATIONS } from './hullLines.ts';
import { smoothstep } from './shore.ts';

/**
 * A ship's footprint on the water: no water inside her own hull line at her waterline, and foam along it, most at her
 * bow. The TypeScript mirrors the WGSL the water's surface runs (HULL_WGSL), so tests can hold the shapes.
 */
/** A ship's footprint on the water (window metres): her middle, her heading (radians clockwise from north), half
 *  her waterline's length and beam as drawn, her way (m/s), her hull (0 the Sloop to 3 the Frigate: her line), how
 *  many times her size she is drawn (her wake and foam widen with her), and her bow's spray now, 0 to 1. */
export interface HullMask {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly halfLength: number;
  readonly halfBeam: number;
  readonly way: number;
  readonly hull?: number;
  readonly scale?: number;
  readonly spray?: number;
}

/** The share of her waterline the footprint fills: a hair inside it, so no water is cut away round her hull. */
export const HULL_FIT = 0.97;
/** How far the foam along her sides reaches past her hull line at her true size, metres, and the way it is whole at
 *  (m/s). */
export const HULL_FOAM_M = 0.8;
export const HULL_FOAM_WAY = 2;
/** How many ships the water draws, nearest the eye first: every ship of a full sea in view (a sea room's players and
 *  its pirates) while each water pixel's walk over them stays within the swell's own cost. */
export const HULLS = 48;
/** The water's frame holds four numbers a ship this many times. */
export const HULL_VECTORS = 3;

/** A point against her hull line: metres along her (bow positive) and how far outside it it lies (negative inside),
 *  `line` her half beam stern to bow. Mirrors WGSL hull_edge. */
export function hullEdge(
  mask: HullMask,
  point: readonly [number, number],
  line: Float32Array = FAIR_LINE,
): { along: number; across: number; outside: number } {
  const [east, south] = [point[0] - mask.x, point[1] - mask.y];
  const { forward, starboard } = headingFrame(mask.heading);
  const along = east * forward[0] + south * forward[1];
  const across = east * starboard[0] + south * starboard[1];
  const [length, beam] = [mask.halfLength * HULL_FIT, mask.halfBeam * HULL_FIT];
  const beside = Math.abs(across) - beam * lineAt(line, along / length);
  return { along, across, outside: Math.max(beside, Math.abs(along) - length) };
}

/** How much of a point is inside her hull line (1 within, 0 past it, eased over a pixel's footprint). Mirrors WGSL
 *  hull_inside. */
export function hullInside(
  mask: HullMask,
  point: readonly [number, number],
  footprint: number,
  line?: Float32Array,
): number {
  return 1 - smoothstep(-footprint, 0, hullEdge(mask, point, line).outside);
}

/** The foam along her sides at a point: a band outside her hull line, widening with her drawn size, whole at her full
 *  way and most at her bow. Mirrors WGSL hull_foam. */
export function hullFoam(mask: HullMask, point: readonly [number, number], line?: Float32Array): number {
  const { along, outside } = hullEdge(mask, point, line);
  const width = HULL_FOAM_M * (mask.scale ?? 1);
  const band = smoothstep(-0.05, 0, outside) * (1 - smoothstep(0, width, outside));
  const bow = 0.25 + 0.75 * Math.min(1, Math.max(0, along / mask.halfLength / 2 + 0.5)) ** 2;
  return band * bow * Math.min(1, mask.way / HULL_FOAM_WAY);
}

/** The water's numbers for the ships it draws, measured from the eye: each ship's place and heading's sine and
 *  cosine; her half length, half beam, way and hull (plus one: 0 is no ship); her drawn size and spray. Then each
 *  hull's line. */
export function hullValues(
  hulls: readonly HullMask[],
  eye: readonly [number, number],
  lines: Float32Array,
): Float32Array {
  const out = new Float32Array(HULLS * HULL_VECTORS * 4 + lines.length);
  for (const [index, hull] of hulls.slice(0, HULLS).entries()) {
    const start = index * HULL_VECTORS * 4;
    out.set([hull.x - eye[0], hull.y - eye[1], Math.sin(hull.heading), Math.cos(hull.heading)], start);
    out.set([hull.halfLength * HULL_FIT, hull.halfBeam * HULL_FIT, hull.way, (hull.hull ?? 0) + 1], start + 4);
    out.set([hull.scale ?? 1, hull.spray ?? 0, 0, 0], start + 8);
  }
  out.set(lines, HULLS * HULL_VECTORS * 4);
  return out;
}

/** The footprints' WGSL, read from the water's frame (`hulls`, then `hull_lines`). */
export const HULL_WGSL = /* wgsl */ `
const HULLS = ${HULLS}u;
const STATIONS = ${STATIONS}u;

// Her half beam at a share of her half length toward her bow, between her line's stations (lineAt).
fn hull_half_beam(kind: u32, share: f32) -> f32 {
  let place = (clamp(share, -1.0, 1.0) + 1.0) * 0.5 * f32(STATIONS - 1u);
  let low = min(u32(place), STATIONS - 2u);
  let at = kind * STATIONS + low;
  let first = frame.hull_lines[at / 4u][at % 4u];
  let next = frame.hull_lines[(at + 1u) / 4u][(at + 1u) % 4u];
  return mix(first, next, place - f32(low));
}

// A point (from the eye) against a ship's hull line: metres along her, across her, and outside it (hullEdge).
fn hull_edge(index: u32, offset: vec2f) -> vec3f {
  let place = frame.hulls[index * 3u];
  let size = frame.hulls[index * 3u + 1u];
  let from_middle = offset - place.xy;
  let along = dot(from_middle, vec2f(place.z, -place.w));
  let across = dot(from_middle, place.wz);
  let kind = min(u32(size.w) - 1u, ${HULL_NAMES.length - 1}u);
  let beside = abs(across) - size.y * hull_half_beam(kind, along / size.x);
  return vec3f(along, across, max(beside, abs(along) - size.x));
}

// How much of a point is inside a ship's hull line: her waterline holds no water (hullInside).
fn hull_inside(offset: vec2f, footprint: f32) -> f32 {
  var inside = 0.0;
  for (var index = 0u; index < HULLS; index++) {
    let size = frame.hulls[index * 3u + 1u];
    if (size.w < 0.5) { break; }
    if (length(offset - frame.hulls[index * 3u].xy) > size.x + size.y + footprint) { continue; }
    inside = max(inside, 1.0 - smoothstep(-footprint, 0.0, hull_edge(index, offset).z));
  }
  return inside;
}

// The foam along her sides, most at her bow (hullFoam).
fn hull_foam(offset: vec2f) -> f32 {
  var foam = 0.0;
  for (var index = 0u; index < HULLS; index++) {
    let size = frame.hulls[index * 3u + 1u];
    if (size.w < 0.5) { break; }
    let drawn = frame.hulls[index * 3u + 2u].x;
    let width = ${HULL_FOAM_M} * drawn;
    if (size.z <= 0.0 || length(offset - frame.hulls[index * 3u].xy) > size.x + size.y + width) { continue; }
    let edge = hull_edge(index, offset);
    let band = smoothstep(-0.05, 0.0, edge.z) * (1.0 - smoothstep(0.0, width, edge.z));
    let ahead = clamp(edge.x / (size.x / ${HULL_FIT}) / 2.0 + 0.5, 0.0, 1.0);
    foam = max(foam, band * (0.25 + 0.75 * ahead * ahead) * min(1.0, size.z / ${HULL_FOAM_WAY.toFixed(1)}));
  }
  return foam;
}
`;
