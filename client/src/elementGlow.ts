/** A weapon's element as it glows, by the gear crate's numbers: 0 none, 1 Blaze, 2 Volt, 3 Cosmic. */
export type GlowLook = 0 | 1 | 2 | 3;
/** An element that glows. */
export type GlowElement = Exclude<GlowLook, 0>;
/** A colour in sRGB, each channel 0 to 1. */
export type Rgb = readonly [number, number, number];

const rgb = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
];
const ramp = (...hexes: [string, string, string, string]) => hexes.map(rgb) as unknown as readonly [Rgb, Rgb, Rgb, Rgb];

/** Each element's glow, dark to white-hot: the gear's palette for it, with a light and a white-hot stop. */
export const GLOW_RAMPS: Readonly<Record<GlowElement, readonly [Rgb, Rgb, Rgb, Rgb]>> = {
  1: ramp('#4a1606', '#ff7a2a', '#ffd36a', '#fff4d6'),
  2: ramp('#0b2a44', '#46beff', '#9fe3ff', '#f2fcff'),
  3: ramp('#26093f', '#9c55ff', '#d7b3ff', '#fbf3ff'),
};

/** How far an outline reaches off its weapon at most, in the picture's own pixels: every field is padded by it. */
export const GLOW_PAD = 9;
/** A flame reaches this much farther up than across, and this share of it down. */
const BLAZE_UP = 1.8;
const BLAZE_DOWN = 0.6;

/** An outline's field: RGBA8, its picture's size and GLOW_PAD more on every side. */
export interface GlowField {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** How far a texel `across` and `down` (y down) of a weapon's pixel stands from it, in a look's own measure: a flame's
 *  stretched up and cut short below, a spark's along the grid, a halo's round. */
function measure(look: GlowElement, across: number, down: number): number {
  if (look === 2) return Math.abs(across) + Math.abs(down);
  if (look === 1) return Math.hypot(across, down < 0 ? down / BLAZE_UP : down / BLAZE_DOWN);
  return Math.hypot(across, down);
}

/**
 * The outline's field of a picture whose weapon is `mask` (a byte a pixel, top row first), measured once a picture.
 * Each texel's red is its distance to the nearest weapon pixel in quarter pixels (255 for none within the pad), green
 * 255 where the weapon lies straight below within the pad (a flame's embers rise off it), blue 255 inside the weapon,
 * 128 on its edge and 0 off it. A side the picture is `cut` at is no edge: the arm leaving the screen takes no rim.
 */
export function glowField(
  mask: Uint8Array,
  width: number,
  height: number,
  look: GlowElement,
  cut: { readonly bottom?: boolean } = {},
): GlowField {
  const [fieldWidth, fieldHeight] = [width + 2 * GLOW_PAD, height + 2 * GLOW_PAD];
  const data = new Uint8Array(fieldWidth * fieldHeight * 4);
  for (let start = 0; start < data.length; start += 4) [data[start], data[start + 3]] = [255, 255];
  const offsets: [number, number, number][] = [];
  for (let down = -GLOW_PAD; down <= GLOW_PAD; down++)
    for (let across = -GLOW_PAD; across <= GLOW_PAD; across++)
      offsets.push([across, down, Math.min(255, Math.round(measure(look, across, down) * 4))]);
  const solid = (x: number, y: number) => {
    const row = cut.bottom ? Math.min(y, height - 1) : y;
    return x >= 0 && x < width && row >= 0 && row < height && !!mask[row * width + x];
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      const [fieldX, fieldY] = [x + GLOW_PAD, y + GLOW_PAD];
      for (const [across, down, quarters] of offsets) {
        const red = ((fieldY + down) * fieldWidth + fieldX + across) * 4;
        if (quarters < (data[red] ?? 0)) data[red] = quarters;
      }
      for (let up = 1; up <= GLOW_PAD; up++) data[((fieldY - up) * fieldWidth + fieldX) * 4 + 1] = 255;
      const inner = solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1);
      data[(fieldY * fieldWidth + fieldX) * 4 + 2] = inner ? 255 : 128;
    }
  return { data, width: fieldWidth, height: fieldHeight };
}

