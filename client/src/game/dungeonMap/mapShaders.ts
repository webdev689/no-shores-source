// The dungeon map's ink, in two passes over the dungeon's own mesh. The first lays each face the eye sees from inside
// a room (a face turned away is never drawn, so a room's near wall goes and it lies open from any side), cut above
// the storey looked at and only where its cell was walked or seen: its facing, its shade and its kind into two
// targets, and its depth. The second inks the lines where the drawing starts or stops, where faces meet at a crease and
// where the depth bends, a pen that trembles a little, over the shading, all on parchment, with the compass's ring.

/** How many floats the map's uniform holds, in groups of four (see `mapFloats`). */
export const MAP_FLOATS = 40;

const UNIFORM = /* wgsl */ `
struct Map {
  turn: vec4f,      // cos yaw, sin yaw, cos pitch, sin pitch
  centre: vec4f,    // the view's middle (x east, y south, z up), its scale (device pixels a metre)
  paper: vec4f,     // the target's width and height (device pixels), whether every storey shows, the storeys' count
  cut: vec4f,       // the cut over a floor, the fade's start under the cut, its length, its least
  storey: vec4f,    // the storey looked at, the metres between storeys, a storey not looked at's strength, top floor
  grid: vec4f,      // a cell's metres, the columns, the rows, the depth's range (m)
  light: vec4f,     // the light's way, from the paper's upper left
  pen: vec4f,       // the tremble (px), the second line's reach (px), the paper's grain, -
  compass: vec4f,   // the compass's middle (px), its radius (px), the tilt's sine
  north: vec4f,     // the way north lies on the paper, the ring's line (px)
}
@group(0) @binding(0) var<uniform> map: Map;
`;

