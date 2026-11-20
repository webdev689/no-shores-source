import { headingFrame } from '../rules/landRules.ts';
import { smoothstep } from './shore.ts';

/**
 * A ship's footprint on the water: no water inside its own hull line at its waterline, and foam along it, most at its
 * bow. The TypeScript mirrors the WGSL the water's surface runs (HULL_WGSL), so tests can hold the shapes.
 */
/** A ship's footprint on the water (window metres): its middle, its heading (radians clockwise from north), half
 *  its waterline's length and beam as drawn, its way (m/s), its own hull line (its half beam at each of `STATIONS`,
 *  stern to bow, as a share of its widest: the fair line without one), how many times its size it is drawn (its wake
 *  and foam widen with it), and its bow's spray now, 0 to 1. */
export interface HullMask {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly halfLength: number;
  readonly halfBeam: number;
  readonly way: number;
  readonly line?: Float32Array;
  readonly scale?: number;
  readonly spray?: number;
}

/** The share of its waterline the footprint fills: a hair inside it, so no water is cut away round its hull. */
export const HULL_FIT = 0.97;
/** How far the foam along its sides reaches past its hull line at its true size, metres, and the way it is whole at
 *  (m/s). */
export const HULL_FOAM_M = 0.8;
export const HULL_FOAM_WAY = 2;
/** How many ships the water draws, nearest the eye first: every ship of a full sea in view (a sea room's players and
 *  its pirates) while each water pixel's walk over them stays within the swell's own cost. */
export const HULLS = 48;
/** The stations along a hull line, stern first, bow last. */
export const STATIONS = 16;
/** A hull's line before its own has come: full amidships, fining to a point at its bow and a narrow transom aft. */
export const FAIR_LINE = Float32Array.from({ length: STATIONS }, (_value, station) => {
  const along = (station / (STATIONS - 1)) * 2 - 1;
  return along > 0 ? Math.sqrt(Math.max(0, 1 - along * along)) : 0.45 + 0.55 * Math.sqrt(1 - along * along * 0.8);
});
/** The water's frame holds four numbers a ship this many times: its place, its size, its drawing, then its line. */
export const HULL_VECTORS = 3 + STATIONS / 4;

/** Its half beam at `share` of its half length toward its bow (-1 its stern, 1 its bow), as a share of its widest,
 *  between the stations. Mirrors WGSL hull_half_beam. */
export function lineAt(line: Float32Array, share: number): number {
  const place = ((Math.min(1, Math.max(-1, share)) + 1) / 2) * (STATIONS - 1);
  const low = Math.min(STATIONS - 2, Math.floor(place));
  return (line[low] ?? 0) + ((line[low + 1] ?? 0) - (line[low] ?? 0)) * (place - low);
}

/** A point against its hull line: metres along it (bow positive), across it (starboard positive) and how far
 *  outside its line it lies (negative inside). Mirrors WGSL hull_edge. */
export function hullEdge(
  mask: HullMask,
  point: readonly [number, number],
): { along: number; across: number; outside: number } {
  const [east, south] = [point[0] - mask.x, point[1] - mask.y];
  const { forward, starboard } = headingFrame(mask.heading);
  const along = east * forward[0] + south * forward[1];
  const across = east * starboard[0] + south * starboard[1];
  const [length, beam] = [mask.halfLength * HULL_FIT, mask.halfBeam * HULL_FIT];
  const beside = Math.abs(across) - beam * lineAt(mask.line ?? FAIR_LINE, along / length);
  return { along, across, outside: Math.max(beside, Math.abs(along) - length) };
}

/** How much of a point is inside its hull line (1 within, 0 past it, eased over a pixel's footprint). Mirrors WGSL
 *  hull_inside. */
export function hullInside(mask: HullMask, point: readonly [number, number], footprint: number): number {
  return 1 - smoothstep(-footprint, 0, hullEdge(mask, point).outside);
}

/** The foam along its sides at a point: a band outside its hull line, widening with its drawn size, whole at its full
 *  way and most at its bow. Mirrors WGSL hull_foam. */
export function hullFoam(mask: HullMask, point: readonly [number, number]): number {
  const { along, outside } = hullEdge(mask, point);
  const width = HULL_FOAM_M * (mask.scale ?? 1);
  const band = smoothstep(-0.05, 0, outside) * (1 - smoothstep(0, width, outside));
  const ahead = Math.min(1, Math.max(0, along / mask.halfLength / 2 + 0.5));
  return band * (0.25 + 0.75 * ahead * ahead) * Math.min(1, mask.way / HULL_FOAM_WAY);
}

