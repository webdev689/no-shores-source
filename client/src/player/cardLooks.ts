// How a figure's card shows what befalls it, in its own pixels: struck (a stepped flash), Charged, Exposed, Veiled,
// shaken, smeared by its own swing, and dissolving as it dies. Both scenes that draw cards (the Test Ground's and the
// game's) write the same numbers and read them with the same WGSL.
import { GLOW_RAMPS, type Rgb, wgslRgb } from '../elementGlow.ts';
import type { CardAt } from './cards.ts';
import { PX_PER_M } from './figures.ts';

/** The clock the cards' looks run on wraps here, every rate in their shader whole over it. */
const CLOCK_WRAP_S = 240;
/** The clock the cards' looks run on, as the outlines' does: the page's seconds, wrapped. */
export const statusClock = (): number => (performance.now() / 1000) % CLOCK_WRAP_S;

/** How many numbers a card's look adds to its uniform: its statuses, its look and its tint, four each. */
export const CARD_LOOK_FLOATS = 12;
/** A flash's stages: off, the whole figure, its outline alone. */
export const FLASH = { off: 0, whole: 1, outline: 2 } as const;

/** The dissolve's look an arriving card is built in, past the four elements' (`arrivals.ts`). */
const ARRIVING = 4;

/** The numbers a card's look is drawn with at `time` (the status clock): Veiled, Exposed, the clock and how far it
 *  has dissolved (or is still to come, arriving); Charged, the element it dissolves in (or arriving), how far it is shaken (figure pixels) and its flash's stage;
 *  then its flash's colour. Drawn as its smear (`smear`), the tint is the smear's colour, marked so. */
export function cardLookValues(shown: CardAt, time: number, smear = false): number[] {
  const flash = shown.flash;
  const colour = smear && shown.smear ? shown.smear.colour : (flash?.colour ?? [1, 1, 1]);
  const stage = smear ? FLASH.off : (flash?.stage ?? FLASH.off);
  return [
    ...[shown.veiled ? 1 : 0, shown.exposed ? 1 : 0, time, shown.dissolve?.share ?? shown.arrival ?? 0],
    ...[shown.charged ? 1 : 0, shown.dissolve?.look ?? (shown.arrival ? ARRIVING : 0), shown.jitter ?? 0, stage],
    ...[colour[0], colour[1], colour[2], smear ? 1 : 0],
  ];
}

const [VOLT, COSMIC] = [GLOW_RAMPS[2], GLOW_RAMPS[3]];
/** The ash a plain death crumbles into, dark to light. */
const ASH: readonly Rgb[] = [
  [0.17, 0.17, 0.17],
  [0.37, 0.37, 0.37],
  [0.6, 0.6, 0.6],
  [0.82, 0.82, 0.82],
];
const ramps = (looks: readonly (readonly Rgb[])[]) => looks.flatMap((ramp) => ramp.map(wgslRgb)).join(',\n  ');

/**
 * A card's look in WGSL, from its uniform's `status` (Veiled, Exposed, the clock, the dissolve's share), `look`
 * (Charged, the dissolve's element, the shake in pixels, the flash's stage) and `tint` (the flash's colour; w 1 for a
 * smear). `card_texel` is the picture's texel a fragment shows, shaken and, for a Cosmic death, drawn in toward the
 * chest in four whole steps; `card_shade` the colour it shows there, alpha 0 for none. Everything is drawn on the
 * figure's own pixels, so a Charge's arcs never leave its outline and a flash never fades through a ghost.
 */
