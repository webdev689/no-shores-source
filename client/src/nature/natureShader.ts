import { SHADOW_CAST_WGSL, SHADOW_WGSL } from '../shadow.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { FLORA } from './flora.ts';

/** The frame's uniform floats: the view-projection, the anchor, the wind, the snow line and the biome's ground. */
export const FRAME_FLOATS = 32;
/** The segments of a plant's contact shade, a fan round its middle. */
export const SHADE_SEGMENTS = 10;
/** The leaf share the bake gives moss (tools/flora/near.py MOSS_LEAF): it is let go past a stone's throw. */
const MOSS_LEAF = 0.6;
const { azimuths, elevations } = FLORA.frames;

/** What the plants' passes share: their terms, their instances, their pictures, and where each stands. */
const PLANTS = /* wgsl */ `
${SHARED_WGSL}

struct Frame {
  from_eye: mat4x4f,
  // The anchor from the eye (east, south), the eye's drawn height negated, and the heights' exaggeration.
  anchor: vec4f,
  // Seconds, the wind's way (east, south), and the gusts' phase at the anchor.
  wind: vec4f,
  // The snow line, metres.
  land: vec4f,
  // The biome's low ground, and 1 when it is known.
  ground: vec4f,
};

struct Form {
  // The near mesh's range, the reach, the crossfade band, and 1 for the far quad.
  ranges: vec4f,
  // Where the far plants start thinning, the share kept past it, the sway at the top, metres, and where the
  // thinning ends.
  thin: vec4f,
  // The contact shade's radius and the crown's height at size 1, metres, and how dark its middle is.
  shade: vec4f,
  // The layer its cards and bark lie in, and its bark picture's corner and side in the layer.
  atlas: vec4f,
  // Its sprites' layer, their sheet's top in the layer, the bounding sphere's radius, and a frame's side.
  sprites: vec4f,
  // The bounding sphere's middle from the foot, metres at size 1.
  centre: vec4f,
};

struct Instance {
  // Its foot from its tile's corner (east, south), the foot's height and its turn.
  place: vec4f,
  // Its width and height scales, its tint (-1..1) and its rank (0..1).
  look: vec4f,
  // The ground's rise a metre east and south, its tile's number, and the ground's height at its foot.
  ground: vec4f,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var<uniform> form: Form;
@group(0) @binding(2) var<storage, read> instances: array<Instance>;
@group(0) @binding(3) var<storage, read> list: array<u32>;
@group(0) @binding(4) var<storage, read> corners: array<vec2f>;
@group(0) @binding(5) var albedo_map: texture_2d_array<f32>;
@group(0) @binding(6) var normal_map: texture_2d_array<f32>;
@group(0) @binding(7) var pictures: sampler;

struct Vertex {
  @location(0) position: vec3f,
  // The normal, and how much the vertex is leaf.
  @location(1) normal: vec4f,
  // The picture's across, and the sign that turns the normal's cross with it into the picture's up.
  @location(2) tangent: vec4f,
  @location(3) uv: vec2f,
  // The tint, halved, and the ambient occlusion the detailed model casts.
  @location(4) colour: vec4f,
  // How freely it sways, and 1 where its uv repeats in the form's bark picture.
  @location(5) extra: vec4f,
};

const NOWHERE = vec4f(2.0, 2.0, 2.0, 1.0);
const AMBIENT = 0.35;
const SNOW = vec3f(0.94, 0.95, 0.97);
// The ambient's tint from below (light bounced off the ground) and from above (the sky).
const BOUNCE = vec3f(0.95, 0.9, 0.76);
const SKYLIGHT = vec3f(1.0, 1.02, 1.08);
// How far a gust travels in a second, as a phase a metre and a second.
const GUST_PER_M = 0.035;
const GUST_PER_S = 1.4;
// Moss is known by its leaf share, and hangs only as far as a stone's throw: past that it is too fine to read.
const MOSS = ${MOSS_LEAF};
const MOSS_REACH = 150.0;

// An instance's foot from the anchor, and from the eye with its height as drawn.
struct Foot {
  item: Instance,
  anchored: vec2f,
  from_eye: vec3f,
};

fn foot_of(which: u32) -> Foot {
  let item = instances[list[which]];
  let anchored = corners[u32(item.ground.z)] + item.place.xy;
  let from_eye = vec3f(anchored + frame.anchor.xy, item.place.z * frame.anchor.w + frame.anchor.z);
  return Foot(item, anchored, from_eye);
}

// How much of a plant is left by the reach and the thinning at a distance: steep ground thins far plants more, so a
// mountainside reads as a scatter of trees fading out, not a speckle.
fn kept_share(item: Instance, distance: f32) -> vec2f {
  let flank = smoothstep(0.3, 0.6, length(item.ground.xy)) * smoothstep(500.0, 1500.0, distance);
  let keep = (1.0 - (1.0 - form.thin.y) * smoothstep(form.thin.x, form.thin.w, distance)) * (1.0 - 0.85 * flank);
  let left = (1.0 - smoothstep(form.ranges.y * 0.85, form.ranges.y, distance)) * clamp((keep + 0.05 - item.look.w) * 20.0, 0.0, 1.0);
  return vec2f(keep, left);
}

// Where a plant stands this frame, and whether its detail draws it: by its range across the ground, by the reach and
// the thinning, its size widened when it is far and others thinned out round it.
struct Placed {
  foot: Foot,
  culled: bool,
  size: vec3f,
  turn: vec2f,
  cover: vec2f,
  distance: f32,
};

fn placed_of(which: u32) -> Placed {
  var out: Placed;
  let foot = foot_of(which);
  out.foot = foot;
  let item = foot.item;
  // The detail changes by the distance across the ground, as the packing chose each tile's details; the reach and
  // the thinning by the distance from the eye, which is never less, so they only ever take away.
  let across = length(foot.from_eye.xy);
  let distance = length(foot.from_eye);
  out.distance = distance;
  let far = form.ranges.w > 0.5;
  let near_share = 1.0 - smoothstep(form.ranges.x - form.ranges.z, form.ranges.x, across);
  let kept = kept_share(item, distance);
  out.cover = vec2f(near_share, kept.y);
  out.culled = select(near_share, 1.0 - near_share, far) <= 0.0 || kept.y <= 0.0;
  let grow = select(1.0, inverseSqrt(max(kept.x, 0.05)), far);
  out.size = vec3f(item.look.x * grow, item.look.x * grow, item.look.y * (1.0 + (grow - 1.0) * 0.3));
  out.turn = vec2f(cos(item.place.w), sin(item.place.w));
  return out;
}

fn turned(turn: vec2f, local: vec2f) -> vec2f {
  return vec2f(turn.x * local.x - turn.y * local.y, turn.y * local.x + turn.x * local.y);
}

// A near mesh's vertex where it stands, measured from the eye, leaning and swaying.
fn standing_of(vertex: Vertex, at: Placed) -> vec3f {
  let item = at.foot.item;
  let local = vertex.position * at.size;
  var offset = turned(at.turn, local.xy);
  // Most trunks stand near upright and a few lean a little more, each its own way, read from its rank's digits.
  let tilt_way = fract(item.look.w * 7.31) * TAU;
  let tilt = select(0.0, fract(item.look.w * 13.7) * fract(item.look.w * 3.3) * 0.09, form.thin.z > 0.0);
  offset += vec2f(cos(tilt_way), sin(tilt_way)) * tilt * local.z;
  // Gusts roll downwind across the land; each plant also rocks on its own beat, its leaves trembling.
  let gust = 0.6 + 0.4 * sin(frame.wind.w + dot(at.foot.anchored, frame.wind.yz) * GUST_PER_M - frame.wind.x * GUST_PER_S);
  let sway = 0.35 * sin(frame.wind.x * 2.3 + item.look.w * 40.0);
  let bend = vertex.extra.x * form.thin.z * item.look.y * (gust + sway);
  offset += frame.wind.yz * bend;
  let tremble = vertex.normal.w * 0.03 * sin(frame.wind.x * 7.0 + dot(vertex.position, vec3f(3.1, 2.3, 1.7)));
  return at.foot.from_eye + vec3f(offset, local.z - abs(bend) * 0.2 + tremble);
}

// Where a near mesh's uv reads its pictures: as it is, or wrapped into the form's bark picture, with the gradients
// sampling needs (taken before wrapping, so the wrap leaves no seam of the smallest mip).
struct Picture {
  uv: vec2f,
  dx: vec2f,
  dy: vec2f,
};

fn picture_of(uv: vec2f, wraps: f32) -> Picture {
  let side = form.atlas.w;
  let inset = 1.5 / 1024.0;
  let wrapped = form.atlas.yz + inset + fract(uv) * (side - 2.0 * inset);
  let bark = wraps > 0.5;
  return Picture(select(uv, wrapped, bark), dpdx(uv) * select(1.0, side, bark), dpdy(uv) * select(1.0, side, bark));
}
`;

