// How a swing's arc is coloured and drawn: four hard stops of a ramp, whole figure pixels, a dithered tail, and no
// blend between stops, so the arc is pixel art beside the figures. Any page's scene can draw it with its own vertex
// stage: SWING_WGSL holds the vertex's output and the fragment.
import { GLOW_RAMPS, type Rgb, wgslRgb } from '../elementGlow.ts';
import { LIGHT_WGSL } from './lightLayer.ts';
import type { Colour } from './swingCourse.ts';
import { GOLD } from './markSprites.ts';

/** The ramps an arc burns in: its weapon's metal (made from its tint), an element's, a riposte's gold, and the dust a
 *  heavy blow throws off the ground. */
export const RAMP = { metal: 0, blaze: 1, volt: 2, cosmic: 3, gold: 4, dust: 5 } as const;

const hex = (code: string): Rgb => [
  Number.parseInt(code.slice(1, 3), 16) / 255,
  Number.parseInt(code.slice(3, 5), 16) / 255,
  Number.parseInt(code.slice(5, 7), 16) / 255,
];
/** Dust, dark to light (gold is the marks' own). */
const DUST: readonly Rgb[] = ['#3a3226', '#6b5d48', '#9c8b6e', '#c9b996'].map(hex);
/** A metal's stops from its tint: each the tint dimmed by the first share, then lifted toward white by the second. */
const METAL_DIM = [0.24, 0.76, 1, 1] as const;
const METAL_LIFT = [0, 0, 0.4, 0.9] as const;

/** Stop `stop` (0 dark to 3 white-hot) of ramp `code`; a metal's from its `tint`. */
export function swingRampColour(code: number, stop: number, tint: Colour): Colour {
  const step = Math.min(3, Math.max(0, Math.round(stop)));
  if (code === RAMP.metal) {
    const [dim, lift] = [METAL_DIM[step] ?? 1, METAL_LIFT[step] ?? 0];
    return [0, 1, 2].map((channel) => (tint[channel] ?? 0) * dim * (1 - lift) + lift) as unknown as Colour;
  }
  const ramps = [GLOW_RAMPS[1], GLOW_RAMPS[2], GLOW_RAMPS[3], GOLD, DUST];
  return ramps[code - 1]?.[step] ?? [1, 1, 1];
}

/** The vertex's numbers' places, for a pipeline's buffer: its place, its shape, its tint and strength, its ramp and
 *  cells. */
export const SWING_ATTRIBUTES = [
  { shaderLocation: 0, offset: 0, format: 'float32x3' },
  { shaderLocation: 1, offset: 12, format: 'float32x4' },
  { shaderLocation: 2, offset: 28, format: 'float32x4' },
  { shaderLocation: 3, offset: 44, format: 'float32x2' },
] as const;

/**
 * The arc's fragment. Its shape is (age along the streak, 0 at the head; across it; the blade's speed there; its
 * part), or for a solid part (its stop; its cover; a measure running across it); its tint carries the metal and its
 * strength, and `extra` its ramp and how many figure pixels it spans across. Each part is cut into whole figure pixels
 * and lit in one stop: a band's cutting edge white-hot over a dark rim, its body in lanes that each trail their own
 * length; a strip hot along its middle; a flare a star of four rays, or a blunt head's square; the oldest fifth of a
 * streak dithered out in a 4 by 4 order. A stronger arc burns a stop hotter, a dim one a stop darker. `swingLight` is
 * its light for the light layer.
 */
