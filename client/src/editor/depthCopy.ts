import { SAMPLES } from '../water/waterView.ts';

/** Copies the land's multisampled depth into one float a pixel, which the water's shaders can read. */
export const DEPTH_COPY = /* wgsl */ `
@group(0) @binding(0) var depths: texture_depth_multisampled_2d;

@vertex
fn copy_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}

// The mean of the pixel's samples: the depth at its centre on a slope. The nearest sample would sit far in front of
// it where the view grazes the ground, a pixel spanning hundreds of metres there.
@fragment
fn copy_fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var sum = 0.0;
  for (var sample = 0; sample < ${SAMPLES}; sample++) {
    sum += textureLoad(depths, vec2i(position.xy), sample);
  }
  return vec4f(sum / ${SAMPLES}.0, 0.0, 0.0, 1.0);
}
`;