/** Lighting, as the land is lit: its ambient bounced warm from the ground under a crown and cool from the sky over
 *  it, the sun as the shadow map lets it through, a little sun through the leaves, snow settling on what faces up. */
const LIGHT = /* wgsl */ `
fn lit(base: vec3f, normal: vec3f, leaf: f32, occlusion: f32, from_eye: vec3f, snow: f32) -> vec3f {
  let sun = sunlit(from_eye, normal);
  let direct = max(dot(normal, SUN), 0.0) * sun;
  let ambient = AMBIENT * mix(BOUNCE, SKYLIGHT, normal.z * 0.5 + 0.5) * occlusion;
  // Leaves pass on the sky and the ground's bounce, and the sun behind them: a crown's underside is green, never black.
  let through = leaf * (0.2 + 0.3 * max(-dot(normal, SUN), 0.0) * sun) * occlusion;
  var colour = base * (ambient + (1.0 - AMBIENT) * direct * mix(1.0, occlusion, 0.5)) + base * SUN_LIGHT * through;
  let settled = snow * smoothstep(0.35, 0.75, normal.z);
  return mix(colour, SNOW * (AMBIENT + (1.0 - AMBIENT) * direct), settled);
}

// The instance's tint turns foliage warmer and yellower one way, deeper and cooler the other; bark only lightens or
// darkens. Far off, a plant's colour leans toward the biome's ground, so a far forest sits in its land.
fn tinted(albedo: vec3f, tint: f32, leaf: f32, distance: f32) -> vec3f {
  let hue = select(vec3f(0.9, 0.98, 1.05), vec3f(1.12, 1.05, 0.8), tint > 0.0);
  let own = albedo * mix(vec3f(1.0), hue, abs(tint) * leaf) * (1.0 + 0.08 * tint * (1.0 - leaf));
  let lean = select(0.0, 0.35 * smoothstep(900.0, form.ranges.y, distance), frame.ground.w > 0.5);
  return mix(own, frame.ground.rgb * 0.85, lean);
}

// The samples a share of a pixel covers: 'share' of four, dithered over two pixels, starting at a sample that turns
// with the pixel, so neighbouring pixels leave different samples open.
fn coverage(share: f32, pixel: vec2u, turn: u32) -> u32 {
  let dither = array<f32, 4>(0.125, 0.625, 0.875, 0.375);
  let count = u32(clamp(floor(share * 4.0 + dither[(pixel.x & 1u) + 2u * (pixel.y & 1u)]), 0.0, 4.0));
  let run = (1u << count) - 1u;
  let start = (pixel.x + 3u * pixel.y + turn) & 3u;
  return ((run << start) | (run >> (4u - start))) & 15u;
}

// An alpha-cut edge as a share of the pixel, so a leaf's edge is smoothed by the samples rather than stepped.
fn edge_share(alpha: f32) -> f32 {
  return clamp((alpha - 0.5) / max(fwidth(alpha), 0.04) + 0.5, 0.0, 1.0);
}

struct Drawn {
  @location(0) colour: vec4f,
  @builtin(sample_mask) mask: u32,
};
`;

