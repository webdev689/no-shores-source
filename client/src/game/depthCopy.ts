// A scene's depth, kept many samples a pixel, averaged into one float a pixel: what is drawn over a finished picture
// (the blows' arcs, the see-through marks) and the light layer read it from.
import type { Gpu } from '../gpu.ts';
import { SAMPLES } from '../water/waterView.ts';

const DEPTH_COPY = /* wgsl */ `
@group(0) @binding(0) var depths: texture_depth_multisampled_2d;
@vertex fn copy_vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let corner = vec2f(f32((index << 1u) & 2u), f32(index & 2u));
  return vec4f(corner * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn copy_fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  var sum = 0.0;
  for (var sample = 0; sample < ${SAMPLES}; sample++) { sum += textureLoad(depths, vec2i(position.xy), sample); }
  return vec4f(sum / ${SAMPLES}.0, 0.0, 0.0, 1.0);
}
`;

export class DepthCopy {
  private readonly device: GPUDevice;
  private readonly pipeline: GPURenderPipeline;

  constructor(gpu: Gpu) {
    this.device = gpu.device;
    const module = gpu.device.createShaderModule({ code: DEPTH_COPY });
    this.pipeline = gpu.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'copy_vertex' },
      fragment: { module, entryPoint: 'copy_fragment', targets: [{ format: 'r32float' }] },
    });
  }

  /** Writes the depth of `from` (many samples a pixel) into `into` (one float a pixel), averaged over its samples. */
  encode(encoder: GPUCommandEncoder, from: GPUTexture, into: GPUTexture): void {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: into.createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: from.createView() }],
      }),
    );
    pass.draw(3);
    pass.end();
  }
}