/** The first pass: faces into the shading targets. A cell's word: 1 walked or seen, 2 a flight's. */
export const MAP_FACES_SHADER = /* wgsl */ `
${UNIFORM}
@group(0) @binding(1) var<storage, read> cells: array<u32>;

struct Laid {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
}

@vertex fn faces_vertex(@location(0) position: vec3f, @location(1) normal: vec3f) -> Laid {
  let a = position.x - map.centre.x;
  let b = position.y - map.centre.y;
  let high = position.z - map.centre.z;
  let along = a * map.turn.y + b * map.turn.x;
  let u = (a * map.turn.x - b * map.turn.y) * map.centre.w;
  let v = (along * map.turn.w - high * map.turn.z) * map.centre.w;
  let near = along * map.turn.z + high * map.turn.w;
  var laid: Laid;
  laid.position = vec4f(u * 2.0 / map.paper.x, -v * 2.0 / map.paper.y, clamp(0.5 + near / map.grid.w, 0.0, 1.0), 1.0);
  laid.world = position;
  laid.normal = normal;
  return laid;
}

struct Shaded {
  @location(0) facing: vec4f,
  @location(1) kind: vec4f,
}

fn hash(point: vec2f) -> f32 { return fract(sin(dot(point, vec2f(127.1, 311.7))) * 43758.5453); }

// One course of flagstones a stone wide, each set half a stone over the last: how near a joint is (a line a pixel
// wide wherever the view puts it) for stones of side \`side\`, a pixel being \`pixel\` metres.
fn joint(at: vec2f, side: f32, pixel: f32) -> f32 {
  let laid = vec2f(at.x / side + 0.5 * (floor(at.y / side) % 2.0), at.y / side);
  let inside = fract(laid);
  let edge = min(min(inside.x, 1.0 - inside.x), min(inside.y, 1.0 - inside.y)) * side / max(pixel, 1e-5);
  return 1.0 - smoothstep(0.5, 1.35, edge);
}

@fragment fn faces_fragment(laid: Laid) -> Shaded {
  // A pixel's width in metres, read before any branch.
  let widths = fwidth(laid.world);
  let pixel = max(widths.x, widths.y);
  let normal = normalize(laid.normal);
  let toEye = vec3f(map.turn.y * map.turn.z, map.turn.x * map.turn.z, map.turn.w);
  if (dot(normal, toEye) < 0.0) { discard; }
  // The cell a face belongs to: a little into the room it faces, so a wall reads as its room's.
  let inside = laid.world + normal * 0.3;
  let count = map.paper.w;
  let storeyM = map.storey.y;
  let storey = clamp(ceil((map.storey.w - inside.z - 0.05) / storeyM), 0.0, count - 1.0);
  let column = floor(inside.x / map.grid.x);
  let row = floor(inside.y / map.grid.x);
  if (column < 0.0 || row < 0.0 || column >= map.grid.y || row >= map.grid.z) { discard; }
  let cell = cells[u32(storey * map.grid.y * map.grid.z + row * map.grid.y + column)];
  if ((cell & 1u) == 0u) { discard; }
  let flight = (cell & 2u) != 0u;
  let every = map.paper.z > 0.5;
  let cutOver = select(map.storey.x, storey, every);
  let cut = map.storey.w - cutOver * storeyM + map.cut.x;
  if (laid.world.z > cut && !(every && flight)) { discard; }
  let strength = select(1.0, map.storey.z, every && storey != map.storey.x);
  let fade = strength * mix(1.0, map.cut.w, clamp((cut - laid.world.z - map.cut.y) / map.cut.z, 0.0, 1.0));
  var shaded: Shaded;
  if (flight && abs(normal.z) < 0.342) {
    // A step's riser is part of its flight's slope: a faint wash, and no crease with its treads.
    shaded.facing = vec4f(0.5, 0.5, 1.0, 0.15);
    shaded.kind = vec4f(fade, 1.0, laid.position.z, 1.0);
    return shaded;
  }
  var tone = 0.18;
  var lead = 0.0;
  if (normal.z > 0.342) {
    // A floor: graphite, with flagstones; where a stone would be under ten pixels, courses of two, four... are laid.
    let level = max(0.0, log2(pixel / 0.1));
    let whole = floor(level);
    let between = level - whole;
    let small = joint(laid.world.xy, exp2(whole), pixel) / (1.0 + 0.45 * whole);
    let large = joint(laid.world.xy, exp2(whole + 1.0), pixel) / (1.0 + 0.45 * (whole + 1.0));
    let stone = floor(vec2f(laid.world.x + 0.5 * (floor(laid.world.y) % 2.0), laid.world.y));
    tone = 0.11 + 0.045 * hash(stone + 3.0) - 0.018 + 0.24 * mix(small, large, between);
    lead = 1.0;
  } else if (normal.z >= -0.6) {
    // A wall: washed by the light, with upright strokes on its shaded side.
    let lit = clamp(dot(normal, map.light.xyz) * 0.5 + 0.5, 0.0, 1.0);
    let along = normalize(vec2f(-normal.y, normal.x) + 1e-5);
    let stroke = dot(laid.world.xy, along) * 4.0 + hash(floor(vec2f(laid.world.z * 2.0, dot(laid.world.xy, along) * 4.0))) * 0.25;
    let hatch = (1.0 - smoothstep(0.06, 0.16, abs(fract(stroke) - 0.5) * 2.0 - 0.78)) * (1.0 - smoothstep(0.2, 0.55, lit));
    tone = 0.06 + 0.1 * (1.0 - lit) + hatch * 0.16;
  }
  shaded.facing = vec4f(normal * 0.5 + 0.5, clamp(tone, 0.02, 1.0));
  shaded.kind = vec4f(fade, lead, laid.position.z, 1.0);
  return shaded;
}
`;