/**
 * The plants, drawn instanced: each instance's slot is read from the list, and its foot placed from its tile's
 * corner, measured from an anchor beside the eye, so the GPU's floats keep their centimetres however far the world
 * reaches. Near, a baked mesh wearing its biome's pictures, alpha-cut; far, one quad facing the eye that shows the
 * nearest frames of its impostor sheet, lit by their normals. A plant fades by its samples, not by blending: the near
 * mesh hands its samples to the far quad across the crossfade band, each taking exactly what the other leaves, and
 * both give theirs up toward the reach and as the far ones thin out. Four samples and a dither over two pixels give
 * seventeen steps.
 */
export const NATURE_SHADER = /* wgsl */ `
${PLANTS}
${SHADOW_WGSL}
${LIGHT}

struct Shaded {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) tangent: vec4f,
  @location(2) uv: vec2f,
  // The tint (doubled back), the ambient occlusion and the leaf share.
  @location(3) colour: vec4f,
  @location(4) leaf: f32,
  @location(5) @interpolate(flat) wraps: f32,
  // The near mesh's share, and what the reach and the thinning leave, the same over the whole plant.
  @location(6) @interpolate(flat) cover: vec2f,
  // The snow on it, its tint and its distance.
  @location(7) @interpolate(flat) look: vec3f,
  @location(8) from_eye: vec3f,
};

@vertex
fn plant_vertex(vertex: Vertex, @builtin(instance_index) which: u32) -> Shaded {
  var out: Shaded;
  let at = placed_of(which);
  out.cover = at.cover;
  let moss = abs(vertex.normal.w - MOSS) < 0.04 && at.distance > MOSS_REACH;
  if (at.culled || moss) {
    out.clip = NOWHERE;
    return out;
  }
  let point = standing_of(vertex, at);
  out.clip = frame.from_eye * vec4f(point, 1.0);
  out.from_eye = point;
  let scaled = normalize(vertex.normal.xyz / at.size);
  out.normal = vec3f(turned(at.turn, scaled.xy), scaled.z);
  out.tangent = vec4f(turned(at.turn, vertex.tangent.xy), vertex.tangent.z, vertex.tangent.w);
  out.uv = vertex.uv;
  out.colour = vec4f(vertex.colour.rgb * 2.0, vertex.colour.a);
  out.leaf = vertex.normal.w;
  out.wraps = vertex.extra.y;
  let item = at.foot.item;
  out.look = vec3f(smoothstep(frame.land.x - 100.0, frame.land.x + 50.0, item.place.z), item.look.z, at.distance);
  return out;
}

@fragment
fn plant_fragment(shaded: Shaded) -> Drawn {
  let picture = picture_of(shaded.uv, shaded.wraps);
  let layer = i32(form.atlas.x);
  let albedo = textureSampleGrad(albedo_map, pictures, picture.uv, layer, picture.dx, picture.dy);
  let mapped = textureSampleGrad(normal_map, pictures, picture.uv, layer, picture.dx, picture.dy).xyz * 2.0 - 1.0;
  let edge = edge_share(albedo.a);
  let pixel = vec2u(shaded.clip.xy);
  let near_mask = coverage(shaded.cover.x, pixel, 0u);
  let mask = near_mask & coverage(shaded.cover.y, pixel, 2u) & coverage(edge, pixel, 1u);
  if (mask == 0u) {
    discard;
  }
  let normal_axis = normalize(shaded.normal);
  let across = normalize(shaded.tangent.xyz - normal_axis * dot(shaded.tangent.xyz, normal_axis));
  let up = cross(normal_axis, across) * select(-1.0, 1.0, shaded.tangent.w >= 0.0);
  let normal = normalize(across * mapped.x + up * mapped.y + normal_axis * max(mapped.z, 0.2));
  let base = tinted(albedo.rgb * shaded.colour.rgb, shaded.look.y, shaded.leaf, shaded.look.z);
  let colour = lit(base, normal, shaded.leaf, shaded.colour.a, shaded.from_eye, shaded.look.x);
  return Drawn(vec4f(colour, 1.0), mask);
}

struct Sprite {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  // The two azimuth columns either side of the view and how much of the second; the first elevation row.
  @location(1) @interpolate(flat) columns: vec4f,
  // The second row and how much of it; the instance's turn.
  @location(2) @interpolate(flat) rows: vec4f,
  @location(3) @interpolate(flat) cover: vec2f,
  @location(4) @interpolate(flat) look: vec3f,
  @location(5) from_eye: vec3f,
};

const AZIMUTHS = ${azimuths}.0;
const ELEVATIONS = array<f32, ${elevations.length}>(${elevations.map((each) => `${each}.0`).join(', ')});
const QUAD = array<vec2f, 6>(vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));

// A far plant: one quad facing the eye over its bounding sphere, and the frames of its sheet nearest the view (as
// impostor.ts framesFor chooses them). The sheet was rendered in Blender's frame, its y the game's turned round.
@vertex
fn sprite_vertex(@builtin(vertex_index) index: u32, @builtin(instance_index) which: u32) -> Sprite {
  var out: Sprite;
  let at = placed_of(which);
  out.cover = at.cover;
  if (at.culled) {
    out.clip = NOWHERE;
    return out;
  }
  let middle = at.foot.from_eye + vec3f(turned(at.turn, form.centre.xy * at.size.xy), form.centre.z * at.size.z);
  let to_eye = -middle;
  let local = vec3f(turned(vec2f(at.turn.x, -at.turn.y), to_eye.xy), to_eye.z);
  let blender = vec3f(local.x, -local.y, local.z);
  let azimuth = atan2(blender.y, blender.x);
  let elevation = atan2(blender.z, length(blender.xy));
  let right = vec3f(-sin(azimuth), cos(azimuth), 0.0);
  let up = vec3f(-cos(azimuth) * sin(elevation), -sin(azimuth) * sin(elevation), cos(elevation));
  let world_right = vec3f(turned(at.turn, vec2f(right.x, -right.y)), right.z);
  let world_up = vec3f(turned(at.turn, vec2f(up.x, -up.y)), up.z);
  let quad = QUAD;
  let corner = quad[index];
  let radius = form.sprites.z;
  let point = middle + world_right * (corner.x * 2.0 - 1.0) * radius * at.size.x
    + world_up * (1.0 - corner.y * 2.0) * radius * at.size.z;
  out.clip = frame.from_eye * vec4f(point, 1.0);
  out.from_eye = point;
  out.uv = corner;
  let step = fract(azimuth / TAU + 1.0) * AZIMUTHS;
  let first = floor(step) % AZIMUTHS;
  let degrees = elevation * 57.29578;
  let rows = ELEVATIONS;
  var row = 0u;
  let last = ${elevations.length - 1}u;
  while (row < last - 1u && degrees > rows[row + 1u]) {
    row += 1u;
  }
  let low = rows[row];
  let high = rows[min(row + 1u, last)];
  let down = select(0.0, clamp((degrees - low) / (high - low), 0.0, 1.0), high > low);
  out.columns = vec4f(first, (first + 1.0) % AZIMUTHS, step - floor(step), f32(row));
  out.rows = vec4f(f32(min(row + 1u, last)), down, at.turn);
  let item = at.foot.item;
  out.look = vec3f(smoothstep(frame.land.x - 100.0, frame.land.x + 50.0, item.place.z), item.look.z, at.distance);
  return out;
}

fn frame_uv(column: f32, row: f32, uv: vec2f) -> vec2f {
  let cell = form.sprites.w;
  let inside = clamp(uv, vec2f(0.01), vec2f(0.99));
  return vec2f((column + inside.x) * cell, form.sprites.y + (row + inside.y) * cell);
}

@fragment
fn sprite_fragment(sprite: Sprite) -> Drawn {
  let layer = i32(form.sprites.x);
  let weights = vec4f((1.0 - sprite.columns.z) * (1.0 - sprite.rows.y), sprite.columns.z * (1.0 - sprite.rows.y),
    (1.0 - sprite.columns.z) * sprite.rows.y, sprite.columns.z * sprite.rows.y);
  let places = array<vec2f, 4>(frame_uv(sprite.columns.x, sprite.columns.w, sprite.uv),
    frame_uv(sprite.columns.y, sprite.columns.w, sprite.uv), frame_uv(sprite.columns.x, sprite.rows.x, sprite.uv),
    frame_uv(sprite.columns.y, sprite.rows.x, sprite.uv));
  var albedo = vec4f(0.0);
  var facing = vec4f(0.0);
  for (var each = 0; each < 4; each++) {
    albedo += textureSample(albedo_map, pictures, places[each], layer) * weights[each];
    facing += textureSample(normal_map, pictures, places[each], layer) * weights[each];
  }
  let edge = edge_share(albedo.a);
  let pixel = vec2u(sprite.clip.xy);
  let far_mask = ~coverage(sprite.cover.x, pixel, 0u) & 15u;
  let mask = far_mask & coverage(sprite.cover.y, pixel, 2u) & coverage(edge, pixel, 1u);
  if (mask == 0u) {
    discard;
  }
  let blender = normalize(facing.xyz * 2.0 - 1.0);
  let normal = vec3f(turned(sprite.rows.zw, vec2f(blender.x, -blender.y)), blender.z);
  let base = tinted(albedo.rgb, sprite.look.y, facing.a, sprite.look.z);
  return Drawn(vec4f(lit(base, normal, facing.a, 1.0, sprite.from_eye, sprite.look.x), 1.0), mask);
}

struct Shade {
  @builtin(position) clip: vec4f,
  // 0 at the shade's middle, 1 at its rim; and how dark its middle is.
  @location(0) out_from_middle: f32,
  @location(1) @interpolate(flat) darkness: f32,
};

// A plant's contact shade: a soft dark disc on the ground under it, leaning a little the way the sun throws shadows,
// laid on the ground's slope at its foot. With no shadows drawn, it is what keeps a plant from looking pasted on.
@vertex
fn shade_vertex(@builtin(vertex_index) index: u32, @builtin(instance_index) which: u32) -> Shade {
  var out: Shade;
  let foot = foot_of(which);
  let item = foot.item;
  let distance = length(foot.from_eye);
  let fade = (1.0 - smoothstep(form.ranges.x * 0.4, form.ranges.x * 0.75, distance)) * kept_share(item, distance).y;
  if (fade <= 0.0 || form.shade.x <= 0.0) {
    out.clip = NOWHERE;
    return out;
  }
  let corner = index % 3u;
  let angle = f32(index / 3u + select(0u, 1u, corner == 2u)) / ${SHADE_SEGMENTS}.0 * TAU;
  let rim = select(1.0, 0.0, corner == 0u);
  let lean = -SUN.xy / SUN.z * form.shade.y * item.look.y * 0.35;
  let offset = lean + vec2f(cos(angle), sin(angle)) * form.shade.x * item.look.x * rim;
  let ground = item.ground.w + dot(item.ground.xy, offset) + 0.12;
  let point = vec3f(foot.from_eye.xy + offset, ground * frame.anchor.w + frame.anchor.z);
  out.clip = frame.from_eye * vec4f(point, 1.0);
  out.out_from_middle = rim;
  out.darkness = form.shade.z * fade;
  return out;
}

@fragment
fn shade_fragment(shade: Shade) -> @location(0) vec4f {
  let soft = 1.0 - shade.out_from_middle * shade.out_from_middle;
  return vec4f(0.0, 0.0, 0.0, shade.darkness * soft * soft);
}
`;

/** The near plants' depth along the sun, for the shadow map: placed and swaying as they are drawn, their cards cut
 *  where their pictures are clear. */
export const NATURE_CAST_SHADER = /* wgsl */ `
${PLANTS}
${SHADOW_CAST_WGSL}

struct Caster {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) wraps: f32,
};

@vertex
fn plant_cast(vertex: Vertex, @builtin(instance_index) which: u32) -> Caster {
  var out: Caster;
  let at = placed_of(which);
  if (at.culled || form.ranges.w > 0.5) {
    out.clip = NOWHERE;
    return out;
  }
  out.clip = shadow.from_eye * vec4f(standing_of(vertex, at), 1.0);
  out.uv = vertex.uv;
  out.wraps = vertex.extra.y;
  return out;
}

@fragment
fn plant_cast_fragment(caster: Caster) {
  let picture = picture_of(caster.uv, caster.wraps);
  if (textureSampleGrad(albedo_map, pictures, picture.uv, i32(form.atlas.x), picture.dx, picture.dy).a < 0.5) {
    discard;
  }
}
`;