export const SWING_WGSL = /* wgsl */ `
const SWING_ORDER = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
const SWING_RAMPS = array<vec3f, 20>(
  ${[GLOW_RAMPS[1], GLOW_RAMPS[2], GLOW_RAMPS[3], GOLD, DUST].flatMap((ramp) => ramp.map(wgslRgb)).join(',\n  ')}
);
const SWING_DIM = array<f32, 4>(${METAL_DIM.map((value) => value.toFixed(2)).join(', ')});
const SWING_LIFT = array<f32, 4>(${METAL_LIFT.map((value) => value.toFixed(2)).join(', ')});
// How much of a band's lane each of its stops covers, dark to light.
const SWING_COVER = array<f32, 3>(0.4, 0.75, 1.0);

struct SwingOut {
  @builtin(position) position: vec4f,
  @location(0) shape: vec4f,
  @location(1) tint: vec4f,
  @location(2) extra: vec2f,
}

fn swing_hash(value: f32) -> f32 {
  return fract(sin(value * 127.1 + 311.7) * 43758.5453);
}

fn swing_ramp(code: u32, stop: f32, tint: vec3f) -> vec3f {
  let at = u32(clamp(stop, 0.0, 3.0));
  if (code == 0u) { return tint * SWING_DIM[at] * (1.0 - SWING_LIFT[at]) + SWING_LIFT[at]; }
  return SWING_RAMPS[(min(code, 5u) - 1u) * 4u + at];
}

// The ordered dither's threshold at a fragment, its cells a figure pixel ('per' screen pixels) across.
fn swing_dither(position: vec2f, per: f32) -> f32 {
  let cell = vec2u(floor(position / max(per, 1.0))) % 4u;
  return (SWING_ORDER[cell.y * 4u + cell.x] + 0.5) / 16.0;
}

// A streak's tail: whole up to its oldest fifth, then thinning to nothing.
fn swing_tail(age: f32) -> f32 {
  return select(1.0, (1.0 - age) / 0.2, age > 0.8);
}

// The blade's band (stop, cover): the cutting edge, the dark rim past it, and the body's lanes.
fn swing_band(age: f32, across: f32, speed: f32, cells: f32, ramp: u32) -> vec2f {
  if (speed < 0.08) { return vec2f(-1.0, 0.0); }
  let column = floor(min(across, 0.999) * cells);
  let at = (column + 0.5) / cells;
  if (at > 0.94) { return vec2f(select(-1.0, 0.0, age < 0.5), 1.0); }
  if (at > 0.86) { return vec2f(select(select(1.0, 2.0, age < 0.6), 3.0, age < 0.3), swing_tail(age)); }
  if (at < 0.3) { return vec2f(-1.0, 0.0); }
  var reach = mix(0.3, 1.0, swing_hash(column));
  // Blaze's lanes break into tongues along their length.
  if (ramp == 1u) { reach -= swing_hash(column * 7.0 + floor(age * 10.0)) * 0.3; }
  let lit = 1.0 - age / max(reach, 0.05);
  if (lit <= 0.0) { return vec2f(-1.0, 0.0); }
  let stop = floor(lit * 2.99);
  return vec2f(stop, SWING_COVER[u32(stop)] * swing_tail(age));
}

// A strip across the tip's path or a thrust's streak (stop, cover): hottest along its middle, dark at its edges.
fn swing_strip(age: f32, across: f32, speed: f32, cells: f32) -> vec2f {
  if (speed < 0.08) { return vec2f(-1.0, 0.0); }
  let column = floor(min(across, 0.999) * cells);
  let middle = 1.0 - abs((column + 0.5) / cells * 2.0 - 1.0);
  var stop = select(-1.0, 0.0, age < 0.55);
  if (middle > 0.7) { stop = select(select(1.0, 2.0, age < 0.6), 3.0, age < 0.3); }
  else if (middle > 0.25) { stop = select(select(0.0, 1.0, age < 0.6), 2.0, age < 0.25); }
  return vec2f(stop, swing_tail(age));
}

// A flare in whole cells (its corner 0 to 1, 'cells' across): a star of four rays and a short cross, or for a blunt
// head a square block; rays as long as its strength.
fn swing_flare(corner: vec2f, cells: f32, strength: f32, blunt: bool) -> f32 {
  let count = 2.0 * floor(cells / 2.0) + 1.0;
  let half = (count - 1.0) / 2.0;
  let cell = abs(floor(clamp(corner, vec2f(0.0), vec2f(0.999)) * count) - half);
  let far = max(cell.x, cell.y);
  let reach = max(half, 1.0) * clamp(0.5 + 0.5 * strength, 0.4, 1.0);
  if (blunt) {
    if (far <= reach * 0.3) { return 3.0; }
    if (far <= reach * 0.55) { return 2.0; }
    if (far <= reach * 0.8 && far >= reach * 0.65) { return 1.0; }
    return -1.0;
  }
  if (cell.x + cell.y <= max(reach * 0.18, 0.5)) { return 3.0; }
  if (min(cell.x, cell.y) < 0.5 && far <= reach) { return select(select(1.0, 2.0, far < reach * 0.6), 3.0, far < reach * 0.3); }
  if (cell.x == cell.y && far <= reach * 0.3) { return 2.0; }
  return -1.0;
}

fn swing_shade(in: SwingOut) -> vec4f {
  let part = u32(round(in.shape.w));
  let ramp = u32(round(in.extra.x));
  let cells = max(in.extra.y, 1.0);
  // Screen pixels to a figure pixel here, measured before any branch: across a streak or a flare, or along a solid
  // part's speed, which runs across it.
  let acrossPer = 1.0 / max(fwidth(in.shape.y) * cells, 1e-3);
  let solidPer = 1.0 / max(fwidth(in.shape.z) * cells, 1e-3);
  let per = select(acrossPer, solidPer, part == 3u);
  let strength = in.tint.a;
  var shown = vec2f(-1.0, 0.0);
  if (part == 0u) { shown = swing_band(in.shape.x, in.shape.y, in.shape.z, cells, ramp); }
  else if (part == 1u) { shown = swing_strip(in.shape.x, in.shape.y, in.shape.z, cells); }
  else if (part == 3u) { shown = in.shape.xy; }
  else { shown = vec2f(swing_flare(in.shape.xy, cells, strength, part == 4u), 1.0); }
  var stop = shown.x;
  if (part != 3u && stop >= 0.0) { stop = min(3.0, stop + clamp(round((strength - 1.0) * 2.0), -3.0, 2.0)); }
  if (stop < 0.0 || swing_dither(in.position.xy, per) >= shown.y) { discard; }
  return vec4f(swing_ramp(ramp, stop, in.tint.rgb), 1.0);
}

@fragment fn swingFragment(in: SwingOut) -> @location(0) vec4f {
  return swing_shade(in);
}

${LIGHT_WGSL}
// Its light, for the light layer: none from the dust a heavy blow throws.
@fragment fn swingLight(in: SwingOut) -> @location(0) vec4f {
  let shown = swing_shade(in);
  if (u32(round(in.extra.x)) == ${RAMP.dust}u) { discard; }
  return light_of(shown.rgb, 1.0);
}
`;