/** The second pass: the ink and the shading over the parchment, and the compass. */
export const MAP_INK_SHADER = /* wgsl */ `
${UNIFORM}
@group(0) @binding(1) var facings: texture_2d<f32>;
@group(0) @binding(2) var kinds: texture_2d<f32>;

const INK = vec3f(58.0, 40.0, 22.0) / 255.0;
const LEAD = vec3f(74.0, 74.0, 80.0) / 255.0;
const PARCHMENT = vec3f(238.0, 222.0, 190.0) / 255.0;

@vertex fn ink_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

fn hash(point: vec2f) -> f32 { return fract(sin(dot(point, vec2f(12.9898, 78.233))) * 43758.5453); }
fn noise(point: vec2f) -> f32 {
  let whole = floor(point);
  let part = fract(point);
  let eased = part * part * (3.0 - 2.0 * part);
  return mix(mix(hash(whole), hash(whole + vec2f(1.0, 0.0)), eased.x),
             mix(hash(whole + vec2f(0.0, 1.0)), hash(whole + vec2f(1.0, 1.0)), eased.x), eased.y);
}

fn facingAt(at: vec2f) -> vec4f {
  let size = vec2f(textureDimensions(facings)) - 1.0;
  return textureLoad(facings, vec2i(clamp(at, vec2f(0.0), size)), 0);
}
fn kindAt(at: vec2f) -> vec4f {
  let size = vec2f(textureDimensions(kinds)) - 1.0;
  return textureLoad(kinds, vec2i(clamp(at, vec2f(0.0), size)), 0);
}
// How deep a pixel lies, in metres toward the eye.
fn depthAt(at: vec2f) -> f32 { return kindAt(at).z * map.grid.w; }

@fragment fn ink_fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  // The pen trembles: each pixel is read a little off where it is drawn, the same way for the same place.
  let tremble = (vec2f(noise(position.xy * 0.045), noise(position.xy * 0.045 + 31.7)) - 0.5) * map.pen.x;
  let at = position.xy + tremble;
  let facing = facingAt(at);
  let kind = kindAt(at);
  let here = kind.w > 0.0;
  var edge = 0.0;
  var edgeFade = select(0.0, kind.x, here);
  for (var each = 0; each < 8; each++) {
    let reach = select(map.pen.y, 1.0, each < 4);
    let side = each % 4;
    var step = vec2f(1.0, 0.0);
    if (side == 1) { step = vec2f(-1.0, 0.0); }
    if (side == 2) { step = vec2f(0.0, 1.0); }
    if (side == 3) { step = vec2f(0.0, -1.0); }
    let other = kindAt(at + step * reach);
    let there = other.w > 0.0;
    if (here != there) {
      edge = 1.0;
      edgeFade = max(edgeFade, select(0.0, other.x, there));
      continue;
    }
    if (!here) { continue; }
    let otherFacing = facingAt(at + step * reach);
    if (dot(facing.xyz * 2.0 - 1.0, otherFacing.xyz * 2.0 - 1.0) < 0.8) { edge = max(edge, 0.85); }
  }
  if (here) {
    // A bend in the depth (a step down, a wall standing before the floor) is inked; a plane, however steep, is not.
    let depth = depthAt(at);
    for (var each = 0; each < 2; each++) {
      let reach = select(map.pen.y, 1.0, each == 0);
      let across = depthAt(at - vec2f(reach, 0.0)) + depthAt(at + vec2f(reach, 0.0)) - 2.0 * depth;
      let down = depthAt(at - vec2f(0.0, reach)) + depthAt(at + vec2f(0.0, reach)) - 2.0 * depth;
      let acrossHere = kindAt(at - vec2f(reach, 0.0)).w > 0.0 && kindAt(at + vec2f(reach, 0.0)).w > 0.0;
      let downHere = kindAt(at - vec2f(0.0, reach)).w > 0.0 && kindAt(at + vec2f(0.0, reach)).w > 0.0;
      let bend = max(select(0.0, abs(across), acrossHere), select(0.0, abs(down), downHere));
      if (bend > 0.3) { edge = 1.0; }
    }
  }
  let tone = select(0.0, facing.w * kind.x, here);
  let lineInk = edge * 0.92 * max(edgeFade, 0.35);
  let wash = mix(INK, LEAD, select(0.0, kind.y, here));
  let grain = 1.0 - map.pen.z * (noise(position.xy * 0.35) - 0.5);
  var paper = PARCHMENT * grain;
  paper = paper * (1.0 - lineInk) * (1.0 - tone) + INK * lineInk + wash * tone * (1.0 - lineInk);
  // The compass: a ring turned and squashed with the view, its needle from the middle to the north, a dot at its tip.
  let offset = position.xy - map.compass.xy;
  let squash = max(map.compass.w, 0.05);
  let ring = abs(length(vec2f(offset.x, offset.y / squash)) - map.compass.z) * squash;
  let tip = map.north.xy * map.compass.z;
  let along = clamp(dot(offset, tip) / max(dot(tip, tip), 1e-5), 0.0, 1.0);
  let needle = length(offset - tip * along);
  let point = length(offset - tip) - map.north.z * 1.8;
  let compass = max(max(1.0 - smoothstep(map.north.z * 0.5, map.north.z * 0.5 + 1.0, ring),
                        1.0 - smoothstep(map.north.z * 0.6, map.north.z * 0.6 + 1.0, needle)),
                    1.0 - smoothstep(0.0, 1.0, point));
  return vec4f(mix(paper, INK, compass * 0.9), 1.0);
}
`;
