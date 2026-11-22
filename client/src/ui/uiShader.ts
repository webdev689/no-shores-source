// The interface's one shader: each quad a rectangle in device pixels, clipped in the vertex stage, filled with its
// colour, times the atlas's texel under it where it shows one: read by whole texels, never filtered, so a glyph's
// cells and a frame's pixels stay sharp. A turned quad (its tiling's third value, radians clockwise) is turned about
// its middle and clipped pixel by pixel instead. Out comes premultiplied colour, over the scene.

export const UI_SHADER = /* wgsl */ `
struct View { size: vec2f, pad: vec2f }
@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var atlas: texture_2d_array<f32>;

struct Quad {
  @location(0) box: vec4f,
  @location(1) texels: vec4f,
  @location(2) colour: vec4f,
  @location(3) clip: vec4f,
  @location(4) tiling: vec4f,
}

struct Out {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) box: vec4f,
  @location(2) @interpolate(flat) texels: vec4f,
  @location(3) @interpolate(flat) colour: vec4f,
  @location(4) @interpolate(flat) tiling: vec4f,
  @location(5) @interpolate(flat) clip: vec4f,
}

@vertex
fn vertex_main(@builtin(vertex_index) corner: u32, quad: Quad) -> Out {
  let along = vec2f(f32(corner & 1u), f32(corner >> 1u));
  var out: Out;
  var point: vec2f;
  if (quad.tiling.z == 0.0) {
    // The box cut to its clip; a quad clipped away draws nothing.
    let low = max(quad.box.xy, quad.clip.xy);
    let high = min(quad.box.xy + quad.box.zw, quad.clip.zw);
    let span = max(high - low, vec2f(0.0));
    point = low + along * span;
    out.clip = vec4f(-1e9, -1e9, 1e9, 1e9);
  } else {
    let middle = quad.box.xy + quad.box.zw * 0.5;
    let from_middle = (along - 0.5) * quad.box.zw;
    let turn = quad.tiling.z;
    let turned = vec2f(
      from_middle.x * cos(turn) - from_middle.y * sin(turn),
      from_middle.x * sin(turn) + from_middle.y * cos(turn),
    );
    point = middle + turned;
    out.clip = quad.clip;
  }
  out.position = vec4f(point.x / view.size.x * 2.0 - 1.0, 1.0 - point.y / view.size.y * 2.0, 0.0, 1.0);
  out.local = select(point - quad.box.xy, along * quad.box.zw, quad.tiling.z != 0.0);
  out.box = quad.box;
  out.texels = quad.texels;
  out.colour = quad.colour;
  out.tiling = quad.tiling;
  return out;
}

@fragment
fn fragment_main(in: Out) -> @location(0) vec4f {
  let pixel = in.position.xy;
  if (pixel.x < in.clip.x || pixel.y < in.clip.y || pixel.x >= in.clip.z || pixel.y >= in.clip.w) {
    discard;
  }
  var colour = in.colour;
  if (in.texels.z > 0.0) {
    var within: vec2f;
    if (in.tiling.x > 0.0) {
      // Tiled: a texel to every 'tiling.x' pixels, over and again.
      within = floor(in.local / in.tiling.x) % in.texels.zw;
    } else {
      // Stretched: the atlas rectangle laid over the whole box.
      within = min(floor(in.local * in.texels.zw / in.box.zw), in.texels.zw - 1.0);
    }
    colour = colour * textureLoad(atlas, vec2i(in.texels.xy + within), i32(in.tiling.y), 0);
  }
  return vec4f(colour.rgb * colour.a, colour.a);
}
`;