/** The water's numbers for the ships it draws, measured from the eye: each ship's place and heading's sine and
 *  cosine; its half length, half beam, way and 1 (0 is no ship); its drawn size and spray; then its line. */
export function hullValues(hulls: readonly HullMask[], eye: readonly [number, number]): Float32Array {
  const out = new Float32Array(HULLS * HULL_VECTORS * 4);
  for (const [index, hull] of hulls.slice(0, HULLS).entries()) {
    const start = index * HULL_VECTORS * 4;
    out.set([hull.x - eye[0], hull.y - eye[1], Math.sin(hull.heading), Math.cos(hull.heading)], start);
    out.set([hull.halfLength * HULL_FIT, hull.halfBeam * HULL_FIT, hull.way, 1], start + 4);
    out.set([hull.scale ?? 1, hull.spray ?? 0, 0, 0], start + 8);
    out.set(hull.line ?? FAIR_LINE, start + 12);
  }
  return out;
}

/** The footprints' WGSL, read from the water's frame (`hulls`). */
export const HULL_WGSL = /* wgsl */ `
const HULLS = ${HULLS}u;
const HULL_VECTORS = ${HULL_VECTORS}u;
const STATIONS = ${STATIONS}u;

// A ship's half beam at a share of its half length toward its bow, between its line's stations (lineAt).
fn hull_half_beam(index: u32, share: f32) -> f32 {
  let place = (clamp(share, -1.0, 1.0) + 1.0) * 0.5 * f32(STATIONS - 1u);
  let low = min(u32(place), STATIONS - 2u);
  let line = index * HULL_VECTORS + 3u;
  let first = frame.hulls[line + low / 4u][low % 4u];
  let next = frame.hulls[line + (low + 1u) / 4u][(low + 1u) % 4u];
  return mix(first, next, place - f32(low));
}

// A point (from the eye) against a ship's hull line: metres along it, across it, and outside it (hullEdge).
fn hull_edge(index: u32, offset: vec2f) -> vec3f {
  let place = frame.hulls[index * HULL_VECTORS];
  let size = frame.hulls[index * HULL_VECTORS + 1u];
  let from_middle = offset - place.xy;
  let along = dot(from_middle, vec2f(place.z, -place.w));
  let across = dot(from_middle, place.wz);
  let beside = abs(across) - size.y * hull_half_beam(index, along / size.x);
  return vec3f(along, across, max(beside, abs(along) - size.x));
}

// How much of a point is inside a ship's hull line: its waterline holds no water (hullInside).
fn hull_inside(offset: vec2f, footprint: f32) -> f32 {
  var inside = 0.0;
  for (var index = 0u; index < HULLS; index++) {
    let size = frame.hulls[index * HULL_VECTORS + 1u];
    if (size.w < 0.5) { break; }
    if (length(offset - frame.hulls[index * HULL_VECTORS].xy) > size.x + size.y + footprint) { continue; }
    inside = max(inside, 1.0 - smoothstep(-footprint, 0.0, hull_edge(index, offset).z));
  }
  return inside;
}

// The foam along its sides, most at its bow (hullFoam).
fn hull_foam(offset: vec2f) -> f32 {
  var foam = 0.0;
  for (var index = 0u; index < HULLS; index++) {
    let size = frame.hulls[index * HULL_VECTORS + 1u];
    if (size.w < 0.5) { break; }
    let width = ${HULL_FOAM_M} * frame.hulls[index * HULL_VECTORS + 2u].x;
    if (size.z <= 0.0 || length(offset - frame.hulls[index * HULL_VECTORS].xy) > size.x + size.y + width) { continue; }
    let edge = hull_edge(index, offset);
    let band = smoothstep(-0.05, 0.0, edge.z) * (1.0 - smoothstep(0.0, width, edge.z));
    let ahead = clamp(edge.x / (size.x / ${HULL_FIT}) / 2.0 + 0.5, 0.0, 1.0);
    foam = max(foam, band * (0.25 + 0.75 * ahead * ahead) * min(1.0, size.z / ${HULL_FOAM_WAY.toFixed(1)}));
  }
  return foam;
}
`;