/** An element's colour `share` of the way from white-hot (0) to its dark (1), for sparks and trails. */
export function glowRampAt(look: GlowElement, share: number): Rgb {
  const stops = GLOW_RAMPS[look];
  const place = (1 - Math.min(1, Math.max(0, share))) * (stops.length - 1);
  const low = Math.floor(place);
  const [from, to] = [stops[low] ?? stops[0], stops[Math.min(stops.length - 1, low + 1)] ?? stops[0]];
  const part = place - low;
  return [from[0] + (to[0] - from[0]) * part, from[1] + (to[1] - from[1]) * part, from[2] + (to[2] - from[2]) * part];
}

/** Recolours `pixels` (RGBA8) in place into an element's glow by their brightness, the brightest white-hot and the
 *  darkest its dark: a cast's light or spark in its Art's colour. With `only`, a byte a pixel, just those marked 1. */
export function recolourToGlow(
  pixels: Uint8Array | Uint8ClampedArray,
  look: GlowElement,
  only: Uint8Array | null = null,
): void {
  for (let start = 0; start + 3 < pixels.length; start += 4) {
    if (!pixels[start + 3] || (only && only[start / 4] !== 1)) continue;
    const light =
      (0.2126 * (pixels[start] ?? 0) + 0.7152 * (pixels[start + 1] ?? 0) + 0.0722 * (pixels[start + 2] ?? 0)) / 255;
    const [red, green, blue] = glowRampAt(look, 1 - light);
    [pixels[start], pixels[start + 1], pixels[start + 2]] = [red * 255, green * 255, blue * 255].map(Math.round);
  }
}

/** Each element's burst off a landed blow: how many motes, their speed (m/s) and life (s) between two, and how hard
 *  they are held up against gravity (m/s²): embers float, sparks fly and fall, cosmic motes hang. */
export const GLOW_BURSTS: Readonly<
  Record<
    GlowElement,
    {
      readonly count: number;
      readonly speed: readonly [number, number];
      readonly life: readonly [number, number];
      readonly lift: number;
    }
  >
> = {
  1: { count: 12, speed: [1.5, 3.5], life: [0.4, 0.8], lift: 4 },
  2: { count: 10, speed: [5, 9], life: [0.12, 0.25], lift: 0 },
  3: { count: 14, speed: [0.6, 1.6], life: [0.6, 1.1], lift: 9.81 },
};

/** How hard a weapon's glow surges, as a share of its reach at rest: through a swing's fast part, for a moment after
 *  a blow it lands, and longer after a kill (seconds since each, null for none). */
export const GLOW_SURGE = { swing: 1.5, hit: 2, hitFor: 6 / 60, kill: 2.5, killFor: 10 / 60 } as const;

/** The surge of a glow now: the kill's while it lasts, else the landed blow's, else the swing's while it is fast. */
export function glowSurge(sinceHit: number | null, sinceKill: number | null, swinging: boolean): number {
  if (sinceKill !== null && sinceKill >= 0 && sinceKill < GLOW_SURGE.killFor) return GLOW_SURGE.kill;
  if (sinceHit !== null && sinceHit >= 0 && sinceHit < GLOW_SURGE.hitFor) return GLOW_SURGE.hit;
  return swinging ? GLOW_SURGE.swing : 1;
}

/** A colour as WGSL writes it. */
export const wgslRgb = ([red, green, blue]: Rgb): string =>
  `vec3f(${red.toFixed(4)}, ${green.toFixed(4)}, ${blue.toFixed(4)})`;

/**
 * The outline's colour at a texel, premultiplied: `glow_colour(look, field, cell, time, surge)` with `field` the
 * texel of glowField's picture, `cell` its place from the field's middle (x right, y down), `time` the page's seconds
 * and `surge` how hard it surges (1 at rest). A band round the weapon, hottest at its edge and cooling in four hard
 * steps, whose reach moves by its look and grows with the surge, and a light on the weapon's own edge. Blaze climbs
 * in tongues and throws embers; Volt crackles in Manhattan arcs struck again twelve times a second; Cosmic breathes a
 * halo turned by a slow swirl, with star glints. Every rate is whole over the 240 s the clock wraps at. Beside it,
 * `glow_contact` is a blow's white rim round the weapon, and `glow_burst` the element thrown off it as a blow lands.
 */