export const STATUS_WGSL = /* wgsl */ `
const STATUS_ORDER = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
const STATUS_RAMPS = array<vec3f, 16>(
  ${ramps([ASH, GLOW_RAMPS[1], VOLT, COSMIC])}
);
const STATUS_PX_PER_M = ${PX_PER_M.toFixed(1)};

fn status_ramp(look: u32, stop: f32) -> vec3f {
  return STATUS_RAMPS[min(look, 3u) * 4u + u32(clamp(stop, 0.0, 3.0))];
}

fn status_hash(place: vec2f) -> f32 {
  return fract(sin(dot(place, vec2f(12.9898, 78.233))) * 43758.5453);
}

fn status_order(texel: vec2i) -> f32 {
  let cell = vec2u(texel) % 4u;
  return (STATUS_ORDER[cell.y * 4u + cell.x] + 0.5) / 16.0;
}

fn status_light(colour: vec3f) -> f32 {
  return dot(colour, vec3f(0.2126, 0.7152, 0.0722));
}

// Whether the picture is clear 'reach' texels from a drawn one, along either axis, or off the picture there.
fn status_clear_at(picture: texture_2d<f32>, texel: vec2i, reach: i32) -> bool {
  let size = vec2i(textureDimensions(picture));
  var sides = array(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  for (var side = 0; side < 4; side++) {
    let at = texel + sides[side] * reach;
    if (any(at < vec2i(0)) || any(at >= size)) { return true; }
    if (textureLoad(picture, at, 0).a < 0.5) { return true; }
  }
  return false;
}

// Whether a drawn texel stands on its picture's outline: a side of it clear, or off the picture.
fn status_edge(picture: texture_2d<f32>, texel: vec2i) -> bool {
  return status_clear_at(picture, texel, 1);
}

// The texel a card's fragment at 'place' shows: shaken across, and drawn in toward the chest by a Cosmic death; x
// below 0 for none. 'root' is the feet's texel.
fn card_texel(status: vec4f, look: vec4f, place: vec2i, size: vec2i, root: vec2f) -> vec2i {
  var at = place;
  let strike = u32(floor(status.z * 12.0));
  var shake = i32(round(look.z));
  let dissolving = status.w > 0.0;
  let element = u32(round(look.y));
  if (look.x > 0.5 || (dissolving && element == 2u)) { shake += select(-1, 1, (strike & 1u) == 1u); }
  at.x -= shake;
  if (dissolving && element == 3u) {
    let scale = 1.0 - floor(status.w * 4.0) / 4.0;
    if (scale <= 0.0) { return vec2i(-1); }
    let chest = root - vec2f(0.0, 1.1 * STATUS_PX_PER_M);
    at = vec2i(floor(chest + (vec2f(at) + 0.5 - chest) / scale));
  }
  if (any(at < vec2i(0)) || any(at >= size)) { return vec2i(-1); }
  return at;
}

// How far a texel stands from one of a Charged figure's arcs at a strike: each a line in four jagged legs between
// points of its body's middle.
fn status_arc(texel: vec2f, root: vec2f, strike: f32, arc: f32) -> f32 {
  let seed = vec2f(strike * 3.7 + arc * 11.3, arc * 5.1 + 1.0);
  var best = 1e3;
  let start = root + vec2f(status_hash(seed) * 20.0 - 10.0, -20.0 - status_hash(seed + 1.0) * 80.0);
  let finish = root + vec2f(status_hash(seed + 2.0) * 20.0 - 10.0, -20.0 - status_hash(seed + 3.0) * 80.0);
  var begin = start;
  for (var leg = 1; leg <= 4; leg++) {
    var end = mix(start, finish, f32(leg) / 4.0);
    if (leg < 4) { end += vec2f(status_hash(seed + f32(leg) * 7.0), status_hash(seed + f32(leg) * 9.0)) * 10.0 - 5.0; }
    let along = end - begin;
    let share = clamp(dot(texel - begin, along) / max(dot(along, along), 1e-4), 0.0, 1.0);
    best = min(best, length(texel - begin - along * share));
    begin = end;
  }
  return best;
}

// A dying or arriving card's colour (rgb, a 0 for gone) at a texel 'high' of the way up it: its look's dissolve at
// 'share'.
fn status_dissolve(element: u32, share: f32, texel: vec2i, high: f32, colour: vec3f, edge: bool, clock: f32) -> vec4f {
  let light = status_light(colour);
  let order = status_order(texel / 2);
  if (element == ${ARRIVING}u) {
    // Arriving: built from the feet up in 2 by 2 cells while 'share' is still to come, each white as it lands.
    let left = high * 0.6 + order * 0.4 - (1.0 - share) * 1.05;
    if (left > 0.0) { return vec4f(0.0); }
    if (left > -0.1) { return vec4f(1.0, 1.0, 1.0, 1.0); }
    return vec4f(colour, 1.0);
  }
  if (element == 1u) {
    // Blaze climbs from the feet, heating each pixel up its ramp, then burns away bottom up; a few stay as ash.
    let front = min(share / 0.55, 1.0) * 1.3;
    var out = colour;
    let heat = front - high;
    if (heat > 0.0) { out = status_ramp(1u, min(3.0, floor(heat * 10.0)) - select(0.0, 1.0, light < 0.3)); }
    let burn = (share - 0.55) / 0.45;
    let left = high * 0.7 + order * 0.3 - burn;
    if (left < 0.0) {
      if (status_hash(vec2f(texel / 2)) < 0.12 && share < 0.97) { return vec4f(status_ramp(1u, 0.0), 1.0); }
      return vec4f(0.0);
    }
    if (left < 0.06) { return vec4f(status_ramp(1u, 3.0), 1.0); }
    return vec4f(out, 1.0);
  }
  if (element == 2u) {
    // Volt takes its ramp by brightness and blinks out in 4 by 4 cells, each white the strike before it goes.
    let cell = vec2f(texel / 4);
    let left = status_hash(cell) - (share * 1.15 - 0.1);
    let strike = floor(clock * 12.0);
    if (left < 0.0 || status_hash(cell + strike * 1.7) < share * 0.4) { return vec4f(0.0); }
    if (left < 0.1) { return vec4f(status_ramp(2u, 3.0), 1.0); }
    return vec4f(status_ramp(2u, floor(light * 3.99)), 1.0);
  }
  if (element == 3u) {
    // Cosmic takes its ramp by brightness, its edge dark, as it is drawn in.
    if (edge) { return vec4f(status_ramp(3u, 0.0), 1.0); }
    return vec4f(status_ramp(3u, floor(light * 3.99)), 1.0);
  }
  // Plain: greyed by brightness, crumbling in 2 by 2 cells from the head down, white at the break.
  let left = (1.0 - high) * 0.6 + order * 0.4 - share * 1.05;
  if (left < 0.0) { return vec4f(0.0); }
  if (left < 0.06) { return vec4f(status_ramp(0u, 3.0), 1.0); }
  return vec4f(status_ramp(0u, floor(light * 3.99)), 1.0);
}

// The colour a card shows at a drawn texel of its picture, its own colour 'colour' as lit; alpha 0 for none.
fn card_shade(
  status: vec4f,
  look: vec4f,
  tint: vec4f,
  picture: texture_2d<f32>,
  texel: vec2i,
  colour: vec3f,
  root: vec2f,
) -> vec4f {
  let height = max(root.y, 1.0);
  let high = clamp((root.y - f32(texel.y)) / height, 0.0, 1.0);
  // A smear: the striking figure's own shape above its hips, in one colour.
  if (tint.w > 0.5) { return select(vec4f(0.0), vec4f(tint.rgb, 1.0), root.y - f32(texel.y) > 0.95 * STATUS_PX_PER_M); }
  let flash = u32(round(look.w));
  // A figure nothing befalls reads no neighbours.
  if (status.w <= 0.0 && flash == 0u && status.x < 0.5 && status.y < 0.5 && look.x < 0.5) { return vec4f(colour, 1.0); }
  let edge = status_edge(picture, texel);
  if (status.w > 0.0) { return status_dissolve(u32(round(look.y)), status.w, texel, high, colour, edge, status.z); }
  if (flash == 1u || (flash == 2u && edge)) { return vec4f(tint.rgb, 1.0); }
  let strike = floor(status.z * 12.0);
  var out = colour;
  if (status.x > 0.5) {
    // Veiled: its outline in Cosmic's light, an eighth of its inside in dusk, and a band of shimmer crossing it.
    let size = vec2f(textureDimensions(picture));
    let band = fract(status.z / 0.8) * (size.x + size.y) * 1.3 - size.x * 0.15;
    if (abs(f32(texel.x + texel.y) - band) < 1.5) { return vec4f(status_ramp(3u, 3.0), 1.0); }
    if (edge) { return vec4f(status_ramp(3u, 2.0), 1.0); }
    if (status_order(texel) >= 0.125) { return vec4f(0.0); }
    out = mix(out, status_ramp(3u, 0.0), 0.45);
  }
  if (look.x > 0.5) {
    // Charged: three arcs struck afresh inside the figure, and its edge lit on alternate strikes.
    var near = 1e3;
    for (var arc = 0.0; arc < 3.0; arc += 1.0) { near = min(near, status_arc(vec2f(texel) + 0.5, root, strike, arc)); }
    if (near < 0.8) { return vec4f(status_ramp(2u, 3.0), 1.0); }
    if (near < 1.8) { return vec4f(status_ramp(2u, 1.0), 1.0); }
    if (edge && fract(strike / 2.0) > 0.25) { return vec4f(status_ramp(2u, 2.0), 1.0); }
  }
  if (status.y > 0.5 && (edge || status_clear_at(picture, texel, 2))) {
    // Exposed: two pixels of edge, stepping between Cosmic's body and light.
    return vec4f(status_ramp(3u, select(1.0, 2.0, fract(status.z * 2.0) > 0.5)), 1.0);
  }
  return vec4f(out, 1.0);
}
`;
