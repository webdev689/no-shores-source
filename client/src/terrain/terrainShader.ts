import { SHADOW_WGSL } from '../shadow.ts';
import { SHARED_WGSL } from '../water/waterCommon.ts';
import { CLIPMAP_LEVELS, CLIPMAP_QUADS } from './clipmap.ts';
import { GROUND_COLOUR_WGSL } from './groundColour.ts';

/** How far inland of the painted coast the middle ground is eased in from, metres: nearer the coast the 1 km land
 *  is the water's own, so the land drawn there keeps to it. */
const MIDDLE_FROM_COAST_M = [150, 400] as const;

/**
 * The land is drawn as rings round the eye (clipmap.ts), from the vertex index and the ring alone. A ring's heights
 * are read along Catmull-Rom splines through the samples, the close-up's eased into the 1 km land's, so a coast or a
 * bank is a smooth curve wherever the vertices fall. Toward a ring's edge its odd vertices slide onto the next ring's
 * grid, so the rings meet without a crack; the quads under the finer ring are left empty. Every ring's vertices lie on
 * one lattice of the finest ring's steps, counted in whole numbers from its corner, so a vertex two rings share is the
 * same point to the bit. It is the bed: the water is drawn over it afterwards, from the same splines. Points are
 * measured from the eye, and from the noise's anchor.
 */
