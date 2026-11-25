// A scene's depth, kept many samples a pixel, averaged into one float a pixel: what is drawn over a finished picture
// (the blows' arcs, the see-through marks) and the light layer read it from.
import { type Gpu, viewOf } from '../gpu.ts';
import { perfZone } from '../perfMeter.ts';
import { SAMPLES } from '../water/waterView.ts';

export const DEPTH_COPY = /* wgsl */ `
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
  /** The copy's bind group for each depth it reads, made the first time. */
  private readonly groups = new WeakMap<GPUTexture, GPUBindGroup>();

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
    perfZone('depth');
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: viewOf(into), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
    });
    pass.setPipeline(this.pipeline);
    let group = this.groups.get(from);
    if (!group) {
      group = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: viewOf(from) }],
      });
      this.groups.set(from, group);
    }
    pass.setBindGroup(0, group);
    pass.draw(3);
    pass.end();
  }

  /** Records `reading` (what may read the copy) on `later`, an encoder submitted after `encoder`, and the copy on
   *  `encoder` only if `reading` began a pass: the copy reads every sample of the scene's depth, and on most frames
   *  nothing that reads it has anything to draw. */
  encodeIfRead(
    encoder: GPUCommandEncoder,
    later: GPUCommandEncoder,
    depths: { readonly from: GPUTexture; readonly into: GPUTexture },
    reading: () => void,
  ): void {
    const begin = later.beginRenderPass.bind(later);
    let read = false;
    later.beginRenderPass = (descriptor) => ((read = true), begin(descriptor));
    try {
      reading();
    } finally {
      later.beginRenderPass = begin;
    }
    if (read) this.encode(encoder, depths.from, depths.into);
  }
}