export const GLOW_WGSL = /* wgsl */ `
const GLOW_TAU = 6.2831853;
const GLOW_RAMP = array<vec3f, 12>(
  ${([1, 2, 3] as const).flatMap((look) => GLOW_RAMPS[look].map(wgslRgb)).join(',\n  ')}
);
const GLOW_PAD = ${GLOW_PAD.toFixed(1)};
const GLOW_BLAZE_MOST = ${(GLOW_PAD / BLAZE_UP - 0.05).toFixed(3)};
// A flame at rest reaches this far across at most: six pixels up.
const GLOW_BLAZE_REST = ${(6 / BLAZE_UP).toFixed(3)};

fn glow_ramp(look: u32, stop: u32) -> vec3f {
  return GLOW_RAMP[(look - 1u) * 4u + min(stop, 3u)];
}

fn glow_hash(place: vec2f) -> f32 {
  var mixed = fract(vec3f(place.x, place.y, place.x) * 0.1031);
  mixed += dot(mixed, mixed.yzx + 33.33);
  return fract((mixed.x + mixed.y) * mixed.z);
}

fn glow_wrap(value: f32, period: f32) -> f32 {
  return value - period * floor(value / period);
}

// Value noise, periodic in y over 'rows' lattice rows: a scroll of whole rows a clock wraps seamlessly.
fn glow_noise(place: vec2f, rows: f32) -> f32 {
  let corner = floor(place);
  let part = place - corner;
  let ease = part * part * (3.0 - 2.0 * part);
  let low = glow_wrap(corner.y, rows);
  let high = glow_wrap(corner.y + 1.0, rows);
  let below = mix(glow_hash(vec2f(corner.x, low)), glow_hash(vec2f(corner.x + 1.0, low)), ease.x);
  let above = mix(glow_hash(vec2f(corner.x, high)), glow_hash(vec2f(corner.x + 1.0, high)), ease.x);
  return mix(below, above, ease.y);
}

// How far the band stands off the edge at a cell (y up) now, grown by the surge, never past the field's pad.
fn glow_reach(look: u32, cell: vec2f, time: f32, surge: f32) -> f32 {
  if (look == 1u) {
    let slow = glow_noise(vec2f(cell.x * 0.45, cell.y * 0.3 - time * 2.0), 480.0);
    let quick = glow_noise(vec2f(cell.x * 0.9 + 17.0, cell.y * 0.6 - time * 4.0), 960.0);
    let rest = min(2.0 * (0.5 + slow * (0.75 + 0.5 * quick)), GLOW_BLAZE_REST);
    return min(rest * surge, GLOW_BLAZE_MOST);
  }
  if (look == 2u) {
    let strike = floor(time * 12.0);
    let arc = glow_noise(floor(cell * 0.5) * 0.9 + vec2f(strike * 3.7, strike * 1.3), 4096.0);
    return min((3.0 + smoothstep(0.55, 0.85, arc) * 4.0) * surge, GLOW_PAD);
  }
  let breath = 0.7 + 0.3 * sin(time * GLOW_TAU / 4.0);
  // The field's middle cell has no bearing, and WGSL gives atan2 of nothing no answer to rely on.
  let bearing = select(atan2(cell.y, cell.x), 0.0, all(cell == vec2f(0.0)));
  let turn = bearing / GLOW_TAU - time / 8.0;
  let swirl = glow_noise(vec2f(length(cell) * 0.35, turn * 12.0), 12.0);
  return min((2.2 + 0.8 * breath) * (0.75 + 0.5 * swirl) * surge, GLOW_PAD - 1.0);
}

// How strongly the weapon's own edge takes its element's light.
fn glow_rim(look: u32, cell: vec2f, time: f32) -> f32 {
  if (look == 1u) {
    return 0.25 + 0.35 * glow_noise(vec2f(cell.x * 0.6, cell.y * 0.6 - time * 3.0), 720.0);
  }
  if (look == 2u) {
    return select(0.15, 0.65, glow_hash(floor(cell * 0.5) + floor(time * 12.0) * 5.0) > 0.5);
  }
  return 0.3 + 0.2 * (0.5 + 0.5 * sin(time * GLOW_TAU / 4.0));
}

// An ember over a flame, rising a cell a step, six steps a second.
fn glow_ember(cell: vec2f, time: f32) -> bool {
  return glow_hash(vec2f(floor(cell.x), glow_wrap(floor(cell.y) - floor(time * 6.0), 1440.0))) > 0.97;
}

// A cosmic star: lit for 0.4 s of a cell's own phase, about 3% of cells a second.
fn glow_star(cell: vec2f, time: f32) -> bool {
  let slot = glow_wrap(floor(time / 0.4 + glow_hash(cell + 91.0)), 600.0);
  return glow_hash(cell * 1.37 + vec2f(slot * 5.13, slot * 2.71)) < 0.012;
}

fn glow_colour(look: u32, field: vec4f, cell: vec2f, time: f32, surge: f32) -> vec4f {
  if (look == 0u || look > 3u) { return vec4f(0.0); }
  let clock = glow_wrap(time, 240.0);
  let at = vec2f(cell.x, -cell.y);
  if (field.b > 0.75) { return vec4f(0.0); }
  if (field.b > 0.25) {
    let rim = glow_rim(look, at, clock) * 0.9;
    return vec4f(glow_ramp(look, 2u) * rim, rim * 0.5);
  }
  let apart = round(field.r * 255.0) / 4.0;
  if (apart > 63.0) { return vec4f(0.0); }
  let reach = glow_reach(look, at, clock, surge);
  let hot = 1.0 - apart / max(reach, 0.25);
  var out = vec4f(0.0);
  if (hot > 0.0) {
    let alpha = 0.55 + 0.45 * hot;
    let band = u32(clamp(floor(hot * 4.0 - 0.5), 0.0, 3.0));
    let dropped = look == 2u && glow_hash(floor(at * 0.5) + floor(clock * 12.0) * 13.0) < 0.18;
    if (!dropped) { out = vec4f(glow_ramp(look, band) * alpha, alpha); }
  } else if (look == 1u && field.g > 0.5 && glow_ember(at, clock)) {
    out = vec4f(glow_ramp(look, 2u), 1.0);
  }
  if (look == 3u && apart < 8.0) {
    var near = 0.0;
    if (glow_star(at + vec2f(1.0, 0.0), clock) || glow_star(at - vec2f(1.0, 0.0), clock)
      || glow_star(at + vec2f(0.0, 1.0), clock) || glow_star(at - vec2f(0.0, 1.0), clock)) { near = 0.5; }
    let star = select(near, 1.0, glow_star(at, clock));
    if (star > out.a) { out = vec4f(glow_ramp(look, 3u) * star, star); }
  }
  return out;
}

// A blow's rim: the weapon's edge and a pixel and a half round it, white.
fn glow_contact(field: vec4f) -> vec4f {
  if (field.b > 0.75) { return vec4f(0.0); }
  let apart = select(round(field.r * 255.0) / 4.0, 0.0, field.b > 0.25);
  return select(vec4f(0.0), vec4f(1.0), apart <= 1.5);
}

// The element thrown off the weapon 'age' seconds after a blow lands: a ring of its pixels flying out to the pad over a
// fifth of a second, cooling a stop each quarter of it; Blaze's rising, Volt's sparse and quick, Cosmic's in crosses.
fn glow_burst(look: u32, field: vec4f, cell: vec2f, age: f32) -> vec4f {
  if (look == 0u || look > 3u || age < 0.0 || age >= 0.2 || field.b > 0.25) { return vec4f(0.0); }
  let share = age / 0.2;
  let apart = round(field.r * 255.0) / 4.0;
  let front = 1.5 + (GLOW_PAD - 1.5) * share;
  let at = floor(vec2f(cell.x, -cell.y - select(0.0, share * 4.0, look == 1u)));
  let density = select(select(0.14, 0.22, look == 2u), 0.4, look == 1u);
  var lit = abs(apart - front) < 1.2 && glow_hash(at * 1.31 + 3.0) < density;
  if (look == 3u) {
    let arm = glow_hash((at + vec2f(1.0, 0.0)) * 1.31 + 3.0) < density || glow_hash((at - vec2f(0.0, 1.0)) * 1.31 + 3.0) < density;
    lit = lit || (abs(apart - front) < 2.0 && arm);
  }
  if (!lit) { return vec4f(0.0); }
  return vec4f(glow_ramp(look, 3u - u32(floor(share * 4.0))), 1.0);
}
`;
