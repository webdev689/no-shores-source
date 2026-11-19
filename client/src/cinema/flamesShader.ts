// The fires' WGSL. Every part is a quad from one instance: smoke a soft puff facing the eye, a tongue of flame standing
// up from its base and leaning with the wind, an ember a hot point, and a glow the light a fire throws round it, drawn
// only into the light layer. Smoke and fire are laid over the finished picture, tested against the scene's depth by
// hand, so the water laid after the land never covers a fire burning above it.
import { LIGHT_WGSL } from '../combat/lightLayer.ts';

/** Each part's kind, as the instance's fourth float carries it. */
export const PART = { smoke: 0, tongue: 1, ember: 2, glow: 3 } as const;

export const FLAMES_WGSL = /* wgsl */ `
struct View { from_eye: mat4x4f, time: vec4f }
@group(0) @binding(0) var<uniform> view: View;

struct Part {
  @location(0) place: vec4f,  // from the eye, then the kind
  @location(1) shape: vec4f,  // width or radius, height, then the lean east and south
  @location(2) colour: vec4f, // colour, then strength
}
struct Out {
  @builtin(position) position: vec4f,
  @location(0) along: vec2f,
  @location(1) colour: vec4f,
  @location(2) @interpolate(flat) kind_seed: vec2f,
}

const CORNERS = array<vec2f, 6>(vec2f(-1.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
  vec2f(-1.0, 0.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));

fn mixed(value: u32) -> u32 {
  var state = value * 747796405u + 2891336453u;
  state = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (state >> 22u) ^ state;
}
fn corner_value(cell: vec2f, seed: f32) -> f32 {
  let whole = vec2i(cell);
  return f32(mixed((bitcast<u32>(whole.x) * 1597334677u) ^ mixed(bitcast<u32>(whole.y) ^ u32(seed)))) / 4294967296.0;
}
fn noise2(point: vec2f, seed: f32) -> f32 {
  let base = floor(point);
  let part = point - base;
  let eased = part * part * (3.0 - 2.0 * part);
  return mix(mix(corner_value(base, seed), corner_value(base + vec2f(1.0, 0.0), seed), eased.x),
    mix(corner_value(base + vec2f(0.0, 1.0), seed), corner_value(base + vec2f(1.0, 1.0), seed), eased.x), eased.y);
}

@vertex fn part_vertex(@builtin(vertex_index) index: u32, @builtin(instance_index) instance: u32, part: Part) -> Out {
  let corner = CORNERS[index];
  let matrix = view.from_eye;
  let right = normalize(vec3f(matrix[0].x, matrix[1].x, matrix[2].x));
  let up = normalize(vec3f(matrix[0].y, matrix[1].y, matrix[2].y));
  let kind = u32(part.place.w);
  var world: vec3f;
  var along: vec2f;
  if (kind == ${PART.tongue}u) {
    let across = normalize(vec3f(right.xy, 0.0) + vec3f(1.0e-4, 0.0, 0.0));
    let rise = vec3f(part.shape.zw, 1.0) * part.shape.y;
    world = part.place.xyz + across * corner.x * part.shape.x + rise * corner.y;
    along = corner;
  } else {
    // An ember never shrinks below about 2.5 milliradians, so a spark far off still shows.
    var radius = part.shape.x;
    if (kind == ${PART.ember}u) { radius = max(radius, length(part.place.xyz) * 0.0025); }
    let centred = vec2f(corner.x, corner.y * 2.0 - 1.0);
    world = part.place.xyz + (right * centred.x + up * centred.y) * radius;
    along = centred;
  }
  var out: Out;
  out.position = matrix * vec4f(world, 1.0);
  out.along = along;
  out.colour = part.colour;
  out.kind_seed = vec2f(f32(kind), f32(instance % 997u));
  return out;
}

// A tongue's flame: a teardrop torn by noise rising through it, white-hot at its root and red at its edges.
fn flame(along: vec2f, seed: f32) -> vec4f {
  let height = along.y;
  let torn = along.x + (noise2(vec2f(height * 3.0 - view.time.x * 4.5, seed), seed) - 0.5) * 0.9 * height;
  let width = pow(1.0 - height, 0.6) * min(1.0, height * 5.0 + 0.35);
  let body = smoothstep(width, width * 0.25, abs(torn));
  let heat = body * (1.0 - height * 0.7);
  let ramp = mix(mix(vec3f(0.55, 0.06, 0.01), vec3f(1.0, 0.42, 0.06), smoothstep(0.0, 0.4, heat)),
    mix(vec3f(1.0, 0.8, 0.3), vec3f(1.0, 0.97, 0.85), smoothstep(0.75, 1.0, heat)), smoothstep(0.35, 0.75, heat));
  return vec4f(ramp * body, body);
}

fn shaded(in: Out) -> vec4f {
  let kind = u32(in.kind_seed.x);
  let seed = in.kind_seed.y;
  let reach = length(in.along);
  if (kind == ${PART.smoke}u) {
    let wisp = 0.6 + 0.4 * noise2(in.along * 2.5 + vec2f(seed, view.time.x * 0.3), seed);
    let cover = smoothstep(1.0, 0.25, reach) * wisp * in.colour.a;
    return vec4f(in.colour.rgb * cover, cover);
  }
  if (kind == ${PART.tongue}u) {
    let lit = flame(in.along, seed);
    return vec4f(lit.rgb * in.colour.a, 0.0);
  }
  let spark = pow(max(1.0 - reach, 0.0), 2.0) * in.colour.a;
  return vec4f(in.colour.rgb * spark, 0.0);
}

@group(0) @binding(1) var depths: texture_2d<f32>;

// Over the finished picture: hidden where the scene's depth (reversed, nearer is more) stands nearer.
@fragment fn over_fragment(in: Out) -> @location(0) vec4f {
  if (in.position.z < textureLoad(depths, vec2i(in.position.xy), 0).r) { discard; }
  return shaded(in);
}

${LIGHT_WGSL}
@fragment fn light_fragment(in: Out) -> @location(0) vec4f {
  let share = max(1.0 - length(in.along), 0.0) * in.colour.a;
  return light_of(in.colour.rgb, share);
}
`;