export const SHADER = /* wgsl */ `
${SHARED_WGSL}
${SHADOW_WGSL}
${GROUND_COLOUR_WGSL}

struct View {
  from_eye: mat4x4f,
  brush: vec4f,
  eye: vec4f,
  local: vec4f,
  close: vec4f,
  wide: vec4f,
  ground: vec4f,
  // The finest ring's corner from the eye, and its step: the lattice every ring's corner and step count in.
  lattice: vec4f,
  // The biome's woods: their canopy's colour and cover; and the window's corner in world metres, and how strongly
  // the woods gather in the groves.
  woods: vec4f,
  world: vec4f,
  // Where the noise's anchor falls in the tiles, as fractions of a tile: the plain reading, then the wide turned one.
  tiles: vec4f,
  // The painting of what is laid on the land: its north-west corner (window metres), texels a metre, and whether
  // there is one.
  paint: vec4f,
  // The middle ground (showMiddle): the eye from its corner, metres, its step, and whether it is shown.
  middle: vec4f,
  // The noise's anchor in a 1024 m square, metres: fine detail is read from it and the point's offset, both exact in
  // single precision, where a world coordinate of millions of metres steps by half a metre.
  fine: vec4f,
  rings: array<vec4f, ${CLIPMAP_LEVELS * 2}>,
};

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var wide_heights: texture_2d<f32>;
@group(0) @binding(2) var wide_lakes: texture_2d<f32>;
@group(0) @binding(3) var wide_marks: texture_2d<u32>;
@group(0) @binding(4) var close_heights: texture_2d<f32>;
@group(0) @binding(5) var close_levels: texture_2d<f32>;
@group(0) @binding(6) var close_marks: texture_2d<u32>;
@group(0) @binding(7) var ground_tiles: texture_2d_array<f32>;
@group(0) @binding(8) var tile_sampler: sampler;
@group(0) @binding(9) var ground_paint: texture_2d<f32>;
@group(0) @binding(10) var paint_sampler: sampler;
@group(0) @binding(11) var middle_heights: texture_2d<f32>;

struct Surface {
  @builtin(position) clip: vec4f,
  @location(0) offset: vec2f,
  // The mesh's height here: the ground at its vertices, straight between them.
  @location(1) bed: f32,
};


const QUADS = ${CLIPMAP_QUADS}u;
const CORNERS = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u));
const NOWHERE = vec4f(2.0, 2.0, 2.0, 1.0);
const RIVER = vec3f(0.18, 0.42, 0.72);
const ROAD = vec3f(0.62, 0.48, 0.30);
const TOWN = vec3f(0.75, 0.30, 0.22);
const PORT = vec3f(0.95, 0.95, 0.90);
const RING = vec3f(1.0, 0.95, 0.70);

fn wide_at(offset: vec2f) -> vec2f {
  return (view.eye.xy + offset) / view.wide.x - 0.5;
}

fn close_at(offset: vec2f) -> vec2f {
  return (offset + view.local.zw) / view.close.x;
}

// The ground at a point: the 1 km land, the middle ground eased in over it inland, and the close-up's over both
// (share, close_share's), each easing into the coarser one across its edge.
fn land_at(offset: vec2f, share: f32) -> Wide {
  var land = wide_ground(wide_heights, wide_at(offset));
  land.ground *= vec4f(1.0, 1.0 / view.wide.x, 1.0 / view.wide.x, 1.0);
  let middle_at = (offset + view.middle.xy) / view.middle.z;
  let inland = smoothstep(${MIDDLE_FROM_COAST_M[0]}.0, ${MIDDLE_FROM_COAST_M[1]}.0, land.ground.w);
  let middle_share = close_share(middle_heights, middle_at, view.middle.w > 0.5) * inland;
  if (middle_share > 0.0) {
    let middle = spline_at(middle_heights, middle_at) * vec3f(1.0, 1.0 / view.middle.z, 1.0 / view.middle.z);
    land.ground = vec4f(mix(land.ground.xyz, middle, middle_share), land.ground.w);
  }
  if (share > 0.0) {
    let near = spline_at(close_heights, close_at(offset)) * vec3f(1.0, 1.0 / view.close.x, 1.0 / view.close.x);
    land.ground = vec4f(mix(land.ground.xyz, near, share), land.ground.w);
  }
  return land;
}

@vertex
fn vertex_main(@builtin(vertex_index) index: u32, @builtin(instance_index) ring: u32) -> Surface {
  var surface: Surface;
  let first = view.rings[ring * 2u];
  let hole = view.rings[ring * 2u + 1u];
  let spacing = first.z * view.lattice.z;
  let corner = view.lattice.xy + first.xy * view.lattice.z;
  let quad = vec2u((index / 6u) % QUADS, (index / 6u) / QUADS);
  let finer = vec2f(quad) - hole.xy;
  if (hole.z > 0.5 && all(finer >= vec2f(0.0)) && all(finer < vec2f(f32(QUADS / 2u)))) {
    surface.clip = NOWHERE;
    return surface;
  }
  // Quads off the window, or past the far plane, hold nothing to draw.
  let near_corner = view.eye.xy + corner + vec2f(quad) * spacing;
  let nearest = clamp(vec2f(0.0), corner + vec2f(quad) * spacing, corner + vec2f(quad + 1u) * spacing);
  if (any(near_corner + spacing < vec2f(0.0)) || any(near_corner > view.close.zw) || length(nearest) > view.wide.y) {
    surface.clip = NOWHERE;
    return surface;
  }
  let grid = vec2f(quad + CORNERS[index % 6u]);
  let half = f32(QUADS) * 0.5;
  let reach = max(abs(grid.x - half), abs(grid.y - half)) / half;
  let morph = clamp((reach - 0.7) / 0.25, 0.0, 1.0);
  let snapped = grid - (grid - 2.0 * floor(grid * 0.5)) * morph;
  // Whole lattice steps, exact in f32, then one rounding: the same for every ring at a shared vertex.
  let offset = view.lattice.xy + (first.xy + snapped * first.z) * view.lattice.z;
  let share = close_share(close_heights, close_at(offset), view.close.y > 0.5);
  let ground = land_at(offset, share);
  // A triangle across the coast must reach the sea's level on the painted line or inland of it, never out at sea,
  // or it would stand over water the ground lies under. So a vertex inland, within a triangle's reach of the coast,
  // is lowered as far as that asks of the lowest the sea can be at its seaward neighbour, a pixel short of the line;
  // the pixel then draws the land and the water's edge from the ground itself.
  // The coast's distance is held at COAST_REACH, so the rule fades out short of it: a ring coarser than that
  // would otherwise take all its land for coast.
  let span = spacing * (1.0 + morph) * 1.4142;
  let coast = ground.ground.w - length(vec3f(offset, ground.ground.x * view.brush.w - view.eye.z)) * view.wide.z;
  let held = 1.0 - smoothstep(0.6 * COAST_REACH, 0.9 * COAST_REACH, ground.ground.w);
  var bed = ground.ground.x;
  if (coast < span && ground.ground.w > 0.0 && held > 0.0) {
    let seaward = -coast_meet(ground.sides.x, ground.sides.y, ground.ground.w - span);
    bed = mix(bed, min(bed, coast * max(seaward, 0.0) / max(span - coast, 1e-3)), held);
  }
  // Round fresh water the same holds: a vertex within a step's rise (4 m at most) of a lake's or a river's level
  // sinks under it.
  let still = still_at(wide_lakes, wide_at(offset), close_levels, close_at(offset), share);
  let rise = min(length(ground.ground.yz) * span, 4.0);
  if (still.y > 0.5) {
    bed = min(bed, mix(still.z - FRESH_SINK, bed, smoothstep(1.0, 2.0, (bed - still.z) / max(rise, 1e-3))));
  }
  // Under the water and just above it, where its swash runs, the mesh lies a step's rise (half a metre at most)
  // under the ground, so a triangle cutting across the ground never hides the thin water over it.
  bed -= (min(rise, 0.5) + 0.02) * (1.0 - smoothstep(2.0, 3.0, bed - still.z));
  surface.offset = offset;
  surface.bed = bed;
  surface.clip = view.from_eye * vec4f(offset, bed * view.brush.w - view.eye.z, 1.0);
  return surface;
}

// Each pixel reads the ground under it, not the mesh: far off a ring's triangles are kilometres across, and only
// place the pixel. Its light and colour come from the ground itself, and the water draws its edge against it too.
@fragment
fn fragment_main(surface: Surface) -> @location(0) vec4f {
  let point = view.eye.xy + surface.offset;
  let local = surface.offset + view.local.xy;
  let from_brush = distance(point, view.brush.xy);
  let ring_width = max(fwidth(from_brush), 1e-3);
  let close = close_at(surface.offset);
  let wide = wide_at(surface.offset);
  let share = close_share(close_heights, close, view.close.y > 0.5);
  let ground = land_at(surface.offset, share).ground;
  let bed = ground.x;
  let slope = length(ground.yz);
  let still = still_at(wide_lakes, wide, close_levels, close, share);
  // A pixel's footprint on the ground, metres: its angle times the distance, stretched as the view grazes; smooth
  // from triangle to triangle, unlike the mesh's own derivatives.
  let on_mesh = vec3f(surface.offset, surface.bed * view.brush.w - view.eye.z);
  let reach_to = max(length(on_mesh), 1e-4);
  let ray = on_mesh / reach_to;
  let footprint = reach_to * view.wide.z / max(abs(ray.z), 0.02);
  let fine = 1.0 - smoothstep(0.06, 0.3, footprint);
  let depth = still.x - bed;
  // The bed's colour turns to the land's across a pixel, not at a hard line, where the water's own edge is.
  let under = wet_share(depth, slope * footprint, still, share);
  let fresh = still.y > 0.5;
  let normal = normalize(vec3f(-ground.yz * view.brush.w, 1.0));

  var wet = bed_colour(max(depth, 0.0), slope, fresh);
  let light = caustics(local, view.eye.w) * fine * exp(-max(depth, 0.0) / 9.0) * smoothstep(0.0, 0.4, depth);
  wet += sky_state.key_light.rgb * light * select(0.32, 0.12, fresh);

  let world = view.world.xy + point;
  // The dirt's grain is read once a pixel: the land, the roads and the paths all wear it.
  let dirt_grain = tile_grain(DIRT_TILE, local);
  let laid = paint_at(point);
  let land = land_colour(bed, slope, ground.w, local, normal, dirt_grain, chalk_share(laid));
  var dry = wooded(land, world, bed, slope, reach_to);
  let in_close = share > 0.5;
  dry = mix(dry, RIVER, 0.7 * select(marked(wide_marks, wide, 1u, 2u), 0.0, in_close));
  let road = select(marked(wide_marks, wide, 3u, 3u), marked(close_marks, close, 3u, 3u), in_close);
  let town = select(marked(wide_marks, wide, 4u, 4u), marked(close_marks, close, 4u, 4u), in_close);
  let port = select(marked(wide_marks, wide, 5u, 5u), marked(close_marks, close, 5u, 5u), in_close);
  dry = mix(mix(mix(dry, ROAD * dirt_grain, road), TOWN, 0.6 * town), PORT, port);
  dry = painted(dry, laid, local, footprint, dirt_grain);

  let on_ground = vec3f(surface.offset, bed * view.brush.w - view.eye.z);
  // Fresh snow whitens the flat ground where the weather laid it; rain darkens the dry ground and pools in its
  // hollows, above the swash and under no snow.
  let open = select(1.0, 0.0, sky_sheltered(on_ground + vec3f(0.0, 0.0, 0.6)));
  let snow = sky_fresh_snow(bed, slope) * open;
  dry = sky_snowed(dry, snow);
  let open_ground = (1.0 - under) * smoothstep(0.5, 1.5, bed) * (1.0 - snow) * open;
  let puddle = sky_puddle(on_ground, slope) * open_ground;
  let soaked = max(sky_state.ambient_sky.w * open_ground * 0.8, puddle);
  dry = sky_soaked(dry, soaked);
  var colour = mix(dry, wet, under);
  let lit_normal = normalize(mix(normal, vec3f(0.0, 0.0, 1.0), puddle));
  let direct = max(dot(lit_normal, sky_state.key.xyz), 0.0);
  let sun = select(1.0, sunlit(on_ground, lit_normal), direct > 0.0) * sky_dapple(on_ground);
  colour *= sky_ambient(lit_normal) + sky_direct(lit_normal, sun) + sky_lamps(on_ground, lit_normal);
  colour += sky_sheen(lit_normal, on_ground, soaked * (0.4 + 0.6 * puddle));
  let ring = 1.0 - smoothstep(0.0, ring_width * 1.5, abs(from_brush - view.brush.z));
  colour = mix(colour, RING, select(0.0, ring, view.brush.z > 0.0));

  return vec4f(colour, 1.0);
}
`;
